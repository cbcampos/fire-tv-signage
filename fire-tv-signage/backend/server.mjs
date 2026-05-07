import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(process.env.SIGNAGE_DATA_DIR || path.join(__dirname, "data"));
const UPLOAD_DIR = path.resolve(process.env.SIGNAGE_UPLOAD_DIR || path.join(DATA_DIR, "uploads"));
const PUBLIC_DIR = path.join(__dirname, "public");
const DB_PATH = path.join(DATA_DIR, "db.json");
const PORT = Number(process.env.PORT || 3002);
const HOST = process.env.HOST || "0.0.0.0";
const PUBLIC_BASE_URL = process.env.PUBLIC_BASE_URL || "";
const YTDLP_BIN = process.env.YTDLP_BIN || "yt-dlp";

fs.mkdirSync(DATA_DIR, { recursive: true });
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

let db = loadDb();

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, publicBase(req));
    if (url.pathname.startsWith("/api/")) {
      await routeApi(req, res, url);
      return;
    }
    if (url.pathname.startsWith("/uploads/")) {
      const uploadName = decodeURIComponent(url.pathname.replace(/^\/uploads\//, ""));
      const filePath = path.join(UPLOAD_DIR, uploadName);
      const rangeHeader = req.headers["range"];
      if (rangeHeader) {
        const parts = rangeHeader.replace(/^bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : undefined;
        serveFile(res, filePath, start, end);
      } else {
        serveFile(res, filePath);
      }
      return;
    }
    serveStatic(res, url.pathname);
  } catch (error) {
    sendJson(res, 500, { error: error.message });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Signage backend listening on http://${HOST}:${PORT}`);
  console.log(`Runtime data: ${DATA_DIR}`);
});

async function routeApi(req, res, url) {
  const parts = url.pathname.split("/").filter(Boolean);

  if (req.method === "GET" && parts[1] === "health") {
    sendJson(res, 200, {
      ok: true,
      devices: Object.keys(db.devices).length,
      pendingPairings: Object.values(db.pairingCodes).filter((pairing) => !pairing.paired).length
    });
    return;
  }


  // ── Weather proxy (wttr.in) ──────────────────────────────────────────
  if (req.method === "GET" && parts[1] === "weather") {
    const city = String(url.searchParams.get("city") || "Birmingham,AL").trim();
    try {
      const response = await fetch(`https://wttr.in/${encodeURIComponent(city)}?format=j1`, {
        signal: AbortSignal.timeout(8000)
      });
      if (!response.ok) throw new Error(`wttr.in returned ${response.status}`);
      const data = await response.json();
      // Normalize current conditions
      const current = data.current_condition[0];
      const nearest = data.nearest_area?.[0];
      const areaName = nearest?.areaName?.[0]?.value || city;
      const region = nearest?.region?.[0]?.value || "";
      const country = nearest?.country?.[0]?.value || "";
      const location = [areaName, region, country].filter(Boolean).join(", ");
      // Normalize forecast (next 7 days)
      const weatherforecast = data.weather || [];
      const days = (weatherforecast[0]?.hourly || []).length > 0
        ? [{ date: weatherforecast[0].date, maxTempF: weatherforecast[0].maxtempF, minTempF: weatherforecast[0].mintempF, weatherCode: weatherforecast[0].hourly?.[4]?.weatherCode || 116 }]
        : [];
      // If we have multi-day forecast data
      if (weatherforecast.length >= 2) {
        days.length = 0;
        for (let i = 0; i < Math.min(7, weatherforecast.length); i++) {
          const w = weatherforecast[i];
          days.push({
            date: w.date,
            maxTempF: parseFloat(w.maxtempF),
            minTempF: parseFloat(w.mintempF),
            weatherCode: w.hourly?.[4]?.weatherCode || w.hourly?.[0]?.weatherCode || 116
          });
        }
      }
      sendJson(res, 200, {
        location,
        tempF: parseInt(current.temp_F),
        feelsLikeF: parseInt(current.FeelsLikeF),
        condition: current.weatherDesc?.[0]?.value || "Unknown",
        weatherCode: parseInt(current.weatherCode),
        humidity: parseInt(current.humidity),
        windmph: parseInt(current.windspeedMiles),
        windDir: current.winddir16Point || "",
        uvIndex: parseInt(current.uvIndex),
        visibility: parseInt(current.visibilityMiles),
        pressure: parseFloat(current.pressureInches),
        cloudcover: parseInt(current.cloudcover),
        forecast: days.slice(0, 7)
      });
    } catch (err) {
      console.error("Weather error:", err.message);
      sendJson(res, 502, { error: "Weather service unavailable", detail: err.message });
    }
    return;
  }


  if (req.method === "GET" && parts[1] === "receiver" && parts[2] === "pairing" && parts[3]) {
    handleReceiverPairing(req, res, url, parts[3]);
    return;
  }

  if (req.method === "GET" && parts[1] === "receiver" && parts[2] === "devices" && parts[3] && parts[4] === "playlist") {
    handleReceiverPlaylist(req, res, url, parts[3]);
    return;
  }

  if (req.method === "GET" && parts[1] === "admin" && parts[2] === "state") {
    sendJson(res, 200, adminState(req));
    return;
  }

  // ── Named playlists ─────────────────────────────────────────────────────
  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "playlists" && !parts[3]) {
    const body = await readJson(req);
    const name = String(body.name || "Untitled playlist").trim().slice(0, 120) || "Untitled playlist";
    const playlist = {
      id: crypto.randomUUID(),
      name,
      items: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    db.playlists.push(playlist);
    saveDb();
    sendJson(res, 200, { ok: true, playlist });
    return;
  }

  if (req.method === "PATCH" && parts[1] === "admin" && parts[2] === "playlists" && parts[3] && !parts[4]) {
    const playlist = findPlaylist(parts[3]);
    if (!playlist) { sendJson(res, 404, { error: "Playlist not found." }); return; }
    const body = await readJson(req);
    if (body.name !== undefined) playlist.name = String(body.name).trim().slice(0, 120) || playlist.name;
    playlist.updatedAt = new Date().toISOString();
    saveDb();
    sendJson(res, 200, { ok: true, playlist });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "playlists" && parts[3] && !parts[4]) {
    const idx = db.playlists.findIndex((playlist) => playlist.id === parts[3]);
    if (idx === -1) { sendJson(res, 404, { error: "Playlist not found." }); return; }
    const [playlist] = db.playlists.splice(idx, 1);
    for (const device of Object.values(db.devices)) {
      if (device.activePlaylistId === playlist.id) device.activePlaylistId = null;
    }
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "playlists" && parts[3] && parts[4] === "items" && !parts[5]) {
    const playlist = findPlaylist(parts[3]);
    if (!playlist) { sendJson(res, 404, { error: "Playlist not found." }); return; }
    const body = await readJson(req, 30 * 1024 * 1024);
    const item = saveDataUrlImage(body.name, body.dataUrl);
    playlist.items.push(item);
    playlist.updatedAt = new Date().toISOString();
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "playlists" && parts[3] && parts[4] === "items" && parts[5] === "from-library") {
    const playlist = findPlaylist(parts[3]);
    if (!playlist) { sendJson(res, 404, { error: "Playlist not found." }); return; }
    const body = await readJson(req);
    const libraryItem = db.library.find((entry) => entry.id === body.libraryItemId);
    if (!libraryItem) { sendJson(res, 404, { error: "Library item not found." }); return; }
    const item = {
      id: crypto.randomUUID(),
      name: libraryItem.name,
      path: libraryItem.path,
      isVideo: libraryItem.type === "video",
      isYouTube: libraryItem.type === "youtube",
      youtubeUrl: libraryItem.youtubeUrl || null,
      delaySeconds: null,
      createdAt: new Date().toISOString()
    };
    playlist.items.push(item);
    playlist.updatedAt = new Date().toISOString();
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "playlists" && parts[3] && parts[4] === "items" && parts[5] === "copy") {
    const targetPlaylist = findPlaylist(parts[3]);
    if (!targetPlaylist) { sendJson(res, 404, { error: "Target playlist not found." }); return; }
    const body = await readJson(req);
    let sourceItem = null;
    if (body.sourcePlaylistId) {
      const sourcePlaylist = findPlaylist(body.sourcePlaylistId);
      if (!sourcePlaylist) { sendJson(res, 404, { error: "Source playlist not found." }); return; }
      sourceItem = sourcePlaylist.items.find((entry) => entry.id === body.sourceItemId);
    } else if (body.sourceDeviceId) {
      const sourceDevice = db.devices[body.sourceDeviceId];
      if (!sourceDevice) { sendJson(res, 404, { error: "Source device not found." }); return; }
      sourceItem = (sourceDevice.images || []).find((entry) => entry.id === body.sourceItemId);
    } else {
      sendJson(res, 400, { error: "sourcePlaylistId or sourceDeviceId is required." });
      return;
    }
    if (!sourceItem) { sendJson(res, 404, { error: "Source item not found." }); return; }
    const item = {
      ...sourceItem,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    targetPlaylist.items.push(item);
    targetPlaylist.updatedAt = new Date().toISOString();
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "playlists" && parts[3] && parts[4] === "youtube") {
    const playlist = findPlaylist(parts[3]);
    if (!playlist) { sendJson(res, 404, { error: "Playlist not found." }); return; }
    const body = await readJson(req);
    const youtubeUrl = String(body.youtubeUrl || "").trim();
    if (!youtubeUrl.match(/youtube\.com|youtu\.be/)) {
      sendJson(res, 400, { error: "Valid YouTube URL required." });
      return;
    }
    try {
      await extractPlayableYouTubeStream(youtubeUrl);
    } catch (error) {
      sendJson(res, 400, { error: `YouTube URL is not playable: ${error.message}` });
      return;
    }
    const item = {
      id: crypto.randomUUID(),
      name: String(body.name || "YouTube Video").trim().slice(0, 120) || "YouTube Video",
      youtubeUrl,
      isYouTube: true,
      delaySeconds: null,
      createdAt: new Date().toISOString()
    };
    playlist.items.push(item);
    playlist.updatedAt = new Date().toISOString();
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "PATCH" && parts[1] === "admin" && parts[2] === "playlists" && parts[3] && parts[4] === "items" && parts[5]) {
    const playlist = findPlaylist(parts[3]);
    if (!playlist) { sendJson(res, 404, { error: "Playlist not found." }); return; }
    const item = playlist.items.find((entry) => entry.id === parts[5]);
    if (!item) { sendJson(res, 404, { error: "Playlist item not found." }); return; }
    const body = await readJson(req);
    if (body.name !== undefined) item.name = String(body.name).trim().slice(0, 120) || item.name;
    if (body.delaySeconds !== undefined) item.delaySeconds = body.delaySeconds === null ? null : clamp(Number(body.delaySeconds), 2, 3600);
    playlist.updatedAt = new Date().toISOString();
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "playlists" && parts[3] && parts[4] === "items" && parts[5] === "reorder") {
    const playlist = findPlaylist(parts[3]);
    if (!playlist) { sendJson(res, 404, { error: "Playlist not found." }); return; }
    const body = await readJson(req);
    if (!Array.isArray(body.order)) { sendJson(res, 400, { error: "order must be an array of item ids" }); return; }
    const reorderMap = new Map(body.order.map((id, i) => [id, i]));
    playlist.items.sort((a, b) => (reorderMap.get(a.id) ?? 999) - (reorderMap.get(b.id) ?? 999));
    playlist.updatedAt = new Date().toISOString();
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "playlists" && parts[3] && parts[4] === "items" && parts[5]) {
    const playlist = findPlaylist(parts[3]);
    if (!playlist) { sendJson(res, 404, { error: "Playlist not found." }); return; }
    playlist.items = playlist.items.filter((item) => item.id !== parts[5]);
    playlist.updatedAt = new Date().toISOString();
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "pair") {
    const body = await readJson(req);
    const code = cleanPairingCode(body.code);
    if (!code) {
      sendJson(res, 400, { error: "Pairing code is required." });
      return;
    }
    const label = String(body.label || "Fire TV Signage").trim();
    const existing = db.pairingCodes[code] || {};
    db.pairingCodes[code] = {
      ...existing,
      code,
      label,
      paired: true,
      token: existing.token || token(),
      approvedAt: new Date().toISOString()
    };
    saveDb();
    sendJson(res, 200, { ok: true, code });
    return;
  }

  // ── Add YouTube video to device ────────────────────────────────────────
  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "youtube") {
    const body = await readJson(req);
    const { youtubeUrl, name } = body || {};
    if (!youtubeUrl || !youtubeUrl.match(/youtube\.com|youtu\.be/)) {
      sendJson(res, 400, { error: "Valid YouTube URL required." });
      return;
    }
    try {
      await extractPlayableYouTubeStream(String(youtubeUrl).trim());
    } catch (error) {
      sendJson(res, 400, { error: `YouTube URL is not playable: ${error.message}` });
      return;
    }
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    // Create a placeholder entry with the YouTube URL
    const id = crypto.randomUUID();
    const videoEntry = {
      id,
      name: name || "YouTube Video",
      youtubeUrl,
      isYouTube: true,
      createdAt: new Date().toISOString()
    };
    if (!device.videos) device.videos = [];
    device.videos.push(videoEntry);
    saveDb();
    sendJson(res, 200, { ok: true, video: videoEntry });
    return;
  }

  // ── Remove video from device ─────────────────────────────────────────────
  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "youtube" && parts[5]) {
    const videoId = parts[5];
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    if (!device.videos) { sendJson(res, 404, { error: "Video not found." }); return; }
    const idx = device.videos.findIndex(v => v.id === videoId);
    if (idx === -1) { sendJson(res, 404, { error: "Video not found." }); return; }
    device.videos.splice(idx, 1);
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  // ── Library ────────────────────────────────────────────────────────────────
  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "library" && !parts[3]) {
    const body = await readJson(req, 30 * 1024 * 1024);
    if (!body.dataUrl) { sendJson(res, 400, { error: "dataUrl required" }); return; }
    const image = saveDataUrlImage(body.name || "library-item", body.dataUrl);
    const item = {
      id: image.id,
      name: image.name,
      type: image.isVideo ? "video" : "image",
      tags: Array.isArray(body.tags) ? body.tags : [],
      path: image.path,
      size: fs.statSync(path.join(UPLOAD_DIR, `${image.id}.${image.path.split(".").pop()}`)).size,
      addedAt: new Date().toISOString()
    };
    db.library.push(item);
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "library" && parts[3] === "youtube") {
    const body = await readJson(req);
    const youtubeUrl = String(body.youtubeUrl || "").trim();
    if (!youtubeUrl.match(/youtube\.com|youtu\.be/)) {
      sendJson(res, 400, { error: "Valid YouTube URL required." });
      return;
    }
    try {
      await extractPlayableYouTubeStream(youtubeUrl);
    } catch (error) {
      sendJson(res, 400, { error: `YouTube URL is not playable: ${error.message}` });
      return;
    }
    const item = {
      id: crypto.randomUUID(),
      name: String(body.name || "YouTube Video").trim().slice(0, 120) || "YouTube Video",
      type: "youtube",
      youtubeUrl,
      tags: Array.isArray(body.tags) ? body.tags : [],
      addedAt: new Date().toISOString()
    };
    db.library.push(item);
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "library" && parts[3]) {
    const id = parts[3];
    const idx = db.library.findIndex((i) => i.id === id);
    if (idx === -1) { sendJson(res, 404, { error: "Not found" }); return; }
    const item = db.library[idx];
    // Remove actual file
    if (item.path) {
      try {
        const filePath = path.join(UPLOAD_DIR, path.basename(item.path));
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      } catch {}
    }
    db.library.splice(idx, 1);
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "GET" && parts[1] === "admin" && parts[2] === "library" && parts[3]) {
    const item = db.library.find((i) => i.id === parts[3]);
    if (!item) { sendJson(res, 404, { error: "Not found" }); return; }
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "PATCH" && parts[1] === "admin" && parts[2] === "library" && parts[3]) {
    const item = db.library.find((i) => i.id === parts[3]);
    if (!item) { sendJson(res, 404, { error: "Not found" }); return; }
    const body = await readJson(req);
    if (body.name !== undefined) {
      const nextName = String(body.name || "").trim().slice(0, 120);
      if (!nextName) { sendJson(res, 400, { error: "name is required" }); return; }
      item.name = nextName;
    }
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  // ── YouTube stream proxy ────────────────────────────────────────────────
  if (req.method === "GET" && parts[1] === "admin" && parts[2] === "youtube" && parts[3] === "stream") {
    const youtubeUrl = String(url.searchParams.get("url") || "").trim();
    if (!youtubeUrl) { sendJson(res, 400, { error: "url parameter required" }); return; }
    if (!youtubeUrl.match(/youtube\.com|youtu\.be/)) { sendJson(res, 400, { error: "Invalid YouTube URL" }); return; }
    try {
      const result = await extractPlayableYouTubeStream(youtubeUrl);
      sendJson(res, 200, result);
    } catch (error) {
      sendJson(res, 502, { error: "Failed to extract YouTube stream", detail: error.message });
    }
    return;
  }

  if (req.method === "PATCH" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && !parts[4]) {
    const body = await readJson(req);
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    if (body.label !== undefined) device.label = String(body.label).trim() || device.label;
    if (body.location !== undefined) device.location = String(body.location).trim();
    if (body.delaySeconds !== undefined) device.delaySeconds = clamp(Number(body.delaySeconds), 2, 3600);
    saveDb();
    sendJson(res, 200, { ok: true, device });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "live") {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    const body = await readJson(req);
    const playlistId = body.playlistId ? String(body.playlistId) : null;
    if (playlistId && !findPlaylist(playlistId)) {
      sendJson(res, 404, { error: "Playlist not found." });
      return;
    }
    if (!playlistId) {
      sendJson(res, 400, { error: "playlistId is required. Direct display live is no longer supported." });
      return;
    }
    device.activePlaylistId = playlistId;
    device.liveOverride = null;
    saveDb();
    sendJson(res, 200, { ok: true, device });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "migrate-direct-to-library") {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    const moved = [];
    for (const item of [...(device.images || []), ...(device.videos || [])]) {
      if (!item?.path) continue;
      db.library.push({
        id: crypto.randomUUID(),
        name: item.name || "Migrated Item",
        type: item.isVideo ? "video" : "image",
        tags: ["migrated", "direct-display"],
        path: item.path,
        size: 0,
        addedAt: new Date().toISOString()
      });
      moved.push(item.id);
    }
    device.images = [];
    device.videos = [];
    saveDb();
    sendJson(res, 200, { ok: true, movedCount: moved.length });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "override") {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    const body = await readJson(req, 30 * 1024 * 1024);
    const item = saveDataUrlImage(body.name, body.dataUrl);
    device.liveOverride = item;
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "override-existing") {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    const body = await readJson(req);
    const sourcePlaylist = findPlaylist(body.sourcePlaylistId);
    if (!sourcePlaylist) { sendJson(res, 404, { error: "Source playlist not found." }); return; }
    const sourceItem = sourcePlaylist.items.find((entry) => entry.id === body.sourceItemId);
    if (!sourceItem) { sendJson(res, 404, { error: "Source item not found." }); return; }
    const item = {
      ...sourceItem,
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString()
    };
    device.liveOverride = item;
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "override-library") {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    const body = await readJson(req);
    const libraryItem = db.library.find((entry) => entry.id === body.libraryItemId);
    if (!libraryItem) { sendJson(res, 404, { error: "Library item not found." }); return; }
    const item = {
      id: crypto.randomUUID(),
      name: libraryItem.name,
      path: libraryItem.path,
      isVideo: libraryItem.type === "video",
      isYouTube: libraryItem.type === "youtube",
      youtubeUrl: libraryItem.youtubeUrl || null,
      delaySeconds: null,
      createdAt: new Date().toISOString()
    };
    device.liveOverride = item;
    saveDb();
    sendJson(res, 200, { ok: true, item });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "override") {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    device.liveOverride = null;
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts.length === 4) {
    const device = db.devices[parts[3]];
    if (!device) {
      sendJson(res, 404, { error: "Device not found." });
      return;
    }
    for (const image of device.images || []) {
      if (image?.path) {
        try {
          fs.unlinkSync(uploadFilePath(image.path));
        } catch {
          // Ignore missing upload files; the device record is the source of truth.
        }
      }
    }
    delete db.devices[parts[3]];
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "images") {
    const device = db.devices[parts[3]];
    if (!device) {
      sendJson(res, 404, { error: "Device not found." });
      return;
    }
    const body = await readJson(req, 30 * 1024 * 1024);
    const image = saveDataUrlImage(body.name, body.dataUrl);
    device.images.push(image);
    saveDb();
    sendJson(res, 200, { ok: true, image });
    return;
  }

  if (req.method === "PATCH" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "images" && parts[5]) {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    const image = device.images.find((item) => item.id === parts[5]);
    if (!image) { sendJson(res, 404, { error: "Image not found." }); return; }
    const body = await readJson(req);
    if (body.name !== undefined) image.name = String(body.name).trim().slice(0, 120) || image.name;
    if (body.delaySeconds !== undefined) image.delaySeconds = body.delaySeconds === null ? null : clamp(Number(body.delaySeconds), 2, 3600);
    if (body.order !== undefined && Array.isArray(body.order)) {
      const reorderMap = new Map(body.order.map((id, i) => [id, i]));
      device.images.sort((a, b) => (reorderMap.get(a.id) ?? 999) - (reorderMap.get(b.id) ?? 999));
    }
    saveDb();
    sendJson(res, 200, { ok: true, image });
    return;
  }

  if (req.method === "POST" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "images" && parts[5] === "reorder") {
    const device = db.devices[parts[3]];
    if (!device) { sendJson(res, 404, { error: "Device not found." }); return; }
    const body = await readJson(req);
    if (!Array.isArray(body.order)) { sendJson(res, 400, { error: "order must be an array of image ids" }); return; }
    const reorderMap = new Map(body.order.map((id, i) => [id, i]));
    device.images.sort((a, b) => (reorderMap.get(a.id) ?? 999) - (reorderMap.get(b.id) ?? 999));
    saveDb();
    sendJson(res, 200, { ok: true });
    return;
  }

  if (req.method === "DELETE" && parts[1] === "admin" && parts[2] === "devices" && parts[3] && parts[4] === "images" && parts[5]) {
    const device = db.devices[parts[3]];
    if (!device) {
      sendJson(res, 404, { error: "Device not found." });
      return;
    }
    const image = device.images.find((item) => item.id === parts[5]);
    device.images = device.images.filter((item) => item.id !== parts[5]);
    saveDb();
    if (image?.path) {
      try {
        fs.unlinkSync(uploadFilePath(image.path));
      } catch {
        // Ignore missing upload files; the playlist state is the source of truth.
      }
    }
    sendJson(res, 200, { ok: true });
    return;
  }

  sendJson(res, 404, { error: "Not found." });
}

function handleReceiverPairing(req, res, url, codeParam) {
  const code = cleanPairingCode(codeParam);
  const deviceId = String(url.searchParams.get("deviceId") || "").trim();
  const name = String(url.searchParams.get("name") || "Fire TV Receiver").trim();
  if (!code || !deviceId) {
    sendJson(res, 400, { error: "Pairing code and deviceId are required." });
    return;
  }

  const pairing = db.pairingCodes[code] || {
    code,
    paired: false,
    seenAt: new Date().toISOString(),
    deviceId,
    name
  };
  pairing.deviceId = deviceId;
  pairing.name = name;
  pairing.lastSeenAt = new Date().toISOString();
  db.pairingCodes[code] = pairing;

  if (!pairing.paired) {
    saveDb();
    sendJson(res, 200, { paired: false });
    return;
  }

  const device = db.devices[deviceId] || {
    id: deviceId,
    label: pairing.label || name,
    token: pairing.token || token(),
    delaySeconds: 10,
    images: [],
    createdAt: new Date().toISOString()
  };
  device.label = pairing.label || device.label;
  device.name = name;
  device.token = pairing.token || device.token;
  device.lastSeenAt = new Date().toISOString();
  db.devices[deviceId] = device;
  pairing.token = device.token;
  saveDb();
  sendJson(res, 200, { paired: true, deviceId, token: device.token });
}

function handleReceiverPlaylist(req, res, url, deviceId) {
  const device = db.devices[deviceId];
  const requestToken = String(url.searchParams.get("token") || "");
  if (!device || requestToken !== device.token) {
    sendJson(res, 401, { error: "Unauthorized." });
    return;
  }
  device.lastSeenAt = new Date().toISOString();
  saveDb();
  let items = [];
  if (device.liveOverride) {
    items = [normalizePlaylistItem(device.liveOverride)];
  } else if (device.activePlaylistId) {
    const playlist = findPlaylist(device.activePlaylistId);
    items = (playlist?.items || []).map(normalizePlaylistItem);
  } else {
    items = [];
  }
  sendJson(res, 200, { delaySeconds: device.delaySeconds, items, images: items });
}

function adminState(req) {
  return {
    baseUrl: publicBase(req),
    pendingPairings: Object.values(db.pairingCodes)
      .filter((pairing) => !pairing.paired)
      .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))),
    devices: Object.values(db.devices)
      .sort((a, b) => String(b.lastSeenAt).localeCompare(String(a.lastSeenAt))),
    library: db.library,
    playlists: db.playlists
  };
}

