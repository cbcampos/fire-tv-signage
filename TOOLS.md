# TOOLS.md - Dobby's Toolkit

## Never Do

- **No markdown tables** — Ever. Use bullet lists or plain text.

## X / Twitter Rule

- **When Chris sends an x.com link:** use the `bird` skill first, with the Firefox workaround as part of that flow.
- Working flow:
  1. Read Firefox cookies from the snap Firefox profile (`auth_token` + `ct0`)
  2. Call `bird read <x-url> --auth-token <token> --ct0 <token>`
- Do **not** start with generic web fetch/browser thrashing.
- Only ask Chris for pasted text or a screenshot if the bird + Firefox path fails.

## Todoist API

- **Task creation field:** `due_string` — NOT `date_string`
  - `due_string` → sets a proper due date, returns `due.date` in response
  - `date_string` → silently ignored by the API, returns `due: null`
- **Working create payload:**
  ```python
  {"content": "Task name", "project_id": "...", "due_string": "Tuesday"}
  ```
- **Update (PATCH):** Use POST to same endpoint with task ID appended
- **Reading tasks:** GET returns `due: null` in response even when due is set — verify creation worked by checking the returned object's `due.date`
- **Known working token:** `~/.openclaw/.secrets/todoist.env` → `TODOIST_API_TOKEN`

## Available Tools

- **web_search** — Research Instagram trends, marketing tactics, competitor analysis
- **web_fetch** — Pull content from marketing resources, competitor accounts, trend articles
- **browser** — Access Instagram, Canva, scheduling tools
- **todoist** — Track content calendar tasks and deadlines
- **image** — Analyze photos (before/after transformations, content reference images)
- **write/edit/read** — Create and update content calendars, brand docs, captions

---

## Image Generation Style

Chris's default image style is **hand-drawn paper craft** — saved at `memory/image-style-guide.md`. Always use this style for image generations unless Chris specifies a different style explicitly.

Key traits: layered cut paper, watercolor texture, soft shadows, warm muted palette (deep green, teal, navy, muted gold, cream). Clean and editorial, not childish. Bold hand-lettered script for text. Default to 16:9.

## Signage CLI (Fire TV / Google TV receivers)

**Rule: Images → `--from-library`. HTML dashboards → `--from-web`.**

Always add image files to the library first, then push using `--from-library`. Only use `--from-web` for HTML pages.

```bash
# Add image to library (do this first)
node ~/.openclaw/workspace/fire-tv-signage/backend/cli.mjs library add "/path/to/image.png" --name "Image Name"

# Push image from library to a device
node ~/.openclaw/workspace/fire-tv-signage/backend/cli.mjs push <device-id> --from-library "Image Name"

# Push HTML dashboard (always use --from-web)
node ~/.openclaw/workspace/fire-tv-signage/backend/cli.mjs push <device-id> --from-web "http://192.168.2.90:8888/dashboard.html" --name "Dashboard Name"
```

**Check library:**
```bash
node ~/.openclaw/workspace/fire-tv-signage/backend/cli.mjs library list
```

**Known devices:**
- `32d814c9-1917-4cea-9041-3624c9c9fcd1` — Living Room Google TV (Chromecast) — **online**
- `8e8032d5-b1b6-4733-8ea5-dc56633f36b2` — Fire TV — **offline**

**Important:** Fire TV goes offline when not in use. Push to Google TV (Chromecast) for the main display.

---

## Local Dashboards

- **Dashboard server:** Python HTTP server on port 8888, data API on port 8891
- **Start/restart:** `bash ~/.openclaw/workspace/scripts/start-dashboards.sh`
- **Data endpoint:** `http://192.168.2.90:8891/data`
- **Dashboard URL:** `http://192.168.2.90:8888/command-center.html`

---

## Sermon Audio Workflow

When editing church service recordings into sermon-only files, use this workflow:

1. Run `python3 scripts/sermon_audio_extract.py <service-audio> --transcribe auto --output-dir outputs/sermons`
2. Review the first-pass result before sharing anything.
3. If the cut is too broad, use transcript-assisted refinement to identify the actual sermon start/end.
4. Treat the sermon-only WAV as the master.
5. Make shareable MP3s from that confirmed sermon-only WAV only.
6. If the first normalized export still sounds quiet, create a second louder delivery MP3 rather than replacing the master.
7. Before uploading or sharing, verify duration so a partial/test render is not mistaken for the final sermon.

