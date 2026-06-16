# MEMORY.md — Dobby's Curated Long-Term Memory

> Bootstrap cap is ~10KB on disk; dreaming promotion self-caps at 10K. Keep human-authored content well under 10K so the dreaming system has room for "Promoted From Short-Term Memory" sections. Auto-managed promotion blocks are appended below by the dreaming system.

## System
- Host: `dobby-mac-mini.local` (macOS 26.2, ARM64). TZ America/Chicago. **NOT** Surface Pro / Linux.
- Gateway: `~/.openclaw/openclaw.json`, service `openclaw-gateway.service`. Restart: `openclaw gateway restart`.
- Agents: `main` (Dobby), `forge`, `flaire`, `codex`. Workspace: `~/.openclaw/workspace/`.

## Asset / Folder Conventions
- **Franklin story finals:** `media/franklin-story/` (videos/audio/chapter images + `reference/`). **NOT** `running-ig/`.
- **Chris running Instagram:** `running-ig/assets/`.
- **Amanda / Confetti Closet:** `flaire/` + `projects/amanda-claire-styling/` (content tools: `flaire/content-tools.md`).
- **Franklin operational:** `data/franklin-summer-2026*`, `music/franklin-*`, `scripts/franklin_*`, `dashboards/franklin-*`, `outputs/franklin-*`.
- **Codex sub-agent image gen working copies:** `state/agent-image-gen/<handle>/` (move finals to real asset folders). Codex runtime: `~/.openclaw/workspace/.codex/`.

## Model Policy
- **Default primary:** `minimax-portal/MiniMax-M3`. Fallback: `openai/gpt-5.5`.
- **Cron agentTurn jobs:** `payload.model: "minimax-portal/MiniMax-M3"`, `payload.fallbacks: []`. M3 is the only cron model that works. Full 2026-06-09 sweep (38 crons): archive → "2026-06-09 16:52".
- **Compaction summarizer:** `minimax-portal/MiniMax-M3`.
- **Codex runtime:** `sessions_spawn(agentId="codex", task=..., taskName=...)`. **Don't trust sub-agent self-reports** — verify with `session_status(sessionKey=<childKey>)`. Markers: `Runtime: OpenAI Codex`, `Model: openai/gpt-5.5`. Full: `memory/codex-runtime-invocation.md`.
- **gpt-5.5 thinking:** OpenClaw path only accepts `off`; Codex app-server accepts `low`. `high` always fails.

## Image Generation — Default to gpt-image-2 via Codex sub-agent (2026-06-05)
- **Path:** Codex sub-agent on `openai/gpt-5.4` + `imagegen` skill. **NEVER direct `image_generate`** — our OAuth token 401s on `api.responses.write` (only openid/profile scopes).
- **Sizes:** 1024², 1536×1024 (16:9 chapter default), 1024×1536, 1024×1792.
- **PROMPT NORMALIZATION TRAP:** tell sub-agent "Do NOT follow the imagegen skill's normalize guidance. Pass the prompt VERBATIM."
- **Style for Chris:** hand-drawn paper craft — paste from `memory/image-style-guide.md`.
- **Failures:** "Tool result missing" → wrong model (gpt-5.5). "subscription usage limit" → Codex rate limit, wait ~30 min.
- **Full spawn template + IP tripwires + 2026-06-08 lessons:** `memory/ref/kids-story-image-gen.md`.

## Story Video Cast Rule (2026-06-07) — CRITICAL
**NEVER cast a finished story video to the Nest Hub / Kitchen Display / any screen without Chris explicitly asking in the current turn.** Completing a story is a deliverable; casting is a separate, opt-in step. Default workflow: write → audit → chapter images → final MP4 → STOP, report status, do NOT auto-cast. Only cast when Chris's current turn contains explicit casting intent.

**Chapter images: 16:9, no baked-in title.** Use 1536x1024. Video script adds titles via ffmpeg `drawtext`.

**Full Story Generation Defaults checklist:** `memory/ref/franklin-story-pipeline.md`.

