package com.signage.receiver;

import android.app.Activity;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Color;
import android.net.ConnectivityManager;
import android.net.NetworkInfo;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;
import android.os.PowerManager;
import android.provider.Settings;
import android.content.Intent;
import android.net.Uri;
import android.util.Log;
import android.view.Gravity;
import android.view.KeyEvent;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.FrameLayout;
import android.widget.ImageView;
import android.widget.LinearLayout;
import android.widget.ScrollView;
import android.widget.TextView;
import androidx.media3.common.MediaItem;
import androidx.media3.common.PlaybackException;
import androidx.media3.common.Player;
import androidx.media3.exoplayer.ExoPlayer;
import androidx.media3.ui.PlayerView;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.BufferedInputStream;
import java.io.BufferedReader;
import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.HttpURLConnection;
import java.net.URL;
import java.net.URLEncoder;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

public class MainActivity extends Activity {
    private static final String TAG = "SignageReceiver";
    private static class MediaItem {
        final String url;
        final boolean isVideo;
        final boolean isWeb;
        final boolean isYouTube;
        final String youtubeUrl;
        MediaItem(String url, boolean isVideo, boolean isWeb, boolean isYouTube, String youtubeUrl) {
            this.url = url;
            this.isVideo = isVideo;
            this.isWeb = isWeb;
            this.isYouTube = isYouTube;
            this.youtubeUrl = youtubeUrl;
        }
    }
    private static final String PREFS = "signage_receiver";
    private static final int PAIRING_POLL_MS = 3000;
    private static final int PLAYLIST_POLL_MS = 5000;

    private final Handler handler = new Handler(Looper.getMainLooper());
    private final ExecutorService io = Executors.newSingleThreadExecutor();
    private final List<MediaItem> playlist = new ArrayList<>();

    private SharedPreferences prefs;
    private ImageView imageView;
    private WebView webView;
    private PlayerView playerView;
    private ExoPlayer exoPlayer;
    private boolean loopCurrentVideo = false;
    private boolean videoPlaying = false;
    private int currentIndex = 0;
    private String lastPlaylistSignature = "";
    private boolean activityActive = false;
    private TextView titleView;
    private TextView codeView;
    private TextView detailView;
    private TextView statusView;
    private LinearLayout panel;

    // Menu state
    private boolean menuVisible = false;
    private int menuHighlightIndex = 0;
    private LinearLayout menuPanel;
    private ScrollView menuScroll;
    private List<TextView> menuItemViews = new ArrayList<>();
    private View menuContainer;

    // Status fields
    private String networkStatus = "Checking...";
    private String pairStatus = "Unpaired";
    private String bootStatus = "Enabled";
    private String deviceId;
    private String pairingCode;
    private String deviceToken;
    private String serverUrl;
    private int slideDelayMs = 10000;
    private int imageCount = 0;
    private PowerManager.WakeLock wakeLock;
    private File cacheDir;

    private final Runnable pairingPoll = new Runnable() {
        @Override
        public void run() {
            if (!activityActive || hasToken()) {
                return;
            }
            pollPairing();
            handler.postDelayed(this, PAIRING_POLL_MS);
        }
    };

    private final Runnable playlistPoll = new Runnable() {
        @Override
        public void run() {
            if (!activityActive || !hasToken()) {
                return;
            }
            pollPlaylist();
            handler.postDelayed(this, PLAYLIST_POLL_MS);
        }
    };

    private final Runnable slideAdvance = new Runnable() {
        @Override
        public void run() {
            if (!activityActive) {
                return;
            }
            if (videoPlaying) {
                return;
            }
            showNextMedia();
            handler.postDelayed(this, Math.max(2000, slideDelayMs));
        }
    };

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        // Keep screen on and prevent sleep/screensaver
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        PowerManager pm = (PowerManager) getSystemService(Context.POWER_SERVICE);
        wakeLock = pm.newWakeLock(PowerManager.SCREEN_BRIGHT_WAKE_LOCK | PowerManager.ACQUIRE_CAUSES_WAKEUP,
                "Signage:ScreenWakeLock");
        wakeLock.acquire();