function saveDataUrlImage(name, dataUrl) {
  const match = /^data:(image\/(?:png|jpe?g|webp|gif)|video\/(?:mp4|webm|mkv|x-matroska|quicktime|x-msvideo));base64,(.+)$/i.exec(String(dataUrl || ""));
  if (!match) {
    throw new Error("Upload must be an image (PNG, JPG, WEBP, GIF) or video (MP4, WEBM, MKV, MOV, AVI) data URL.");
  }
  const mime = match[1].toLowerCase();
  const isVideo = mime.startsWith("video/");
  const ext = isVideo
    ? mime.includes("mkv") ? "mkv" : mime.includes("webm") ? "webm" : mime.includes("quicktime") ? "mov" : mime.includes("avi") ? "avi" : "mp4"
    : mime.includes("png") ? "png" : mime.includes("webp") ? "webp" : mime.includes("gif") ? "gif" : "jpg";
  const id = crypto.randomUUID();
  const filename = `${id}.${ext}`;
  const filePath = path.join(UPLOAD_DIR, filename);
  fs.writeFileSync(filePath, Buffer.from(match[2], "base64"));
  return {
    id,
    name: String(name || filename).replace(/[^\w .-]/g, "").slice(0, 120) || filename,
    mime,
    path: `/uploads/${filename}`,
    isVideo,
    delaySeconds: null,
    createdAt: new Date().toISOString()
  };
}