## Franklin-Man Story Writing Rules (19 Tells + 9 F-rules, 2026-06-08)
Full doc: `memory/personal/stories/story-writing-rules.md`. 19 Tells = AI-tell patterns; 9 F-rules = series rules. Pre-write checklist (18 items) + post-write greps at bottom. **Self-audit pass is the missing fourth layer** — run after greps clear + Chris's first review.

## Edge TTS voice naming — Connor vs Andrew (2026-06-15 + 2026-06-16)
- **Bedtime story narrator:** `en-US-AndrewNeural` (deeper, dramatic, warm). Default in `scripts/edge_tts_render.py`.
- **Franklin's Quest / interactive scavenger hunt:** `en-IE-ConnorNeural` (Irish English, Edge's only "Connor"). NOT Andrew.
- **Trap:** Both names are "English male" in casual thought, but they're different regional voices with different energy. The "default" in `edge_tts_render.py` is Andrew — if you forget to pass the voice arg, every quest station comes out wrong.
- **Lesson re-applied twice in one day (2026-06-15 23:13 + 2026-06-16 07:05):** I keep defaulting to Andrew for the quest. The "if I default it wrong twice, the lesson is too subtle" rule applies — for any project with a designated voice, the wrapper should accept a `voice:` arg AND the project should ship a `.voice` config file checked into the repo, not be a per-call decision.

## Netlify `--site=` flag: project name vs. UUID (2026-06-16)
- `netlify deploy --prod --site=<project-name>` (e.g. `--site=franklin-quest`) returns `Not Found` on most projects. The CLI only resolves UUIDs against its local project linkage.
- **Always use the UUID** for explicit-site deploys: `netlify deploy --prod --site=371fd0cb-3d1f-45c9-b88e-dbe4eb770cdb`.
- Discover UUIDs via `netlify status` (if cwd is in a project dir) or `data/netlify-sites.md` (cross-project registry).

## Bee Live Capture (Lane 0 cron `666809fb-...`)
Full: `memory/ref/bee-live-capture.md`. Omi webhook only (no mic fallback), dedupe by `memory_id`, capture full window text, bounce stuck worker with `launchctl kickstart -k gui/501/com.omi-sync.worker`, reflect-daily same-day.

## Meeting Watchdog
Full: `memory/ref/meeting-recap-engine.md`. Hourly 8 AM - 6 PM CT, 6 PM forced wrap-up. Model M3. Kill phrases: "no recap", "skip the recap", "don't recap this", "private call", "off the record". Caller cross-checked against calendar attendees (Bee mishears "Amanda" as "Adele"). 7-day shadow run before auto-post.

## Calendar Event Title Format (Chris's preference, 2026-06-09)
**Person's name first.** Format: `"<Name>: <Activity>"`. Examples: `Franklin: VBS — Day 2`, `Amanda: UAB appointment`, `Chris: dentist`. No emoji status prefixes (status = `status: confirmed` field, not title decoration).