Known good louder export recipe:

```bash
ffmpeg -y -i outputs/sermons/<basename>.sermon-only.wav \
  -af "highpass=f=80,acompressor=threshold=-20dB:ratio=2.5:attack=20:release=200:makeup=3,loudnorm=I=-14:TP=-1.0:LRA=10" \
  -ar 48000 -c:a libmp3lame -b:a 160k \
  outputs/sermons/<basename>.sermon-only.full-louder.mp3
```

## Codex Sub-Agent

**Spawn a Codex coding sub-agent:**
```python
sessions_spawn(
    agentId="codex",
    mode="run",
    task="<coding task description>"
)
```

**How it works:**
- `sessions_spawn(agentId: "codex")` routes to the codex agent with `agentRuntime.id: "codex"`
- OpenClaw spawns the Codex app-server harness which injects the ChatGPT OAuth credentials from the codex agent's auth-profiles
- Codex runs on `gpt-5.5` via OpenAI Responses API
- Results auto-announce back to the main session

**Auth setup (already done, don't repeat):**
- Codex agent auth profile lives at: `~/.openclaw/agents/codex/agent/auth-profiles.json`
- Contains ChatGPT OAuth token for `chris.campos@gmail.com`
- If Codex sub-agent fails with "Authentication required", check that this file exists and has valid tokens

**Tool access:**
- `codexDynamicToolsProfile: "openclaw-compat"` — exposes full OpenClaw toolkit to Codex sub-agents (messaging, cron, web_search, browser, memory, etc.)
- Codex native tools (read, write, edit, exec) still available alongside OpenClaw tools

**When to use:**
- Coding tasks that benefit from GPT-5.5's capabilities
- File operations, refactors, builds, debugging
- Tasks where MiniMax hits limitations
- Tasks that need web search, messaging, or browser automation alongside coding

**When NOT to use:**
- General conversation, admin tasks, reminders (keep on MiniMax)
- Switching the main session model away from MiniMax

**Codex agent config (openclaw.json):**
```json
{
  "id": "codex",
  "agentRuntime": { "id": "codex" },
  "model": "openai/gpt-5.5"
}
```

**Plugin config (codex with openclaw-compat tools):**
```json
{
  "plugins": {
    "entries": {
      "codex": {
        "enabled": true,
        "config": {
          "codexDynamicToolsProfile": "openclaw-compat"
        }
      }
    }
  }
}
```

**Tested and working** (2026-05-08):
- File write + readback ✅
- OpenClaw tools (read, web_search, multi_tool_use.parallel) confirmed accessible to Codex sub-agent ✅

---

## Content Ideas Generator

When Amanda Claire needs content for the week, use this framework:
1. **Hook post** (engagement) — Question, relatable struggle, or "POV" style
2. **Value post** (education) — Tip, tutorial, style formula, outfit formula
3. **Social proof** (conversion) — Client transformation, testimonial, review
4. **Personality post** (connection) — Behind-the-scenes, Amanda Claire's journey, real life

### Caption Template
```
[HOOK — 1-2 lines that stop the scroll]

[BODY — Value, story, or educational content. 3-8 sentences max.]

[CTA — What do you want them to do? Comment, save, DM, book]

#hashtags [3-5 branded + 15-20 niche/location hashtags]
```

### Hashtag Strategy
- **Branded:** #ConfettiCloset #ClosetConfetti #FlaireAmanda (check availability)
- **Niche:** #PersonalStylist #ClosetStyling #StyleTips #WardrobeGoals
- **Location:** #BirminghamAL #BirminghamStylist #MagicCityStyle

---

## File Locations

- `memory/brand-guide.md` — Brand voice, colors, fonts, messaging
- `memory/content-calendar.md` — What to post and when
- `data/client-transformations.md` — Transformation tracking
- `data/captions-library.md` — Saved caption templates

---

## Instagram Best Practices

- Reels get reach, Carousels get saves, Stories get engagement
- Post 3-5x per week minimum for growth
- Respond to all DMs/comments within 24h
- Use all 3 Highlights categories: Services, Transformations, About
- Link in bio for booking (can use linktree or direct)