        serverUrl = trimTrailingSlash(BuildConfig.SIGNAGE_SERVER_URL);
        prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
        deviceId = prefs.getString("deviceId", null);
        if (deviceId == null) {
            deviceId = UUID.randomUUID().toString();
            prefs.edit().putString("deviceId", deviceId).apply();
        }
        pairingCode = prefs.getString("pairingCode", null);
        if (pairingCode == null) {
            pairingCode = newPairingCode();
            prefs.edit().putString("pairingCode", pairingCode).apply();
        }
        deviceToken = prefs.getString("deviceToken", null);
        cacheDir = new File(getFilesDir(), "image_cache");
        if (!cacheDir.exists()) cacheDir.mkdirs();
        updatePairStatus();
        buildUi();
    }

    @Override
    protected void onResume() {
        super.onResume();
        activityActive = true;
        if (!menuVisible) {
            enterImmersiveMode();
        }
        refreshSetupText();
        refreshStatusLabels();
        handler.post(pairingPoll);
        handler.post(playlistPoll);
        handler.post(slideAdvance);
    }

    @Override
    protected void onPause() {
        super.onPause();
        activityActive = false;
        handler.removeCallbacksAndMessages(null);
        if (exoPlayer != null) {
            exoPlayer.pause();
        }
    }

    @Override
    protected void onDestroy() {
        super.onDestroy();
        if (wakeLock != null && wakeLock.isHeld()) {
            wakeLock.release();
        }
        if (exoPlayer != null) {
            exoPlayer.release();
            exoPlayer = null;
        }
        io.shutdownNow();
    }

    private void buildUi() {
        FrameLayout root = new FrameLayout(this);
        root.setBackgroundColor(Color.rgb(13, 17, 23));

        imageView = new ImageView(this);
        imageView.setScaleType(ImageView.ScaleType.CENTER_CROP);
        imageView.setBackgroundColor(Color.BLACK);
        root.addView(imageView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        playerView = new PlayerView(this);
        playerView.setBackgroundColor(Color.BLACK);
        playerView.setUseController(false);
        root.addView(playerView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        playerView.setVisibility(View.GONE);

        webView = new WebView(this);
        webView.setBackgroundColor(Color.BLACK);
        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(true);
        ws.setDomStorageEnabled(true);
        ws.setLoadWithOverviewMode(true);
        ws.setUseWideViewPort(true);
        webView.setWebViewClient(new WebViewClient());
        root.addView(webView, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        webView.setVisibility(View.GONE);

        panel = new LinearLayout(this);
        panel.setOrientation(LinearLayout.VERTICAL);
        panel.setGravity(Gravity.CENTER);
        panel.setPadding(dp(48), dp(32), dp(48), dp(32));
        panel.setBackgroundColor(Color.argb(210, 13, 17, 23));

        titleView = makeText(30, Color.WHITE, true);
        codeView = makeText(72, Color.rgb(51, 214, 166), true);
        detailView = makeText(22, Color.rgb(230, 237, 243), false);
        statusView = makeText(18, Color.rgb(139, 148, 158), false);
        panel.addView(titleView);
        panel.addView(codeView);
        panel.addView(detailView);
        panel.addView(statusView);

        root.addView(panel, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));

        // Build the status menu panel (hidden by default)
        menuContainer = buildMenuContainer();
        root.addView(menuContainer, new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT,
                FrameLayout.LayoutParams.MATCH_PARENT
        ));
        menuContainer.setVisibility(View.GONE);

        setContentView(root);
    }

    private View buildMenuContainer() {
        FrameLayout container = new FrameLayout(this);
        container.setBackgroundColor(Color.argb(240, 13, 17, 23));
        container.setPadding(dp(24), dp(24), dp(24), dp(24));

        // Menu header
        TextView menuHeader = makeText(26, Color.rgb(51, 214, 166), true);
        menuHeader.setText("Signage Status");

        FrameLayout headerFrame = new FrameLayout(this);
        headerFrame.addView(menuHeader);
        FrameLayout.LayoutParams headerParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(40));
        headerParams.setMargins(0, 0, 0, dp(16));
        container.addView(headerFrame, headerParams);

        // Scrollable menu content
        menuPanel = new LinearLayout(this);
        menuPanel.setOrientation(LinearLayout.VERTICAL);
        menuPanel.setPadding(dp(16), 0, dp(16), dp(40));
        menuItemViews.clear();

        String[][] rows = {
                {"NETWORK", "network"},
                {"PAIR STATUS", "pair"},
                {"BOOT ON STARTUP", "boot"},
                {"BACKEND URL", "backend"},
                {"DEVICE ID", "device"},
                {"IMAGES IN PLAYLIST", "images"},
        };

        for (String[] row : rows) {
            LinearLayout rowLayout = new LinearLayout(this);
            rowLayout.setOrientation(LinearLayout.VERTICAL);
            rowLayout.setPadding(0, dp(10), 0, dp(10));

            TextView labelView = makeText(15, Color.rgb(100, 120, 140), false);
            labelView.setText(row[0]);
            labelView.setPadding(0, 0, 0, dp(2));

            TextView valueView = makeText(20, Color.WHITE, false);
            valueView.setText("Loading...");
            valueView.setTag(row[1]);

            rowLayout.addView(labelView);
            rowLayout.addView(valueView);
            menuPanel.addView(rowLayout);
            menuItemViews.add(valueView);

            View divider = new View(this);
            divider.setBackgroundColor(Color.argb(60, 255, 255, 255));
            LinearLayout.LayoutParams divParams = new LinearLayout.LayoutParams(
                    LinearLayout.LayoutParams.MATCH_PARENT, dp(1));
            divParams.setMargins(0, dp(4), 0, dp(4));
            menuPanel.addView(divider, divParams);
        }

        menuScroll = new ScrollView(this);
        menuScroll.addView(menuPanel);
        menuScroll.setVerticalScrollBarEnabled(false);

        FrameLayout.LayoutParams scrollParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(360));
        scrollParams.setMargins(0, dp(56), 0, 0);
        container.addView(menuScroll, scrollParams);

        // Hint bar
        TextView hintView = makeText(16, Color.rgb(100, 110, 120), false);
        hintView.setText("D-pad up/down to scroll  |  Back to close");
        FrameLayout.LayoutParams hintParams = new FrameLayout.LayoutParams(
                FrameLayout.LayoutParams.MATCH_PARENT, dp(32));
        hintParams.gravity = Gravity.BOTTOM;
        container.addView(hintView, hintParams);

        return container;
    }

    private void refreshStatusLabels() {
        setMenuItem("network", networkStatus);
        setMenuItem("pair", pairStatus);
        setMenuItem("boot", bootStatus);
        setMenuItem("backend", serverUrl);
        setMenuItem("device", deviceId != null ? deviceId.substring(0, 8) + "..." : "N/A");
        setMenuItem("images", imageCount + " image(s) loaded");
    }

    private void setMenuItem(String tag, String value) {
        for (TextView tv : menuItemViews) {
            if (tag.equals(tv.getTag())) {
                tv.setText(value);
                break;
            }
        }
    }

    @Override
    public boolean onKeyDown(int keyCode, KeyEvent event) {
        if (keyCode == KeyEvent.KEYCODE_MENU) {
            toggleMenu();
            return true;
        }

        if (menuVisible) {
            if (keyCode == KeyEvent.KEYCODE_DPAD_DOWN) {
                menuScroll.smoothScrollBy(0, dp(60));
                return true;
            } else if (keyCode == KeyEvent.KEYCODE_DPAD_UP) {
                menuScroll.smoothScrollBy(0, -dp(60));
                return true;
            } else if (keyCode == KeyEvent.KEYCODE_BACK || keyCode == KeyEvent.KEYCODE_ESCAPE) {
                closeMenu();
                return true;
            }
        }

        // Long-press Play/Pause also toggles menu
        if (keyCode == KeyEvent.KEYCODE_MEDIA_PLAY_PAUSE && event.getRepeatCount() > 0) {
            toggleMenu();
            return true;
        }

        return super.onKeyDown(keyCode, event);
    }

    private void toggleMenu() {
        if (menuVisible) {
            closeMenu();
        } else {
            showMenu();
        }
    }

    private void showMenu() {
        menuVisible = true;
        refreshStatusLabels();
        updateNetworkStatus();
        if (menuContainer != null) {
            menuContainer.setVisibility(View.VISIBLE);
        }
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private void closeMenu() {
        menuVisible = false;
        if (menuContainer != null) {
            menuContainer.setVisibility(View.GONE);
        }
        enterImmersiveMode();
    }

    private void updateNetworkStatus() {
        io.execute(() -> {
            boolean reachable = isServerReachable();
            networkStatus = reachable ? "Connected" : "Unreachable";
            runOnUiThread(this::refreshStatusLabels);
        });
    }

    private boolean isServerReachable() {
        try {
            HttpURLConnection conn = (HttpURLConnection) new URL(serverUrl + "/api/health").openConnection();
            conn.setConnectTimeout(3000);
            conn.setReadTimeout(3000);
            int code = conn.getResponseCode();
            conn.disconnect();
            return code == 200;
        } catch (Exception e) {
            return false;
        }
    }

    private void updatePairStatus() {
        if (hasToken()) {
            pairStatus = "Paired";
        } else {
            pairStatus = "Unpaired (code: " + pairingCode + ")";
        }
    }

    private TextView makeText(int sp, int color, boolean bold) {
        TextView text = new TextView(this);
        text.setTextColor(color);
        text.setTextSize(sp);
        text.setGravity(Gravity.CENTER);
        text.setIncludeFontPadding(true);
        if (bold) {
            text.setTypeface(android.graphics.Typeface.DEFAULT_BOLD);
        }
        text.setPadding(0, dp(4), 0, dp(4));
        return text;
    }

    private void refreshSetupText() {
        if (hasToken()) {
            titleView.setText("Signage receiver paired");
            codeView.setText("");
            detailView.setText("Waiting for images from the signage backend");
            statusView.setText("Device ID: " + deviceId);
        } else {
            titleView.setText("Enter this pairing code in the signage backend");
            codeView.setText(pairingCode);
            detailView.setText("Backend: " + serverUrl);
            statusView.setText("Device ID: " + deviceId);
        }
    }

    private void pollPairing() {
        io.execute(() -> {
            updateNetworkStatus();
            try {
                String name = Settings.Secure.getString(getContentResolver(), "bluetooth_name");
                if (name == null || name.trim().isEmpty()) {
                    name = "Fire TV Receiver";
                }
                String url = serverUrl + "/api/receiver/pairing/" + enc(pairingCode)
                        + "?deviceId=" + enc(deviceId)
                        + "&name=" + enc(name);
                JSONObject response = new JSONObject(httpGet(url));
                if (response.optBoolean("paired")) {
                    String token = response.getString("token");
                    deviceToken = token;
                    prefs.edit().putString("deviceToken", token).apply();
                    runOnUiThread(() -> {
                        updatePairStatus();
                        refreshSetupText();
                        refreshStatusLabels();
                        handler.post(playlistPoll);
                    });
                } else {
                    setStatus("Pairing code is active. Waiting for backend approval.");
                    updatePairStatus();
                }
            } catch (Exception e) {
                networkStatus = "Unreachable";
                setStatus("Pairing backend unreachable: " + e.getMessage());
            }
            runOnUiThread(this::refreshStatusLabels);
        });
    }

    private void pollPlaylist() {
        io.execute(() -> {
            updateNetworkStatus();
            try {
                String url = serverUrl + "/api/receiver/devices/" + enc(deviceId)
                        + "/playlist?token=" + enc(deviceToken);
                JSONObject response = new JSONObject(httpGet(url));
                int delaySeconds = Math.max(2, response.optInt("delaySeconds", 10));
                JSONArray images = response.optJSONArray("images");
                List<MediaItem> next = new ArrayList<>();
                if (images != null) {
                    for (int i = 0; i < images.length(); i++) {
                        JSONObject image = images.getJSONObject(i);
                        String type = image.optString("type", "");
                        String mediaUrl = image.optString("url", "");
                        String youtubeUrl = image.optString("youtubeUrl", "");
                        if ("youtube".equalsIgnoreCase(type) && !youtubeUrl.isEmpty()) {
                            next.add(new MediaItem("", false, false, true, youtubeUrl));
                        } else if ("web".equalsIgnoreCase(type)) {
                            String targetUrl = !image.optString("webUrl", "").isEmpty() ? image.optString("webUrl", "") : mediaUrl;
                            if (!targetUrl.isEmpty()) {
                                next.add(new MediaItem(targetUrl, false, true, false, ""));
                            }
                        } else if (!mediaUrl.isEmpty()) {
                            String fullUrl = resolveUrl(mediaUrl);
                            boolean isVideo = "video".equalsIgnoreCase(type) || isVideoUrl(fullUrl);
                            next.add(new MediaItem(fullUrl, isVideo, false, false, ""));
                        }
                    }
                }
                Log.i(TAG, "Playlist poll loaded items=" + next.size());
                final int count = next.size();
                runOnUiThread(() -> {
                    slideDelayMs = delaySeconds * 1000;
                    String nextSignature = playlistSignature(next);
                    boolean playlistChanged = !nextSignature.equals(lastPlaylistSignature);
                    lastPlaylistSignature = nextSignature;
                    playlist.clear();
                    playlist.addAll(next);
                    // If loop conditions changed while a video is in progress, apply immediately.
                    if (exoPlayer != null && videoPlaying) {
                        boolean shouldLoopNow = playlist.size() == 1 && playlist.get(0).isVideo;
                        loopCurrentVideo = shouldLoopNow;
                        exoPlayer.setRepeatMode(shouldLoopNow ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
                    }
                    imageCount = count;
                    refreshStatusLabels();
                    if (playlist.isEmpty()) {
                        imageView.setImageBitmap(null);
                        refreshSetupText();
                        setStatus("Paired. No playlist images have been uploaded yet.");
                        panel.setVisibility(View.VISIBLE);
                    } else {
                        titleView.setText("");
                        codeView.setText("");
                        detailView.setText("");
                        statusView.setText("");
                        panel.setVisibility(View.GONE);
                        if (playlistChanged) {
                            // Live/playlist changes should interrupt current playback immediately.
                            currentIndex = 0;
                            interruptForPlaylistUpdate();
                        }
                    }
                });
            } catch (Exception e) {
                setStatus("Playlist sync failed: " + e.getMessage());
            }
        });
    }

    private void interruptForPlaylistUpdate() {
        handler.removeCallbacks(slideAdvance);
        videoPlaying = false;
        loopCurrentVideo = false;
        if (exoPlayer != null) {
            exoPlayer.stop();
            exoPlayer.clearMediaItems();
        }
        showNextMedia();
        handler.postDelayed(slideAdvance, Math.max(2000, slideDelayMs));
    }

    private String playlistSignature(List<MediaItem> items) {
        StringBuilder out = new StringBuilder();
        for (MediaItem item : items) {
            out.append(item.isYouTube ? "yt:" + item.youtubeUrl : item.url)
                    .append("|")
                    .append(item.isVideo ? "v" : "i")
                    .append(";");
        }
        return out.toString();
    }

    private void showNextMedia() {
        if (playlist.isEmpty()) {
            return;
        }
        MediaItem item = playlist.get(currentIndex % playlist.size());
        currentIndex = (currentIndex + 1) % playlist.size();
        Log.i(TAG, "showNextMedia isVideo=" + item.isVideo + " isWeb=" + item.isWeb + " isYouTube=" + item.isYouTube + " url=" + item.url + " youtubeUrl=" + item.youtubeUrl);
        if (item.isYouTube) {
            playYouTube(item.youtubeUrl, playlist.size() == 1);
        } else if (item.isWeb) {
            showWeb(item.url);
        } else if (item.isVideo) {
            boolean shouldLoop = playlist.size() == 1;
            playVideo(item.url, shouldLoop);
        } else {
            showImage(item.url);
        }
    }

    private boolean isVideoUrl(String url) {
        String lower = url.toLowerCase();
        return lower.endsWith(".mp4") || lower.endsWith(".mkv") || lower.endsWith(".avi")
                || lower.endsWith(".mov") || lower.endsWith(".webm") || lower.endsWith(".3gp");
    }

    private void showImage(String url) {
        videoPlaying = false;
        imageView.setVisibility(View.VISIBLE);
        webView.setVisibility(View.GONE);
        playerView.setVisibility(View.GONE);
        if (exoPlayer != null) {
            exoPlayer.stop();
            exoPlayer.clearMediaItems();
        }
        io.execute(() -> {
            try {
                Bitmap bitmap = downloadBitmap(url);
                runOnUiThread(() -> imageView.setImageBitmap(bitmap));
            } catch (Exception e) {
                setStatus("Image load failed: " + e.getMessage());
            }
        });
    }

    private void playVideo(String url, boolean shouldLoop) {
        handler.removeCallbacks(slideAdvance);
        imageView.setVisibility(View.GONE);
        webView.setVisibility(View.GONE);
        playerView.setVisibility(View.VISIBLE);
        videoPlaying = true;
        loopCurrentVideo = shouldLoop;
        setStatus("Preparing video...");
        Log.i(TAG, "playVideo start url=" + url + " shouldLoop=" + shouldLoop);
        io.execute(() -> {
            try {
                File localVideo = ensureVideoCached(url);
                Log.i(TAG, "playVideo cached path=" + localVideo.getAbsolutePath() + " size=" + localVideo.length());
                runOnUiThread(() -> startVideoPlayback(localVideo.getAbsolutePath()));
            } catch (Exception e) {
                Log.e(TAG, "playVideo failed", e);
                setStatus("Video load failed: " + e.getMessage());
                runOnUiThread(() -> {
                    videoPlaying = false;
                    handler.postDelayed(this::showNextMedia, 1000);
                    handler.postDelayed(slideAdvance, Math.max(2000, slideDelayMs));
                });
            }
        });
    }

    private void playYouTube(String youtubeUrl, boolean shouldLoop) {
        handler.removeCallbacks(slideAdvance);
        imageView.setVisibility(View.GONE);
        webView.setVisibility(View.GONE);
        playerView.setVisibility(View.VISIBLE);
        videoPlaying = true;
        loopCurrentVideo = shouldLoop;
        setStatus("Resolving YouTube stream...");
        io.execute(() -> {
            try {
                String streamMetaUrl = serverUrl + "/api/admin/youtube/stream?url=" + enc(youtubeUrl);
                JSONObject streamMeta = new JSONObject(httpGet(streamMetaUrl));
                String streamUrl = streamMeta.optString("streamUrl", "");
                if (streamUrl.isEmpty()) {
                    throw new IllegalStateException("No playable stream URL returned.");
                }
                runOnUiThread(() -> startStreamPlayback(streamUrl));
            } catch (Exception e) {
                setStatus("YouTube load failed: " + e.getMessage());
                runOnUiThread(() -> {
                    videoPlaying = false;
                    handler.postDelayed(this::showNextMedia, 1200);
                    handler.postDelayed(slideAdvance, Math.max(2000, slideDelayMs));
                });
            }
        });
    }

    private void showWeb(String url) {
        Log.i(TAG, "showWeb url=" + url);
        videoPlaying = false;
        imageView.setVisibility(View.GONE);
        playerView.setVisibility(View.GONE);
        webView.setVisibility(View.VISIBLE);
        if (exoPlayer != null) {
            exoPlayer.stop();
            exoPlayer.clearMediaItems();
        }
        webView.loadUrl(url);
        setStatus("Showing web page...");
    }

    private void startVideoPlayback(String localPath) {
        startStreamPlayback(Uri.fromFile(new File(localPath)).toString());
    }

    private void startStreamPlayback(String streamUri) {
        if (exoPlayer == null) {
            exoPlayer = new ExoPlayer.Builder(this).build();
            exoPlayer.addListener(new Player.Listener() {
                @Override
                public void onPlaybackStateChanged(int playbackState) {
                    if (playbackState == Player.STATE_ENDED) {
                        if (loopCurrentVideo) {
                            return;
                        }
                        videoPlaying = false;
                        handler.post(MainActivity.this::showNextMedia);
                        handler.postDelayed(slideAdvance, Math.max(2000, slideDelayMs));
                    }
                }

                @Override
                public void onPlayerError(PlaybackException error) {
                    setStatus("Video error: " + error.getMessage());
                    videoPlaying = false;
                    handler.postDelayed(MainActivity.this::showNextMedia, 1000);
                    handler.postDelayed(slideAdvance, Math.max(2000, slideDelayMs));
                }
            });
            playerView.setPlayer(exoPlayer);
        }
        exoPlayer.setRepeatMode(loopCurrentVideo ? Player.REPEAT_MODE_ONE : Player.REPEAT_MODE_OFF);
        exoPlayer.setMediaItem(androidx.media3.common.MediaItem.fromUri(Uri.parse(streamUri)));
        exoPlayer.prepare();
        exoPlayer.play();
        setStatus("Playing video...");
    }

    private File ensureVideoCached(String url) throws Exception {
        String ext = videoExtension(url);
        File cached = new File(cacheDir, cacheKey(url) + ext);
        if (cached.exists() && cached.length() > 0) {
            Log.i(TAG, "ensureVideoCached hit cache key=" + cached.getName());
            return cached;
        }
        Log.i(TAG, "ensureVideoCached downloading url=" + url);
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(8000);
        conn.setReadTimeout(30000);
        conn.setUseCaches(true);
        InputStream input = null;
        FileOutputStream output = null;
        try {
            input = new BufferedInputStream(conn.getInputStream());
            output = new FileOutputStream(cached);
            byte[] buffer = new byte[64 * 1024];
            int read;
            while ((read = input.read(buffer)) != -1) {
                output.write(buffer, 0, read);
            }
            output.flush();
            return cached;
        } catch (Exception e) {
            if (cached.exists()) {
                // Remove partial files so future attempts can retry cleanly.
                //noinspection ResultOfMethodCallIgnored
                cached.delete();
            }
            throw e;
        } finally {
            if (output != null) { try { output.close(); } catch (Exception ignored) {} }
            if (input != null) { try { input.close(); } catch (Exception ignored) {} }
            conn.disconnect();
        }
    }

    private String videoExtension(String url) {
        String lower = url.toLowerCase();
        if (lower.endsWith(".webm")) return ".webm";
        if (lower.endsWith(".mkv")) return ".mkv";
        if (lower.endsWith(".avi")) return ".avi";
        if (lower.endsWith(".mov")) return ".mov";
        if (lower.endsWith(".3gp")) return ".3gp";
        return ".mp4";
    }

    private Bitmap downloadBitmap(String url) throws Exception {
        // Try local cache first
        File cached = new File(cacheDir, cacheKey(url));
        if (cached.exists()) {
            Bitmap bmp = BitmapFactory.decodeFile(cached.getPath());
            if (bmp != null) return bmp;
        }
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(15000);
        conn.setUseCaches(true);
        InputStream input = null;
        try {
            input = new BufferedInputStream(conn.getInputStream());
            Bitmap bmp = BitmapFactory.decodeStream(input);
            if (bmp != null) saveToCache(cacheKey(url), bmp);
            return bmp;
        } finally {
            if (input != null) { try { input.close(); } catch (Exception ignored) {} }
            conn.disconnect();
        }
    }

    private String cacheKey(String url) {
        try {
            MessageDigest md = MessageDigest.getInstance("MD5");
            byte[] digest = md.digest(url.getBytes(StandardCharsets.UTF_8));
            StringBuilder hex = new StringBuilder();
            for (byte b : digest) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (Exception e) {
            return String.valueOf(url.hashCode());
        }
    }

    private void saveToCache(String key, Bitmap bmp) {
        try {
            File f = new File(cacheDir, key);
            FileOutputStream fos = new FileOutputStream(f);
            bmp.compress(Bitmap.CompressFormat.PNG, 90, fos);
            fos.close();
        } catch (Exception ignored) {}
    }

    private String httpGet(String url) throws Exception {
        HttpURLConnection conn = (HttpURLConnection) new URL(url).openConnection();
        conn.setConnectTimeout(5000);
        conn.setReadTimeout(10000);
        conn.setRequestProperty("Accept", "application/json");
        BufferedReader reader = null;
        try {
            reader = new BufferedReader(new InputStreamReader(conn.getInputStream(), StandardCharsets.UTF_8));
            StringBuilder out = new StringBuilder();
            String line;
            while ((line = reader.readLine()) != null) {
                out.append(line);
            }
            return out.toString();
        } finally {
            if (reader != null) { try { reader.close(); } catch (Exception ignored) {} }
            conn.disconnect();
        }
    }

    private boolean hasToken() {
        return deviceToken != null && !deviceToken.isEmpty();
    }

    private String resolveUrl(String imageUrl) {
        if (imageUrl.startsWith("http://") || imageUrl.startsWith("https://")) {
            return imageUrl;
        }
        if (imageUrl.startsWith("/")) {
            return serverUrl + imageUrl;
        }
        return serverUrl + "/" + imageUrl;
    }

    private void setStatus(String message) {
        runOnUiThread(() -> {
            if (!menuVisible) {
                statusView.setText(message);
            }
        });
    }

    private void enterImmersiveMode() {
        getWindow().getDecorView().setSystemUiVisibility(
                View.SYSTEM_UI_FLAG_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY
                        | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                        | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                        | View.SYSTEM_UI_FLAG_LAYOUT_STABLE
        );
    }

    private String newPairingCode() {
        char[] alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789".toCharArray();
        SecureRandom random = new SecureRandom();
        StringBuilder code = new StringBuilder();
        for (int i = 0; i < 6; i++) {
            code.append(alphabet[random.nextInt(alphabet.length)]);
        }
        return code.toString();
    }

    private int dp(int value) {
        return (int) (value * getResources().getDisplayMetrics().density);
    }

    private String trimTrailingSlash(String input) {
        if (input.endsWith("/")) {
            return input.substring(0, input.length() - 1);
        }
        return input;
    }

    private String enc(String value) {
        try {
            return URLEncoder.encode(value == null ? "" : value, "UTF-8");
        } catch (java.io.UnsupportedEncodingException e) {
            return "";
        }
    }
}
