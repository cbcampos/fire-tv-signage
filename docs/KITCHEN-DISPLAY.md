# Kitchen Display — Complete Reference

Google Nest Hub Max at **192.168.2.75** running dashboards via DashCast + Netlify.

---

## Architecture Overview

Three independent screens run on the Kitchen Display. Each is:
1. **Generated** (Python script)
2. **Deployed** to Netlify (draft alias URL)
3. **Cast** to the Nest Hub via `dashcast.py`

The display does **not** auto-refresh. You must re-run the deploy + cast cycle after any change.

---

## Deploy & Cast — How to Push to the Display

**Step 1 — Generate:**
```bash
cd ~/.openclaw/workspace/skills/google-home-visual
python3 generate-family-calendar-v2.py
```

**Step 2 — Publish (use here.now, not Netlify):**
```bash
# here.now is faster and avoids Netlify alias staleness issues
bash /tmp/heredotnow-skill/here-now/scripts/publish.sh ~/.openclaw/workspace/skills/google-home-visual/family-calendar-hubmax-v2.html
```
- Gets a URL like `https://eager-sierra-re24.here.now/`
- Expires in 24h but is reliable for same-day use
- If you need permanent URL, deploy to Netlify alias (see below)

**Step 3 — Cast:**
```bash
python3 ~/.openclaw/workspace/skills/dashcast/dashcast.py "<URL>" "Kitchen Display" --force
```

**If the Hub shows "page not found":**
Cast a blank page first to clear the session cache, then cast your target:
```bash
python3 ~/.openclaw/workspace/skills/dashcast/dashcast.py "data:text/html,<html></html>" "Kitchen Display" --force
sleep 5
python3 ~/.openclaw/workspace/skills/dashcast/dashcast.py "<URL>" "Kitchen Display" --force
```

---

## Netlify as Permanent URL (Alternative)

If you need a stable URL that survives the 24h here.now expiry:

```bash
cd ~/.openclaw/workspace/skills/google-home-visual
netlify deploy --dir . --alias <unique-alias>
# e.g. --alias family-cal-v3
```

Then cast the resulting `https://<alias>--boston-is-weak.netlify.app` URL.

**⚠️ Netlify alias staleness:** Aliases on the `boston-is-weak` project have been observed to 404 unexpectedly even after recent successful deploys. If a known alias suddenly shows "page not found," switch to here.now for same-day use. This appears to be a Netlify infrastructure issue with alias deploys, not a configuration problem. here.now is more reliable for same-day casts.

**⚠️ Never use `--prod`** on a project with existing content — it overwrites the live site.

---

## Screen 1: Family Calendar v2

**Purpose:** Shows 10-day family calendar — "Me and You" Google Calendar only (no Work events).

**Files:**
- Generator: `skills/google-home-visual/generate-family-calendar-v2.py`
- Output HTML: `skills/google-home-visual/family-calendar-hubmax-v2.html`

**Live URL (here.now — expires 24h):** deploy via here.now publish script above

**What it shows:**
- Dad, Mom, Franklin, Mae — color-coded with initials
- Events from `fg5muo04j8joetgfjdtgjtccvo@group.calendar.google.com` only
- 7-day window with configurable time window (default: 7:00 AM – 1:00 PM CT)
- Tap an event to mark it checked (dims it)
- Today's column is highlighted

**Event text wrapping:** Events with multiple people show initials and title on the same row (flex row layout). Text wraps around the initials badge.

---

## Screen 2: Family Chores

**Purpose:** Weekly household chores by family member (Dad, Mom, Franklin, Mae).

**Data source:** Todoist — project `6fwwfHvqPCFv58Xj`, organized by section for each family member. Tasks have labels (`morning`, `evening`) or default to `Chores` tab.

**Files:**
- Generator: `skills/google-home-visual/generate-family-chores.py`
- Output HTML: `skills/google-home-visual/family-chores-hubmax.html`

**Todoist structure:**
- Section `6fxpM6J9PPc7wW7j` → Dad
- Section `6gWJ8GCHq2mHCjWC` → Mom
- Section `6gWJ8GJRmv2gcqJC` → Franklin
- Section `6gWJ8GmvqjQ7JmHj` → Mae
- Tasks tagged `morning` or `evening` per Todoist label

**Refresh:**
```bash
cd ~/.openclaw/workspace/skills/google-home-visual && python3 generate-family-chores.py
URL=$(bash /tmp/heredotnow-skill/here-now/scripts/publish.sh ~/.openclaw/workspace/skills/google-home-visual/family-chores-hubmax.html | grep '^https://')
python3 ~/.openclaw/workspace/skills/dashcast/dashcast.py "$URL" "Kitchen Display" --force
```

---

## Screen 3: Family Meals

**Purpose:** This week's dinner meal plan from Todoist.