function loadDb() {
  try {
    const data = JSON.parse(fs.readFileSync(DB_PATH, "utf8"));
    if (!data.pairingCodes || typeof data.pairingCodes !== "object") data.pairingCodes = {};
    if (!data.devices || typeof data.devices !== "object") data.devices = {};
    if (!data.library) data.library = [];
    if (!data.playlists) data.playlists = [];
    for (const device of Object.values(data.devices)) {
      if (!Array.isArray(device.images)) device.images = [];
      if (!Array.isArray(device.videos)) device.videos = [];
      if (device.activePlaylistId === undefined) device.activePlaylistId = null;
      if (device.liveOverride === undefined) device.liveOverride = null;
    }
    for (const playlist of data.playlists) {
      if (!Array.isArray(playlist.items)) playlist.items = [];
    }
    return data;
  } catch {
    return { pairingCodes: {}, devices: {}, library: [], playlists: [] };
  }
}

function saveDb() {
  fs.writeFileSync(DB_PATH, JSON.stringify(db, null, 2));
}

function extractExpire(url) {
  const m = /[?&]expire=(\d+)/.exec(url);
  return m ? new Date(Number(m[1]) * 1000).toISOString() : null;
}

async function extractPlayableYouTubeStream(youtubeUrl) {
  const { output, errorOutput } = await runYtDlpJson(youtubeUrl);
  let info;
  try {
    info = JSON.parse(output);
  } catch (error) {
    throw new Error(`Failed to parse yt-dlp output: ${error.message}`);
  }

  const formats = info.formats || info.requested_formats || [];
  const muxed = formats.filter((f) => f && f.url && f.vcodec && f.acodec && f.vcodec !== "none" && f.acodec !== "none");
  const best = muxed
    .filter((f) => f.ext === "mp4" && String(f.vcodec || "").startsWith("avc1") && String(f.acodec || "").includes("mp4a"))
    .sort((a, b) => (b.height || 0) - (a.height || 0))[0]
    || muxed
      .filter((f) => f.ext === "mp4" && !String(f.vcodec || "").includes("av01"))
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0]
    || muxed
      .filter((f) => f.ext === "mp4")
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0]
    || muxed
      .filter((f) => f.ext === "webm")
      .sort((a, b) => (b.height || 0) - (a.height || 0))[0]
    || formats.find((f) => f && f.url && f.ext === "mp4")
    || null;

  if (!best?.url) {
    const tail = String(errorOutput || "").trim().split("\n").slice(-1)[0];
    throw new Error(tail || "No playable format found");
  }

  return {
    streamUrl: best.url,
    title: info.title,
    duration: info.duration,
    expiresAt: best.url.includes("expire=") ? extractExpire(best.url) : null
  };
}

