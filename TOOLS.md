# TOOLS.md — Dobby's Operator Reference

> Bootstrap cap is ~10KB on disk. Quick reference only. Verbose content in `docs/`, `memory/ref/`, or the appropriate sub-agent folder (e.g. `flaire/content-tools.md` for Amanda).

## Tailscale Serve (external reachability) — CRITICAL
- **Expected target:** `http://127.0.0.1:18801` (the Python dispatcher router in `scripts/tailscale-router.py`).
- **Tailscale hostname:** `https://chriss-mac-mini.tail8b5d2e.ts.net/`
- **Verify:** `tailscale serve status` — first line under the hostname should read `|-- / proxy http://127.0.0.1:18801`. If it shows `127.0.0.1:18789` (OpenClaw gateway) or anything else, the Work Dashboard PWA breaks — gateway is a SPA, returns OpenClaw Control HTML for every path.
- **Why drift matters:** 18789 = OpenClaw gateway (SPA → OpenClaw Control for `/work-dashboard.html`). 18801 = dispatcher (`/work-*` → 8888, `/api/*` → 8891, fallback → 18789). Router is a no-op if nothing points at it.
- **Why 18801, not 18800 (added 2026-06-15):** the OpenClaw browser uses Chrome `--remote-debugging-port=18800` for the browser tool, so 18800 is permanently occupied. The dispatcher was moved to 18801 to stop the kernel from round-robining Tailscale's `/work-*` requests between the router and Chrome's CDP server. Symptom of the old state: `/work-dashboard.html` intermittently returning 500 ("Host header is specified and is not an IP address or localhost") when a connection hit the router, or 404 from Chrome CDP when it didn't.
- **Watchdog:** `scripts/tailscale-serve-watchdog.py` runs every 30 min via cron `0c0154df-feea-4c32-8377-3c1354ee0fc7`. Detects drift, auto-fixes, alerts Telegram only on action. Cooldown 1h.
- **Manual fix:** `tailscale serve --bg 18801`. Verify with `curl -s -o /dev/null -w "%{http_code} %{size_download}\n" https://chriss-mac-mini.tail8b5d2e.ts.net/work-dashboard.html` (should be `200 81641`, not OpenClaw Control shell).

## Network Discovery — Always Use These First
1. `dns-sd -B _ipp._tcp` and `dns-sd -B _pdl-datastream._tcp` — Bonjour/mDNS printer discovery.
2. `arp -a` — known LAN neighbors.
3. `socket.connect()` scan ports 631, 9100, 515, 80 on known LAN IPs (192.168.2.0/24).
4. `dns-sd -L <name> _ipp._tcp local` — resolve bonjour names.
5. `dns-sd -q <hostname>.local A` — mDNS to IP. **The printer was visible via dns-sd the whole time.** Never skip mDNS/Bonjour for printers.

## Never Do
- **No markdown tables** — ever. Use bullets or plain text.
- **No destructive commands without asking.** `trash` > `rm`.
- **No overwriting an existing production Netlify site.** `--create-site` or `--site=<verified-id>`. Full rule below.
- **No auto-casting finished story videos** to any screen. See MEMORY.md → "Story Video Cast Rule".

## Omi Local Audio
- Skill: `skills/omi-local-audio/SKILL.md`. Repo: `/Users/ccampos/Documents/Codex/2026-05-31/i-want-to-build-my-own`. State: `~/.omi-sync`. Webhook: `https://omi-audio.camposfamily.cloud/audio?sample_rate=16000&uid=omi`. Local: `http://127.0.0.1:18765`. Tunnel: `omi-sync-audio`.
- **"What's Chris hearing right now":** `cd <repo> && uv run omi-sync now transcript --minutes 5 --json` → live partial text. **Read it and summarize in my own voice** — never delegate to `now summarize` (returns empty during active speech).
- **Worker wedge:** fresh `Last audio chunk` + stale `Last transcription` = `com.omi-sync.worker` stuck at 0% CPU. Bounce: `launchctl kickstart -k gui/501/com.omi-sync.worker` (verify with `uv run omi-sync status`).
- **Outage recovery:** `omi-sync self-heal --json`. `import-omi-api` is bounded recovery only and needs `--start-date/--end-date/--hours` unless Chris explicitly asks for `--all`.