**Data source:** Todoist — project `6fwwjRCMPhWF76mR`. Each task's `content` = recipe name, `description` = ingredients + instructions (parsed by regex).

**Files:**
- Generator: `skills/google-home-visual/generate-family-meals.py`
- Output HTML: `skills/google-home-visual/family-meals-hubmax.html`

**Todoist structure:**
- Recipe name in task `content`
- Ingredients list in task `description` (lines starting with `-`, `•`, or `*`)
- Instructions section in `description` after a header like "Instructions:" or "Directions:"

**Refresh:**
```bash
cd ~/.openclaw/workspace/skills/google-home-visual && python3 generate-family-meals.py
URL=$(bash /tmp/heredotnow-skill/here-now/scripts/publish.sh ~/.openclaw/workspace/skills/google-home-visual/family-meals-hubmax.html | grep '^https://')
python3 ~/.openclaw/workspace/skills/dashcast/dashcast.py "$URL" "Kitchen Display" --force
```

---

## Screen 4: Interactive Recipe Card

**Purpose:** Step-by-step recipe with timers, voice instructions (Kokoro TTS), and tap navigation.

**Template:** `skills/google-home-visual/interactive-recipe-card.html`
- Shows all ingredients + steps on an overview screen
- Tap left 20% = previous step, right 20% = next step
- Multi-timer support per step (auto-detects "25 minutes", "10 more minutes")
- Tap the ingredients button to slide in the full list
- Header pills allow direct jump to any step

**Kokoro TTS audio:** Generated per-recipe, hosted on Netlify. Six step WAV files.

**To update with a new recipe:**
1. Edit `interactive-recipe-card.html`:
   - Replace `var stepAudio` array with your recipe's audio URLs (or leave empty to disable)
   - Replace `var recipe = {...}` with your recipe data
2. Publish and cast:
```bash
cp ~/.openclaw/workspace/skills/google-home-visual/interactive-recipe-card.html /tmp/recipe-interactive.html
URL=$(bash /tmp/heredotnow-skill/here-now/scripts/publish.sh /tmp/recipe-interactive.html | grep '^https://')
python3 ~/.openclaw/workspace/skills/dashcast/dashcast.py "$URL" "Kitchen Display" --force
```

**To generate Kokoro TTS for a new recipe:** Use the `kokoro-tts` skill to generate step-by-step audio, host the WAVs on Netlify, update the `stepAudio[]` array.

---

## Device Info

| Device | IP | Type |
|--------|-----|------|
| Kitchen Display | 192.168.2.75 | Nest Hub Max (1280×800) |
| Living Room TV | 192.168.2.183 | Chromecast on 1080p TV |

---

## Netlify Alias Notes

- Each screen gets a **unique alias** on the `boston-is-weak` project
- `family-calendar-v2--boston-is-weak.netlify.app`
- `family-chores--boston-is-weak.netlify.app`
- `family-meals--boston-is-weak.netlify.app`
- `recipe-card--spectacular-puppy-bbc012.netlify.app`
- **Never use `--prod`** on a project with existing content — it overwrites the live site
- Use the staging alias URL for all casts

---

## DashCast Troubleshooting

**"waiting for address" on Nest Hub:**
- HERE.NOW anonymous cast sessions go stale after ~30s idle
- `dashcast.py` auto-detects HERE.NOW URLs and tries a data: reset page first
- If that fails, use the Netlify alias URL instead (Netlify URLs are permanent)

**Cast seems to succeed but display doesn't update:**
- Nest Hub may be caching the old URL's content
- Force a re-cast: `python3 skills/dashcast/dashcast.py <url> "Kitchen Display" --force`
- If still stuck, cast a different URL first to clear the session, then cast back

**How DashCast works:** `dashcast.py` communicates with the Nest Hub at `192.168.2.75:8009` via the Chromecast protocol and tells it to load the URL as a Cast URL. The Nest Hub then loads the page in its Cast browser.

---

## Key Files

```
skills/google-home-visual/
├── generate-family-calendar-v2.py   ← Calendar generator
├── generate-family-chores.py        ← Chores generator
├── generate-family-meals.py         ← Meals generator
├── family-calendar-hubmax-v2.html   ← Calendar output
├── family-chores-hubmax.html        ← Chores output
├── family-meals-hubmax.html         ← Meals output
├── interactive-recipe-card.html    ← Recipe card template
├── SKILL.md                         ← Old recipe workflow (partially stale)
├── TV-LAYOUT.md                     ← TV display specs
└── TV-LESSONS.md                    ← TV display lessons
```

---

## Adding New Screens

1. Build a generator script (or static HTML)
2. Add it to this skill directory
3. Deploy to a new Netlify alias: `netlify deploy --dir <dir> --alias <unique-name>`
4. Cast: `python3 skills/dashcast/dashcast.py "<url>" "Kitchen Display" --force`