function runYtDlpJson(youtubeUrl) {
  return new Promise((resolve, reject) => {
    const ytdlp = spawn(
      YTDLP_BIN,
      ["--js-runtimes", "node", "--remote-components", "ejs:github", "-J", "--no-download", youtubeUrl],
      { timeout: 20000 }
    );
    let output = "";
    let errorOutput = "";
    ytdlp.stdout.on("data", (d) => (output += d));
    ytdlp.stderr.on("data", (d) => (errorOutput += d));
    ytdlp.on("close", (code) => {
      if (code !== 0) {
        const detail = String(errorOutput || "").trim().split("\n").slice(-1)[0];
        reject(new Error(detail || "yt-dlp exited with non-zero status"));
        return;
      }
      resolve({ output, errorOutput });
    });
    ytdlp.on("error", (error) => reject(new Error(`yt-dlp process error: ${error.message}`)));
  });
}

function cleanPairingCode(input) {
  return String(input || "").toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 12);
}

function token() {
  return crypto.randomBytes(24).toString("base64url");
}

function clamp(value, min, max) {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, Math.round(value)));
}

function publicBase(req) {
  if (PUBLIC_BASE_URL) {
    return PUBLIC_BASE_URL.replace(/\/$/, "");
  }
  const proto = req.headers["x-forwarded-proto"] || "http";
  return `${proto}://${req.headers.host || `localhost:${PORT}`}`;
}