## Telegram Voice Notes — Fast Transcription
- **Use this first:** `/Users/ccampos/.openclaw/workspace/scripts/telegram_voice_transcribe_fast.sh /Users/ccampos/.openclaw/media/inbound/<file>.ogg`
- Local faster-whisper daemon: `com.openclaw.telegram-whisper-daemon`, `http://127.0.0.1:28765`, model `tiny`, venv `/Users/ccampos/.openclaw/workspace/.venv-sermon`.
- LaunchAgent: `/Users/ccampos/Library/LaunchAgents/com.openclaw.telegram-whisper-daemon.plist`. Health: `curl -fsS http://127.0.0.1:28765/health`.
- Recovery: the wrapper lazy-starts the daemon if needed; for supervised restart use `launchctl kickstart -k gui/501/com.openclaw.telegram-whisper-daemon`.
- Keep the long-form `skills/audio_to_text` / `scripts/faster_whisper_transcribe.py` path as fallback only.

## Outbound Message Rule
**Always confirm exact message text with Chris before sending anything outbound** (iMessage, SMS, Telegram, Discord, email, social posts). Draft first, wait for approval, then send. Exception: Chris has already provided exact final text AND explicitly says to send it.

## X / Twitter Rule
- When Chris sends an x.com link → use the `bird` skill first, with the Firefox workaround (read `auth_token` + `ct0` from the snap Firefox profile, call `bird read <x-url> --auth-token <token> --ct0 <token>`). Don't start with generic web fetch/browser thrashing.

## Meals → Todoist, NOT Bee todos
1. Save plan + recipes to `memory/personal/meals and recipes/YYYY-MM-DD Weekly Plan.md`.
2. Push to Todoist via REST API: `scripts/todoist-push-meals.py`.
   - **Reusable CLI** (rewritten 2026-06-11): auto-detects current week's plan, parses day/meal/ingredients/directions, dedupes against active tasks by day+title, supports `--days`, `--note`, `--force`, `--dry-run`, `--json`, `--plan-file`. Idempotent — re-runnable.
   - Old hardcoded clones (`todoist-push-meals-jun05.py`, `todoist-push-meals-jun09.py`) are superseded. Don't re-clone; pass `--plan-file` instead.
3. Verify with Todoist REST API directly — NOT `bee todos list`.
4. `bee todos` = Bee's SQLite, NOT Todoist. Tasks from `bee todos create` will NEVER appear in Chris's Todoist app.
5. **Todoist is the final source of truth for "what's for dinner."** Chris rearranges meals often, so the weekly plan markdown goes stale — never use the plan file to pick tonight's recipe; always query the Dinner project in Todoist first. When in doubt, call `scripts/daily-recipe.py` with no args so it falls through to Todoist. (2026-06-11)

## Shopping List Email (after every plan run)
- Script: `scripts/send-shopping-list-email.py`. Renders `*Shopping List.md` as styled HTML (purple `#2D2A4A` headers, orange `#E8613D` section headings) and sends via `gws gmail +send --html`.
- **From:** `clawdobby@gmail.com`. **To:** `chris.campos@gmail.com`. **Subject:** `Shopping List — Week of <Month> <day>–<day>, <year>`. Flags: `--subject-suffix "(UPDATED)"`, `--swap-note "..."`, `--dry-run`.

## Todoist API
- **Task creation field:** `due_string` (NOT `date_string` — silently ignored).
- Create payload: `{"content": "Task name", "project_id": "...", "due_string": "Tuesday"}`. Update (PATCH): POST to same endpoint with task ID appended.
- Token: `~/.openclaw/.secrets/todoist.env` → `TODOIST_API_TOKEN`.

## Netlify Deploys
- **trinity-sermons-widget (GitHub-linked, 2026-06-30):** the Netlify site `trinitysermonswidget.netlify.app` (id `dcece112-b398-4118-a977-cf8d4bc38099`) is linked to `cbcampos/trinity-sermons-widget`. **Pushing to `main` is deploying — no manual `netlify deploy --prod` needed.** Verified today: `git push origin main` after commit `eb706f4` → live site had the new placeholder within ~60s. The same is true for any other repo-linked Netlify site — check `data/netlify-sites.md` for `repo:` lines before assuming you need a manual deploy.