## NFC Scavenger Hunt — Slug vs. Clue Convention (2026-06-15, learned the hard way)
For `projects/franklin-quest/` (Franklin's Quest and similar): **the station `urlSlug` describes where the kid finds the tag NOW; the `clue` describes where the kid goes NEXT.** The placement hint in the cheat sheet must describe the slug location, not the clue location. I got this inverted twice in one session (tags 4 and 7) and had to revert both. Trap: if a riddle starts talking about a couch/bed/closet that doesn't match the slug, the riddle is about the NEXT tag, not the current one. The placement hint should always echo the slug's room.

## Birthday Reminder System (project at `projects/birthdays/`, started 2026-06-06)
Full: `projects/birthdays/README.md` + `projects/birthdays/plan.md`. Source of truth: `data/birthdays.json` + recurring all-day event on "Me and You" calendar (in sync). DOB format: `"YYYY-MM-DD"` (year known → "turns N today") or `"MM-DD"` (year unknown → "celebrates today"). Add/update flow: tell Dobby in chat; writes JSON + patches calendar in same turn. Morning announce: visual Nest Hub card via Web Receiver, no audio.

## Known Issues / Lessons (dated; full entries: `memory/ref/known-issues-archive.md`)
- **2026-06-14:** Trinity sermon cut-start rule — **start at the Scripture Reading of the day's text** ("Well, let me read Psalm 15, and then we'll pray together."), NOT the kids' dismissal, NOT the series intro, NOT the first detected speech burst. The auto-pick from `sermon_audio_extract.py` often catches the post-Opening-Scripture prayer or the kids' dismissal instead. Trinity service flow has 10 elements; the Scripture Reading is element #6. Full: `docs/sermon-audio.md` + run journal 2026-06-14.
- **2026-06-14:** Trinity sermon audio recipe — bare `loudnorm=I=-16:TP=-1.5:LRA=11`, NO highpass, NO compressor. Trinity's USB recording is a clean soundboard feed, not a room mic. The highpass+compressor stack (designed for room mics) squashes LRA from 8.9 to 7.4 and adds 3dB of makeup gain, sounding harsh. Source natively measures -16.2 LUFS / 8.9 LU LRA, so loudnorm barely does anything — that's the right outcome. Full: `docs/sermon-audio.md`.
- **2026-06-14:** Sermon Recap cron picker heuristic. Three bugs fixed today: (1) required `end_time` set → excluded CAPTURING convs; (2) required sermon keywords in summary → excluded CAPTURING convs whose summary is the most recent segment; (3) used Omi fallback. **Right heuristic: lifetime overlap with the Sunday service window (10:30 AM - 12:30 PM CT) + sermon-keyword score in the summary.** Picker at `scripts/sermon-conv-picker.py` (extracted so it's testable). Sunday sermon conv usually starts *before* 9:30 AM because Bee is on for the whole morning. **General rule:** when a content signal (summary keywords) is available, prefer it over proxy signals (start_time, end_time, file size). Verified 2026-06-14 13:55 CT picking the right conv after Chris's catch.
- **2026-06-14:** Sermon Processor cron (`bbcfc9c0-…`, 12:10 PM Sundays) was `systemEvent` targeting `main` session. Returned `lastError: "disabled"` because the main session isn't bound when Chris is on Discord. **Fixed by changing to `agentTurn` on `isolated` session** — proper background sub-agent, no main-session binding required.
- **2026-06-15 15:16 CT — Chris's rule (HARD, non-negotiable):**
  - **Never run `gws auth login` unless Chris explicitly says "run gws auth login" in the same turn.** Even if the repair script says BROKEN, even if the API returns invalid_grant, even if the watchdog fires — STOP and ask first.
  - **Never overwrite the encrypted token cache** (`credentials.enc` + `token_cache.json` + `.encryption_key`) if it exists and the API behind it is working. Period.
  - Reason this rule exists: at 15:12:36 CT today I ran `gws auth login --services drive,gmail,calendar,tasks` because `gws-auth-repair.sh` reported BROKEN, and that command wiped the working 14:48 CT encrypted cache. Chris had authorized it 25 minutes earlier and expected it to last 7 days. It would have — `gws auth login` is destructive, not additive. Trust the repair script's BROKEN output only after verifying the cache is actually missing.
- **2026-06-15 15:55 CT — gws keyring backend (full root cause):**
  - **Valid `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND` values are `keyring` and `file` ONLY.** `osx-keychain` is not a valid value — it triggers a warning and falls back to `keyring`. On macOS, `keyring` = macOS Keychain = the durable, recommended backend. The default (no env var) is `keyring`.
  - **gws 0.22.5's `file` mode is broken by design.** Setting `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file` in `~/.zshrc`/`~/.zshenv` is the root cause of the recurring 15:12 / 15:41 / 15:44 / 15:50 cache wipes. The bug: gws 0.22.5 has a stale in-memory encryption-key cache. When `file` mode is in use, a new `.encryption_key` is written to disk, but the in-memory copy of the key is stale. Subsequent reads decrypt with the wrong key, fail, and the auto-wipe code path deletes both `credentials.enc` and `.encryption_key`. The binary string `Warning: removing undecryptable credentials file (` is the smoking gun.
  - **The `file` mode's `.encryption_key` is a known class of bug**, not just our machine. Open issues on googleworkspace/cli that match: **#360** ("macOS: Credential decryption always fails — OS Keyring not storing encryption key", open since gws 0.9.1), **#344** ("`credential_store`: `.encryption_key` file persists on disk even when OS keyring succeeds", root-caused to `src/credential_store.rs:64-120` writing the key unconditionally), **#791** ("`keyring_backend: keyring` writes encryption key to disk on every invocation", same bug, gws 0.16.0+). All three are still open. CHANGELOG has fixed a related case once ("Always prefer an existing `.encryption_key` file") and regressed.
  - **Auto-wipe triggers on `invalid_grant` AND decryption failure.** The string `Warning: removing undecryptable credentials file` fires on BOTH paths. This means: a refresh token revoked at Google's end is indistinguishable from a corrupted local cache, and gws's reaction in both cases is to delete the cache. The probe call (any gws API call) can be the thing that triggers the wipe.
  - **`gws auth status` `token_error` is misleading.** Reports "Token has been expired or revoked." whenever the encrypted cache is missing OR undecryptable — does not distinguish between revoked tokens and file-missing scenarios. `encrypted_credentials_exists` separately reports file presence. `token_valid: false` + `encrypted_credentials_exists: true` = decryption failure, NOT missing cache.
  - **The working state (2026-06-15 15:46 CT → 15:50 CT, since wiped):** `keyring_backend: keyring`, `credentials.enc` (334 bytes) + `token_cache.json` (2649 bytes) on disk, NO `.encryption_key` file (key is exclusively in macOS Keychain under service `gws-cli`). Backup at `/tmp/gws-credentials.enc.SAFE` (334 bytes, mtime 15:46).
  - **The fix I applied (2026-06-15 15:50 CT, completed 16:02 CT):** removed `GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND=file` from `~/.zshrc`, `~/.zshenv`, AND `~/.zprofile`. zsh reads all three at different points (.zprofile at login, .zshrc at interactive startup, .zshenv always) — missing one means the env var comes back. With all three clean, gws uses the default `keyring` backend. **Current shell sessions still have the env var exported** — they need a `unset GOOGLE_WORKSPACE_CLI_KEYRING_BACKEND` in the same shell before any gws call. A new terminal alone is not enough if you also `source ~/.zshrc` in it. **The 16:00 CT failed re-auth was caused by `~/.zprofile` not being cleaned up** — the env var was set in the current shell, gws used `file` backend, reported "success" but wrote a cache that was auto-wiped on the next API call.
  - **`scripts/gws-auth-repair.sh` is now strictly diagnostic (no destructive operations).** The old "delete token_cache.json + run `gws auth export`" path was the actual cause of the 15:50 CT cache wipe. The new flow: (1) snapshot cache state BEFORE the probe, (2) probe with a real API call, (3) if cache was present and is now missing → emit `wiped_by_probe` status (the probe triggered the auto-wipe, re-auth is required), (4) if cache was present and is still present → emit `cache_present_undecryptable` diagnostic (NEVER recommend re-auth; investigate the keyring), (5) if cache was missing → emit `needs_manual_repair` with the re-auth command. **The script now never calls `gws auth login`, `gws auth logout`, `gws auth export`, or any other gws subcommand that has side effects on the encrypted cache.** The only safe gws call is a read-only probe.
  - **gws auth recipe (durable doc):** `docs/gws-auth-recipe.md` — the one command, the pre-flight checks, the common failure modes, the things that don't work, and the 4-line recovery. **Read this BEFORE running `gws auth login` for any reason.**
- **2026-06-15 16:20 CT — 7-day renewal watch (`scripts/gws-auth-renewal-watch.sh`):** stateful daily watcher that stays silent for the first 6 days of an outage, then pings once on day 7+ with the full re-auth recipe. State in `state/gws-auth-renewal-watch.json` (atomic read-modify-write via a single Python helper, NOT bash pipes — earlier pipe-based `read_state | python3 | write_state` had a race where `write_state`'s `'w'` truncate beat `read_state`'s read). Cron `f3970b75-…` (daily 6 AM CT) updated to run the watch instead of the noisy one-shot probe. `scripts/gws-preflight.sh` is now STRICTLY READ-ONLY (no gws API calls — file presence + JSON parse only) to eliminate auto-wipe risk from the daily probe. The renewal watch handles its own Telegram + Discord dispatch; if openclaw CLI is unavailable in cron context, it falls back to `state/gws-auth-renewal-watch.pending.log` for later pickup.
- **2026-06-14 / 2026-06-15:** gws auth self-repair. **Trap:** `gws auth status` reports CONFIG (oauth2, 50 APIs) but says nothing about whether the cached access token can actually decrypt. Real API call is the only truth. **Trap:** the encrypted cache `~/.config/gws/token_cache.json` and `credentials.enc` are the actual fragile pieces — when decryption fails (keyring out of sync, machine migration, keychain rotation) every gws API call returns `invalid_grant: Token has been expired or revoked`. The refresh_token in plaintext `credentials.json` is more durable but can also be revoked at Google's end. **Trap (3rd on 14th):** `gws auth login` can HANG silently — the browser OAuth flow completes on Google's side, the new refresh_token gets written to `credentials.json`, but the local callback server in the gws binary never receives the response. The gws process sits at 0% CPU indefinitely, blocks subsequent re-auths (reuses same OAuth state), AND the partial token gets auto-revoked at Google's end. Symptom: re-authing 3+ times in a row without success. **Fix:** `scripts/gws-auth-repair.sh` now detects and kills stuck `gws auth login` processes (>5 min old, 0% CPU) before any other action, surfaces `stuck_killed: 1` in JSON output, and a one-line note in text output. After killing, the next re-auth proceeds cleanly. **Self-repair path:** `scripts/gws-auth-repair.sh` probes via real API call, attempts non-interactive refresh-token refresh, and emits a one-line repair command if it can't. `scripts/gws-preflight.sh` is the cron-friendly wrapper. `scripts/calendar-heartbeat.py` and `scripts/email-monitor-formatter.py` now route auth failures through repair and emit `AUTH_REPAIR_NEEDED` tokens. **Daily 6 AM CT health-check cron `f3970b75-…`** posts to Discord when broken. **2026-06-15 follow-up (the "it's not gws" incident):** the morning stuck login (PID 86917, hung 45 min on port 57918) was killed at 07:34 CT. A NEW `gws auth login --services drive,gmail,calendar,tasks` was started at 12:26 CT (PID 17627, full scope set, 2h 22m before token files appeared). It did NOT kill the previous one cleanly — port 57918 had been released by the morning kill, but the new login never bound to 57918. Token files (`credentials.enc` + `token_cache.json` + new `.encryption_key`) were written at 14:48 CT. Auth was working by 14:52 CT when Chris said "Retry." **Lesson:** a `gws auth login` can run for 2+ hours at 0% CPU and still complete successfully — don't assume a long-running auth login is wedged; check mtime on `~/.config/gws/credentials.enc` and `token_cache.json` before killing. If those have been updated since process start, the auth completed. **Also:** gws 0.22.5's primary token storage is the encrypted cache (token_cache.json + credentials.enc), NOT `credentials.json`. The plaintext `credentials.json` is from an older version and stays stale — gws API calls use the encrypted cache, so stale `credentials.json` is harmless.
- **2026-06-09 21:30:** Bee summarizer propagates a name said once across the entire summary — cross-check any name in a Bee summary against known Bee facts. Full: archive → "2026-06-09 21:30".
- **2026-06-09 22:04:** Bee "we need more [noun]" miss + `speaker: Unknown` triage rules. 15 assertions in `scripts/test_bee_live_window_patterns.py`. Full: archive → "2026-06-09 22:04".
- **2026-06-09 16:52:** Full M2.7→M3 cron sweep (38 crons). **Rule:** agentTurn crons are M3 with NO fallbacks. Full: archive → "2026-06-09 16:52".
- **2026-06-09:** Todoist API v1 endpoint required (`api.todoist.com/api/v1/...`); `rest/v2` deprecated. Full: archive → "2026-06-09: Todoist API v1".
- **2026-06-08:** STOP big rewrites once Chris calls "this is the version." Read-aloud trims only.
- **2026-06-08:** Kids' chapter art = Codex sub-agent on `openai/gpt-5.4` (NEVER main-session `image_generate`, 1500-char limit). Avoid inline "NOT X" — use end-of-prompt `Avoid:` list.
- **2026-06-08:** 3 subagent failure modes: (a) reports saved but file missing → `ls -la`; (b) poll matches stale JPG → push events; (c) wrong content → 5–10 trial runs.
- **2026-06-08:** Bee Reflect Daily filter bug — filter by `created_at`/`start_time` to target day, never raw `limit-N`.
- **2026-06-08:** "Failed" subagent status often non-fatal (runtime race after save). Verify with `ls -la`.
- **2026-06-08:** Cloned make-*video.py scripts — grep ALL old-slug refs (`main_path`/`share_path`/`IMAGES_DIR`/`BOOK_TITLE`) before running.
- **2026-06-08:** Lullaby cast failures = stale watchdog + orphan http server. Cleanup: `pkill -9 -f lullaby_watchdog.py; lsof -ti :8775 | xargs -r kill -9; rm -f state/lullaby-cast/{cast,http}.pid`.
- **2026-06-09:** Email monitor reverted to `is:unread` only. Full: archive → "2026-06-09: Email monitor reverted".
- **2026-06-09:** `scripts/email-monitor-formatter.py` — 3 bugs (`extract_body` fallback, `total_count` excluded `general`, `&amp;`). Full: archive → "2026-06-09: Email monitor extract_body".
- **2026-06-09:** Bee mishears Amanda Johnson as "Adele"; recap generator MUST cross-check calendar attendees, not Bee speaker labels. Full: archive → "2026-06-09: Bee mishears Amanda".
- **2026-06-07:** Edit tool silent batch failure — critical edits, do one at a time.
- **2026-06-07:** YouTube `videos.insert` has no `channelId` — always verify `snippet.channelId` post-upload.
- **2026-06-06:** Franklin video assets go to `media/franklin-story/`, NOT `running-ig/assets/`.
- **2026-06-15:** Franklin scavenger hunt TTS switched from Andrew to **Connor** (`en-IE-ConnorNeural`, Irish male) for app voice consistency. All 9 station MP3s pre-generated via edge-tts and served as `assets/tts/mays-franklin-hunt-XX-*.mp3`. `app.js` uses `new Audio(station.tts)`. SW v7. Andrew is still the default for Franklin bedtime stories (see `memory/ref/franklin-story-tts.md`).
- **2026-06-05:** TTS voice = `en-US-AndrewNeural` (not `AndrewMultilingualNeural`); Default Media Receiver for audio, Web Receiver for video wake on Nest Hub Max.

- **2026-06-10 17:30:** Dashboard `/data` hang = duplicate `send_response`/`end_headers()` in `dashboard-data-server.py`. iPhone PWA had to hard-refresh. Full: archive → "2026-06-10 16:30 → 19:20 — Push audio pipeline".
- **2026-06-10 17:30:** iOS PWA auto-play requires a **persistent DOM `<audio>`** (not `new Audio()` re-gated per play). SW v40 added the element. Full: archive → "2026-06-10 16:30 → 19:20 — Push audio pipeline".
- **2026-06-10 19:20:** PUSH AUDIO WORKING END-TO-END. Root cause was NOT the audio path — `push-notify.py --tts` doesn't generate Kokoro. Test pushes had no audio. **Fix:** raw curl with `kokoro: true` + `kokoro_text` + `urgent: true`. Full: `memory/ref/push-audio-pipeline.md`.
- **2026-06-10 20:50:** Lullaby cast watchdog: ground truth is `lsof -nP -iTCP:8775 -sTCP:ESTABLISHED` (not pychromecast `player_state` — flaky). Verify cron `a0250b18` (5 min after cast) sends urgent push if cast is dead. Full: archive → "2026-06-10 20:50: Lullaby cast" + `memory/ref/lullaby-cast.md`.
- **2026-06-11 20:39:** 2026-06-09 M2.7→M3 cron sweep missed 2 crons (lullaby cast + dashboard keep-alive). M2.7 cron agents fail mid-way through multi-step tasks. **Verify any model sweep with `openclaw cron list --json | jq '[.jobs[] | select(.payload.model | contains("M2.7"))]'` — never trust a one-shot find-and-replace.** Both fixed. Full: archive → "2026-06-11 20:36: Lullaby cast cron — 2026-06-09 M2.7→M3 sweep missed 2 crons".
- **2026-06-12 11:39:** Mac mini LAN IP is `192.168.2.100` (NOT `.90` — DHCP rotated). Tailscale IP `100.89.254.87`, hostname `chriss-mac-mini.tail8b5d2e.ts.net`. **WorkWidget** (`~/Projects/WorkWidget/`) probes `127.0.0.1 → 192.168.2.100 → 100.89.254.87` in order, caches first 200. Built clean with Xcode 26.5 (`xcodebuild` + `xcodebuild -runFirstLaunch` for CoreSimulator), ad-hoc signed, lives at `/Applications/WorkWidget.app`. MacBook download: `http://chriss-mac-mini.tail8b5d2e.ts.net:8888/WorkWidget.zip`. **Apple ID not signed in** to App Store on Mac mini — use App Store GUI for Xcode install (`mas` won't work without sign-in).

## Detailed References
- **Franklin story:** pipeline `memory/ref/franklin-story-pipeline.md`, TTS `franklin-story-tts.md`, video cast `franklin-story-video-cast.md`, writing rules `memory/personal/stories/story-writing-rules.md`.
- **Image gen:** `memory/ref/kids-story-image-gen.md` + `sister-keeper-image-gen-tests.md` + style `memory/image-style-guide.md`.
- **Bee:** live capture `memory/ref/bee-live-capture.md`, calendar extension `bee-calendar-extension.md` (cron `61723294` active).
- **Meetings:** recap engine `memory/ref/meeting-recap-engine.md`. Watchdog cron `4470dd55` (shadow → 2026-06-16), M3, no fallbacks, `0 8-18 * * *` CT.
- **Lullaby (Google Home Mini):** `memory/ref/lullaby-cast.md`.
- **YouTube channel routing:** `memory/ref/youtube-channel-routing.md`.
- **Codex runtime invocation:** `memory/codex-runtime-invocation.md`.
- **Signage CLI:** `docs/signage-cli.md`. **Sermon audio:** `docs/sermon-audio.md` — full cut rules, audio recipe, run journal. Cut starts at Scripture Reading; bare loudnorm on soundboard feed. **here.now deploys:** `docs/herenow-deploys.md`.
- **Brother DCP-L2540DW printing:** `docs/brother-printer-raw-port.md`. **Peekaboo UI automation:** `docs/peekaboo.md`.
- **Amanda's content tools:** `flaire/content-tools.md`.
- **Web Push (Work Dashboard PWA):** `skills/send-push/SKILL.md` — push server `dashboard_push.py` on port 8891, Tailscale router on 18800. For Kokoro auto-play tests, use raw curl with `kokoro: true` + `urgent: true` — `push-notify.py --tts` is a no-op for audio.


## Push System (2026-06-10)
Full doc: `memory/ref/push-audio-pipeline.md` → "Push System Dispatcher Lessons" + "Auto-triggers inventory".

## WorkWidget — widget discovery requirements (2026-06-12 12:00)
- **Release build required.** Debug builds ship `__preview.dylib` + `*.debug.dylib` and an empty `Resources/`, which breaks widget discovery AND fails `spctl --assess`. Always `xcodebuild -configuration Release`.
- **Empty xcassets fail silently.** `Assets.xcassets/AppIcon.appiconset/Contents.json` with image entries but no `filename` keys → actool produces nothing, `Assets.car` is missing from bundle. Verify with `find App.app -name Assets.car` after build.
- **Generate real PNG icons.** 1024x1024 master via `NSImage` in a tiny Swift script, then `sips -z W H` to downscale. Set `filename` in Contents.json. Defaults: deep purple `#2D2A4A` with white "W" works.
- **macOS 14+ accepts ad-hoc signed widgets in `~/Applications`** (user-owned) but **not in `/Applications`** for WidgetKit discovery. `spctl` rejects both, but the per-user container provisioning (`~/Library/Containers/com.camposfamily.WorkWidget.Extension/`) happens reliably.
- **Strip stale `lsregister` entries** when changing build path: `lsregister -u <old-path>` then `lsregister -f -R -trusted <new-path>`. Old Debug build paths persist in LS DB otherwise.
- **Verify on the build host before asking user to install on another device.** Inspect the .app bundle for: `Contents/Resources/Assets.car`, `Contents/Resources/AppIcon.icns`, no `__preview.dylib` or `*.debug.dylib` anywhere. If those are clean, the widget is ready.
- **Update Makefile default to Release**, not Debug. Current `make build` still does Debug.

## Promoted From Short-Term Memory (2026-06-16)

<!-- openclaw-memory-promotion:memory:memory/2026-06-12.md:12:12 -->
- Prompt 14: What's my biggest token waste?: The biggest token waste is still broad workspace inspection in a very dirty repo. A plain `git status --short` emits a huge modified/untracked list and consumed far more context than the review needed. This repeats the 2026-06-05 finding: continuity reviews should avoid full repo status unless the question explicitly needs it. Prefer targeted checks such as cron status, disk usage, recent error logs, `git status --short -- <specific-path>`, or counted summaries. [score=0.806 recalls=0 avg=0.620 source=memory/2026-06-12.md:12-12]
<!-- openclaw-memory-promotion:memory:memory/2026-06-12.md:15:18 -->
- Suggested Action for Prompt 14:: python3 - <<'PY' import subprocess out = subprocess.run(["git", "status", "--short"], cwd="/Users/ccampos/.openclaw/workspace", text=True, capture_output=True).stdout.splitlines() print({"changed_entries": len(out), "sample": out[:20]}) [score=0.806 recalls=0 avg=0.620 source=memory/2026-06-12.md:15-18]
<!-- openclaw-memory-promotion:memory:memory/2026-06-12.md:22:22 -->
- Prompt 15: What's slow that should be fast?: The slowest unnecessary operation tonight was `du -sh ~/.openclaw/workspace ~/.openclaw`, which took long enough to require a second poll because it scans about 59G. That is acceptable occasionally, but too slow for every nightly continuity run. A cached health snapshot or lightweight size check should be used unless disk pressure is suspected. Memory search was quick enough, cron health completed in a few seconds, and the repaired preflight script now finishes immediately. [score=0.806 recalls=0 avg=0.620 source=memory/2026-06-12.md:22-22]
<!-- openclaw-memory-promotion:memory:memory/2026-06-12.md:4:4 -->
- Prompt 13: Is my environment healthy?: The environment is broadly healthy. Gateway is up with about 17h uptime, the current cron scheduler reports enabled, and the continuity cron has zero consecutive errors or skips. `bash scripts/cron-health-check.sh --critical-only` reported all crons healthy across the current cron list. Disk is healthy: `/` has about 660GiB free and the workspace is about 30G, with all of `~/.openclaw` about 59G. [score=0.806 recalls=0 avg=0.620 source=memory/2026-06-12.md:4-4]
<!-- openclaw-memory-promotion:memory:memory/2026-06-12.md:6:6 -->
- Prompt 13: Is my environment healthy?: One latent issue did show up in `logs/cron-script-preflight.launchd.err`: `scripts/openclaw-cron-script-preflight.py` was still trying to read the removed `~/.openclaw/cron/jobs.json` file. I fixed it immediately by adding a SQLite fallback to read `cron_jobs.job_json` from `~/.openclaw/state/openclaw.sqlite`, then verified `python3 scripts/openclaw-cron-script-preflight.py` returns `ok fixed=0 unresolved=0`. [score=0.806 recalls=0 avg=0.620 source=memory/2026-06-12.md:6-6]
<!-- openclaw-memory-promotion:memory:memory/2026-06-12.md:9:9 -->
- Suggested Action for Prompt 13:: python3 ~/.openclaw/workspace/scripts/openclaw-cron-script-preflight.py [score=0.806 recalls=0 avg=0.620 source=memory/2026-06-12.md:9-9]