function uploadFilePath(publicPath) {
  return path.join(UPLOAD_DIR, String(publicPath).replace(/^\/uploads\//, ""));
}

function findPlaylist(id) {
  return db.playlists.find((playlist) => playlist.id === id);
}

function normalizePlaylistItem(item) {
  if (item.isYouTube) {
    return { id: item.id, name: item.name, type: "youtube", youtubeUrl: item.youtubeUrl, delaySeconds: item.delaySeconds ?? null };
  }
  if (item.isVideo) {
    return { id: item.id, name: item.name, type: "video", url: item.path, delaySeconds: item.delaySeconds ?? null };
  }
  return { id: item.id, name: item.name, type: "image", url: item.path, delaySeconds: item.delaySeconds ?? null };
}

function deviceItems(device) {
  const items = [];
  for (const img of (device.images || [])) items.push(normalizePlaylistItem(img));
  for (const vid of (device.videos || [])) items.push(normalizePlaylistItem(vid));
  return items;
}

async function readJson(req, maxBytes = 1024 * 1024) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new Error("Request body is too large.");
    }
    chunks.push(chunk);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
}

function sendJson(res, status, body) {
  const json = JSON.stringify(body);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(json)
  });
  res.end(json);
}

function serveStatic(res, requestPath) {
  const clean = requestPath === "/" ? "/index.html" : requestPath;
  serveFile(res, path.join(PUBLIC_DIR, decodeURIComponent(clean)));
}