## Trinity Sermon Transcription (MPS, 2026-06-30)
- **Default device on Apple Silicon: `--device mps`.** OpenAI whisper `large-v3` on CPU+FP32 takes ~8-10 min per 32-min sermon. With `--device mps` it takes ~2-3 min (~5-10x faster). Model lives in unified memory on the GPU (RSS drops from 3.8 GB to ~75 MB).
- **Wrapper script:** `projects/trinity-fellowship/scripts/transcribe-sermon.py` — defaults to `--device mps --model large-v3`. Use this instead of invoking `whisper` directly.
- **Recipe doc:** `projects/trinity-fellowship/TRANSCRIBE.md` — full options, traps, alternatives (mlx-whisper, faster-whisper), and why we picked MPS over them.
- **TRAP: don't run two MPS whisper jobs in parallel on the same M1.** The M-series Mac has ONE Metal device. Two `--device mps` whisper processes contend for it and both stall at ~10-15% CPU. Serialize MPS jobs. Verified 2026-06-30: my parallel MLX benchmark dropped sub-agent's whisper from 22% → 9% CPU; killing the benchmark recovered it to 34% within 30s.
- **Trap:** `netlify deploy --create-site` can reuse a parent dir's `.netlify/state.json` and deploy to the already-linked site. Inside `~/.openclaw/workspace`, do not trust `--create-site` alone.
- **Fresh project recipe:** `netlify sites:create --name <new-site-name> --account-slug cbcampos --disable-linking` then `netlify deploy --prod --dir=. --site=<new-site-id>`. If a deploy unexpectedly hits the wrong site, redeploy that site's original folder with the verified `--site=<site-id>`.

## Image Generation — Default Path
**Codex sub-agent on `openai/gpt-5.4` using gpt-image-2.** Full rules: MEMORY.md → "Image Generation Default" and `memory/ref/kids-story-image-gen.md`. Style for Chris: `memory/image-style-guide.md` (hand-drawn paper craft; 16:9 default for story chapter images).

## Signage CLI (Fire TV / Google TV receivers)
- **Images → `--from-library`. HTML dashboards → `--from-web`.** Show an image NOW: `override-library <device-id> <library-item-id>` or `live-item <device-id> --library <library-item-id>`. `push --from-library` is playlist placement, not live display.
- **Kitchen Display ≠ signage receiver.** Use DashCast for the Nest Hub. **DashCast = dashboards, NOT video** — `<video autoplay>` will NOT auto-play on the webview. For video, use the Default Media Receiver directly.
- Full CLI: `docs/signage-cli.md`.

## Local Dashboards
- Server: Python HTTP on port 8888, data API on 8891. Start: `bash ~/.openclaw/workspace/scripts/start-dashboards.sh`. Data: `http://192.168.2.90:8891/data`. UI: `http://192.168.2.90:8888/command-center.html`.