function serveFile(res, filePath, start, end) {
  const resolved = path.resolve(filePath);
  const allowed = [PUBLIC_DIR, UPLOAD_DIR].some((root) => resolved.startsWith(path.resolve(root)));
  if (!allowed || !fs.existsSync(resolved) || !fs.statSync(resolved).isFile()) {
    res.writeHead(404);
    res.end("Not found");
    return;
  }
  const stat = fs.statSync(resolved);
  const ext = path.extname(resolved).toLowerCase();
  const type = {
    ".html": "text/html; charset=utf-8",
    ".css": "text/css; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".mp4": "video/mp4",
    ".m4v": "video/mp4",
    ".mkv": "video/x-matroska",
    ".webm": "video/webm",
    ".mov": "video/quicktime",
    ".avi": "video/x-msvideo",
    ".3gp": "video/3gpp"
  }[ext] || "application/octet-stream";

  if (start !== undefined) {
    let safeStart = Number.isFinite(start) ? Math.max(0, start) : 0;
    let safeEnd = Number.isFinite(end) ? Math.min(end, stat.size - 1) : stat.size - 1;
    if (safeStart > safeEnd || safeStart >= stat.size) {
      res.writeHead(416, { "Content-Range": `bytes */${stat.size}` });
      res.end();
      return;
    }
    const length = safeEnd - safeStart + 1;
    res.writeHead(206, {
      "Content-Type": type,
      "Accept-Ranges": "bytes",
      "Content-Length": length,
      "Content-Range": `bytes ${safeStart}-${safeEnd}/${stat.size}`
    });
    fs.createReadStream(resolved, { start: safeStart, end: safeEnd }).pipe(res);
  } else {
    res.writeHead(200, { "Content-Type": type, "Accept-Ranges": "bytes", "Content-Length": stat.size });
    fs.createReadStream(resolved).pipe(res);
  }
}