## Brother DCP-L2540DW Printing
- **Print PNGs via `scripts/print-png.py`** with Pillow. Uses **native `lp`** (CGImage→PDF→URF raster→IPP) so macOS handles page geometry, scale, rotation, and centering. No more hand-rolled cupsfilter→lpr pipeline (2026-06-22 rewrite).
- **Pipeline:** (1) optionally Pillow B&W (luminance + contrast 1.15) if `--bw`; (2) `lp -d Brother_DCP_L2540DW -o media=Letter -o orientation-requested={3|4} -o fitplot [-o ColorModel=Gray]` — CUPS runs `cgimagetopdf` → `cgpdftoraster` internally and sends URF to printer.
- **Flags:** `--landscape` (orientation-requested=4), `--bw` (grayscale), `--dry-run` (renders preview PNG via same filter chain, no paper used), `--preview-only` (same as dry-run).
- **Dry-run path is real:** runs the same `cgimagetopdf`+`pdftoppm` filter chain, saves preview PNG to `/Users/ccampos/.openclaw/workspace/state/print-preview/last-preview.png`. NO paper is used.
- **Printer:** `Brother_DCP_L2540DW` at `ipp://192.168.2.220:631/ipp/print`. Raw port 9100 / IPP pitfalls: `docs/brother-printer-raw-port.md`.
- **Trap (2026-06-22) — `lprm` does not always cancel:** once a print job is in the Brother's internal buffer, `lprm -P Brother_DCP_L2540DW <job>` may report success in CUPS but the job still prints. Confirmed: jobs 58 and 60 on 2026-06-22 logged "Unable to cancel print job" in `/var/log/cups/error_log` AFTER `lprm` returned success. **A test print is a real cost, not a reversible action.** Always use `--dry-run` for testing.
- **Trap (2026-06-22) — never run `lpr` or `lp` directly during testing.** Direct `lpr`/`lp` calls bypass the `--dry-run` flag. On 2026-06-22 I almost sent a 6th wasted sheet by running `lpr -o orientation-requested=4 <pdf>` as a "test." The only safe path to print is `print-png.py [--landscape] [--bw]` without `--dry-run`. Treat `lpr` (or `lp`) as the printer's "fire" button — never use it for diagnostic or test sends.
- **Trap (2026-06-22) — the PDF can be correct but the printout still wrong.** A clean `pdfinfo` and a clean `pdftoppm` render of the PDF **does not guarantee** the printer will produce a matching sheet. The Brother DCP-L2540DW is "IPP Everywhere" (`image/urf` filter); the PPD's `*PageSize Letter` is `612 792` (PostScript portrait convention) and the driver may auto-fit / auto-rotate content if the page geometry doesn't match its expectations. **Always compare the printer's physical page counter (`snmpwalk -v1 -c public 192.168.2.220 1.3.6.1.2.1.43.10.2.1.4.1.1`) before and after a real print** to confirm a sheet actually came out.
- **Trap (2026-06-22) — portrait source on a landscape-aspect image leaves big bottom whitespace.** The source poster is 1536×1024 (landscape aspect). When the script scales it to fit a 612×792 portrait page, the image becomes 612×408 at the top of the page, with 384 pts of blank space below. That's not a bug — it's the geometry — but it can look "wrong" if the user expects full-bleed portrait output. If portrait is required, the source image needs to be regenerated as a portrait-aspect composition (e.g. 1024×1536).
- **Trap (2026-06-22) — `cupsctl --pause-printers` doesn't exist on macOS.** Use `cupsdisable <queue>` to pause and `cupsenable <queue>` to resume. macOS's CUPS doesn't accept the pause flag from upstream CUPS.
- **Trap (2026-06-22) — `cgimagetopdf`/`cgpdftoraster` need the proper PPD.** Calling them with no `PPD` env var falls back to `Generic.ppd`, which fails with "Unknown operator 'dict'" on macOS. Always set `PPD=/private/etc/cups/ppd/Brother_DCP_L2540DW.ppd` when running them manually.
- **Trap (2026-06-22) — `cgimagetopdf` argv ordering.** Signature: `cgimagetopdf job-id user title copies options [file]` — the input file goes LAST, after options. Putting it first causes "Can't open file".
- **TRAP (2026-06-22 15:22 CT) — macOS's `cgpdftoraster` does NOT honor `-o landscape` or `orientation-requested=4`.** Verified by running the filter manually with PPD and various landscape options: output is **always 2550×3300 (portrait letter at 300 DPI)** regardless. The filter may rotate the CONTENT 90° (with `fitplot`) but the page geometry stays portrait. **This is a fundamental macOS limitation on IPP Everywhere printers** — the standard CUPS landscape option cannot make this printer produce a landscape raster. The only way to print landscape is to bypass CUPS entirely and send a properly-formatted 3300×2550 URF directly to the printer via port 9100. **The work-around for landscape prints: do the rotation in your own code.** Take the source image, resize to 3300×2550 (landscape letter at 300 DPI) with appropriate centering, encode as URF manually (32-byte header + raw 1bpp bitmap), and write it to `socket://192.168.2.220:9100`.
- **Why the new pipeline is better than the old one (2026-06-22 rewrite):**
  - **Old:** Pillow resize → `cupsfilter -m application/pdf` → verify letter page → `lpr`. Three tools, custom resize math, manual page verification.
  - **New:** Pillow B&W (optional) → `lp` with CUPS-native options. One tool, CUPS handles scale/rotation/fit-to-page. The same `cgimagetopdf`+`cgpdftoraster` filter chain runs under the hood, but with proper PPD and page geometry baked in.
- **Post-mortem:** MEMORY.md → "Brother DCP-L2540DW Printing — Post-Mortem (2026-06-22)" — 5 wasted sheets in one debugging session, root causes, and lessons.
- Setup: `uv venv /tmp/pillow-env --python 3.12 && uv pip install --python /tmp/pillow-env/bin/python Pillow`. Run: `/tmp/pillow-env/bin/python scripts/print-png.py <png> [--landscape] [--bw] [--dry-run]`.

## Peekaboo — macOS UI Automation
Always pass `--bridge-socket ~/Library/Application\ Support/OpenClaw/bridge.sock`. Use OpenClaw browser/CDP for web DOM, Peekaboo for macOS UI/window/clipboard. Full: `docs/peekaboo.md`.

## Edge Andrew TTS (Default for Franklin bedtime stories, 2026-06-06)
- Voice: `en-US-AndrewNeural` (NOT `AndrewMultilingualNeural` — typo in older docs). Rate: `+0%` (A/B'd 2026-06-06 18:31 CT). ~33 min for 30K chars.
- Per-chapter pipeline (Story 4+, 2026-06-07+): `scripts/edge_chapter_audio.py` + `scripts/edge_chapter_worker.py` (8 parallel). One-shot batch: `scripts/edge_story_audio.py` (480-char chunks, ffmpeg concat). Venv: `/private/tmp/edge-tts-env` (Python 3.13, edge-tts 7.2.8).
- **Script MUST be named `edge_tts_render.py` not `edge_tts.py`** — otherwise the script's filename shadows the `edge_tts` PyPI package when run as `__main__`. Stale `__pycache__/edge_tts.cpython-313.pyc` from an old name also breaks; `rm -rf scripts/__pycache__` to recover.
- `en-US-DavisNeural` does not exist. Use Andrew/Guy/Tony. Full: `memory/ref/franklin-story-tts.md` + `memory/ref/franklin-story-pipeline.md`.

## Franklin Story Video Cast (Nest Hub / Kitchen Display) — added 2026-06-07
- **CRITICAL:** Never cast a finished story video without Chris explicitly asking. See MEMORY.md → "Story Video Cast Rule".
- When asked: cast via the **Default Media Receiver** (NOT DashCast). Verified 2026-06-07.
- Range-aware HTTP server on a free port (8775 = lullaby, 8776 = legacy story, 8777 = new convention — `lsof -i :<port>` first). Cast via `pychromecast`; set volume explicitly (pychromecast default is 1.0).
- **Verification + stop:** don't trust `state=PLAYING` (reads UNKNOWN mid-playback). Truth = `lsof -i :<port>` ESTABLISHED + server log shows `GET /<mp4>.mp4 HTTP/1.1 206`. Kill server when done: `lsof -ti :<port> | xargs kill -9`. Full: `memory/ref/franklin-story-video-cast.md`.

## Franklin Lullaby Cast (Google Home Mini audio)
- Daily 8 PM CT cron casts a seamless 10h Brahms Lullaby loop to Franklin's Speaker (192.168.2.160). Mac stays awake via `caffeinate -i -w $$ -t 39600`. Cron: `Franklin Lullaby Cast` (id `ac34bb23-...`), `0 20 * * *` America/Chicago. Stop: "stop the lullaby" or `bash scripts/stop-lullaby.sh`.
- **pychromecast (2026-06-05):** use `get_chromecast_from_host(...)` to skip mDNS races; speaker status is flaky (UNKNOWN mid-playback); `play_media` needs a `metadata` dict; always `cc.media_controller.stop()` first to avoid being ignored. Truth = HTTP server's ESTABLISHED connection from speaker IP.
- Full: `memory/ref/lullaby-cast.md`.

## Cast Lullaby (skill — manual, any speaker)
- **Fast path for "play the lullaby on X" / "stop the lullaby on X".** `scripts/cast-lullaby.sh <name|ip> [volume]`. ~2.7–6.9s on a known device. Worst case ~15s if the Cast port is fully closed.
- Subcommands: `list` (8 speakers + 6 groups + signage), `status`, `stop [name|ip|all]`. Friendly names from `data/speakers.json` (schema v3, 2026-06-14). IP fallback works for any Cast device.
- **Cast-able speakers (8, friendly names from Google Home app):**
  - `Living Room TV` (192.168.2.183, Chromecast with Google TV) — also AirPlay receiver.
  - `Living Room Display` (192.168.2.241, Google Nest Hub).
  - `Kitchen Display` (192.168.2.75, Google Nest Hub Max — has camera).
  - `Master Bedroom Display` (192.168.2.103, Google Nest Hub).
  - `Nursery Speaker` (192.168.2.181, Google Home Mini) — host of "Inside Speakers" group.
  - `Music Room Speaker` (192.168.2.47, Google Home) — host of "Master" group.
  - `Outside Speakers` (192.168.2.216, Chromecast Audio) — host of "All Speakers", "All Devices", "Outside All" groups.
  - `Franklin's Speaker` (192.168.2.160, Google Home Mini) — host of "Not Kitchen" group. **Cast wedged 2026-06-14** (device online, mDNS announces, but TCP 8009 closed; power cycle to restore).
- **Cast groups (6):**
  - `All Speakers` (192.168.2.216) — whole house audio.
  - `Inside Speakers` (192.168.2.181) — inside audio.
  - `Outside All` (192.168.2.216) — outside audio.
  - `All Devices` (192.168.2.216) — audio + video everywhere.
  - `Master` (192.168.2.47) — master suite audio.
  - `Not Kitchen` (192.168.2.160) — everywhere except Kitchen. **Down 2026-06-14** (host cast port wedged).
  - Each group has aliases (e.g., `inside` → Inside Speakers, `all` → All Devices).
- **Non-Cast displays:** Fire TV (192.168.2.250) — signage-managed, not a Cast target.
- Speaker name → IP via static JSON, then `uv run --with pychromecast python state/lullaby-cast/cast_quick.py` (always uses uv run; venv-cast fails on Google TV's wedged receiver).
- Always `quit_app` on the speaker before cast to prevent the "state=PLAYING but no audio" wedge. `stop` falls back from `media_controller.stop()` to `quit_app()` when stop is rejected.
- **Discovery: do 3-5 mDNS rounds and dedupe by UUID.** Single sweep misses ~15% of devices (Living Room TV was absent in 2 of 5 sweeps on 2026-06-14).
- **Ghost-online state:** a Cast device can respond to mDNS AND HTTPS (port 8443) but still have TCP 8009 closed. That's a wedged Cast service, not "offline" — power cycle restores it.
- Implementation: `scripts/cast-lullaby.sh` (shell) + `state/lullaby-cast/cast_quick.py` (Python). HTTP server (`state/lullaby-cast/lullaby_http_server.py`, port 8775) is started on demand.

## YouTube Data API v3 — Channel Routing (added 2026-06-07)
- **Trap:** `videos.insert` has no `channelId` param. Multi-channel accounts always route uploads to the primary channel. OAuth `refresh_token` is account-level, not channel-level.
- **Verify after upload:** `videos.list?part=snippet&id=<videoId>` → check `snippet.channelId` matches intended. If not, fix it.
- **Workarounds:** (1) Move via YouTube Studio UI (~30 sec/video). (2) Upload directly in YouTube Studio UI. (3) Drive the browser tool.
- **Lesson (2026-06-07):** uploaded two Franklin-Man videos to @chriscamposyl instead of @franklinmanstories because I trusted the success response. Always verify. Full: `memory/ref/youtube-channel-routing.md`.

## Edit Tool — Silent Batch Failure (added 2026-06-07)
- **Trap:** the `edit` tool fails the **entire batch** when ANY single `edits[]` entry is malformed — no rollback, no indication of which entry failed, **zero** entries applied.
- **Rule:** for critical bulk edits, do them one at a time. If batching, re-read and grep for a known edit text. Don't trust the success message.

## MiniMax Music
- Full ref: `memory/minimax-music.md`. Save lyrics/prompt in `music/` first, use the OpenClaw MiniMax music tool, retry once before calling it broken.

## MiniMax Triage (rate limits / fallback)
- Full ref: `memory/2026-05-27-minimax-overload-fault-isolation.md`. Quick: MiniMax standard `minimax-portal/MiniMax-M2.7` is plan-compatible. **Do not use `MiniMax-M2.7-highspeed` as a fallback** unless Chris explicitly approves it; it is unavailable on his plan. For Bee/cron paths, prefer standard M2.7 with no OpenAI fallback when OpenAI quota noise is the problem.
