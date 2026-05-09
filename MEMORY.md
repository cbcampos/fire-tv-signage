## OpenClaw Bootstrap Memory

### System
- Host: `ccampos-Surface-Pro-6`
- Timezone: `America/Chicago`
- Primary agent: `main` (`Dobby`)
- Other agents in active use: `forge`, `flaire`, `codex`
- Gateway config: `~/.openclaw/openclaw.json`
- Gateway service: `openclaw-gateway.service`
- Gateway restart command: `openclaw gateway restart`

### Model Policy
- Default text model: `minimax-portal/MiniMax-M2.7`
- Active-memory model: `minimax-portal/MiniMax-M2.7-highspeed`
- Codex is available as a first-class sub-agent via `sessions_spawn(agentId: "codex")`. Use it for coding tasks that benefit from GPT-5.5. Do NOT switch the main session model to Codex — keep MiniMax for all primary operations.
- Cron jobs should run MiniMax-first.

### Gateway Rules
- Use the smallest safe non-destructive repair first.
- Never weaken auth, expose secrets, or relax access policy.
- Avoid live edits to cron/session stores unless there is a clear store-corruption reason and a backup exists.
- Restarts do not create new sessions; persisted session state survives restart.
- Browser-backed tasks can delay shutdown enough to trigger a forced systemd kill.

### Current Operational State
- OpenClaw version expected on this host: `2026.4.26`
- Main session should remain MiniMax-first.
- Cron jobs should run MiniMax-first.
- `Telegram default` is known to be enabled but unconfigured.
- mDNS/bonjour may disable itself noisily without implying gateway failure.
- Telegram may fall back to sticky IPv4 on intermittent network issues.

### Key Paths
- Workspace: `~/.openclaw/workspace`
- Memory archive: `~/.openclaw/workspace/memory/`
- Incidents: `~/.openclaw/workspace/incidents/`
- Inbox summaries: `~/.openclaw/workspace/inbox/`
- Main session store: `~/.openclaw/agents/main/sessions/sessions.json`
- Auth profiles: `~/.openclaw/agents/main/agent/auth-profiles.json`
- Gateway managed env: `~/.openclaw/gateway.systemd.env`

### Durable User Context
- User: Chris Campos
- Family: Amanda, Franklin, Mae
- Work: Forge AHEAD Center / UAB communications
- Primary outbound identity for assistant email: `clawdobby@gmail.com`
- Google Workspace account for Chris operations: `chris.campos@gmail.com`

### Key Integrations
- Discord is the primary agent surface.
- Telegram is configured for selected bots; one default account is intentionally not configured.
- Todoist, Google Workspace, and Dropbox are active automation dependencies.
- Nest/Google Home display workflows exist; see detailed memory files before changing device-specific behavior.
- **Fire TV Signage:** Local dashboard server at `http://192.168.2.90:8888/` serves private dashboards over LAN. Skill: `skills/fire-tv-signage/`

### Known Issues To Remember
- `MEMORY.md` should stay compact; detailed history belongs in `memory/` files.
- If Discord providers flap but recover on retry, treat that separately from gateway-down events.
- If restart behavior is poor, inspect browser tasks and systemd stop timeout before assuming model failure.
- If status surfaces disagree about MiniMax auth, check the live process environment before changing auth config.

### Detailed References
- Operational history and dated notes: `~/.openclaw/workspace/memory/`
- Current incidents: `~/.openclaw/workspace/incidents/`
- Gateway summaries for handoff: `~/.openclaw/workspace/inbox/`
- Session-specific state: `~/.openclaw/workspace/memory/session-context.json`

## Promoted From Short-Term Memory (2026-05-05)

<!-- openclaw-memory-promotion:memory:memory/2026-04-27.md:1:4 -->
- ### Franklin Pickup Reminder (13:50 CST) - Calendar event title is "Pick Up Franklin from School", not "pick up franklin" - Fixed match logic: now catches both "pick up franklin" and "pick up" + "franklin" in same title [score=0.957 recalls=4 avg=0.910 source=memory/2026-04-27.md:1-4]
<!-- openclaw-memory-promotion:memory:memory/2026-04-29.md:6:6 -->
- **Problem:** User lookup failed with `ERR_MODULE_NOT_FOUND: Cannot find package '@vercel/kv'` [score=0.862 recalls=0 avg=0.620 source=memory/2026-04-29.md:6-6]
<!-- openclaw-memory-promotion:memory:memory/2026-04-29.md:10:10 -->
- **Files changed:** [score=0.862 recalls=0 avg=0.620 source=memory/2026-04-29.md:10-10]
<!-- openclaw-memory-promotion:memory:memory/2026-04-29.md:16:16 -->
- **Also fixed:** `_clubs.js` had a double `});)` syntax error introduced during edits. [score=0.862 recalls=0 avg=0.620 source=memory/2026-04-29.md:16-16]

## Promoted From Short-Term Memory (2026-05-06)

<!-- openclaw-memory-promotion:memory:memory/2026-04-29.md:19:19 -->
- **Problem:** Password reset API returned 200 but email never sent. Tested directly — 401 from Resend API. [score=0.882 recalls=0 avg=0.620 source=memory/2026-04-29.md:19-19]
<!-- openclaw-memory-promotion:memory:memory/2026-04-30.md:5:5 -->
- Chris is open to Stripe Link as a future autonomous purchasing tool, with these guardrails: [score=0.860 recalls=0 avg=0.620 source=memory/2026-04-30.md:5-5]

## Promoted From Short-Term Memory (2026-05-07)

<!-- openclaw-memory-promotion:memory:memory/2026-04-30.md:11:11 -->
- **Use cases considered:** [score=0.879 recalls=0 avg=0.620 source=memory/2026-04-30.md:11-11]
<!-- openclaw-memory-promotion:memory:memory/2026-04-30.md:16:16 -->
- **Status:** Deferred. Don't implement until a concrete use case arises where asking first is actually a blocker. Keep the idea in TOOLS.md. [score=0.873 recalls=0 avg=0.620 source=memory/2026-04-30.md:16:16]

## Major Events This Week (2026-05-06 through 2026-05-08)

### Amanda Claire's Job Crisis
- Lost her job / received formal written warning at work this week
- HR involvement, needs to write a personal improvement plan
- Considering resigning from children's ministry at church (told Brandon)
- Therapist recommended psychiatric evaluation at UAB's Center for Psychiatric Medicine to properly diagnose ADHD/depression/anxiety
- Amanda's mother gave toxic advice: suggested she leave Chris, "document" things for custody
- Amanda considering cutting off her mother; baby dedication Sunday may not involve Amanda's parents

### Marriage Support
- Chris had counseling session (May 8) — therapist validated his role as "peacekeeper" across multiple family systems
- Chris opened up to his own mother about marital struggles — she responded supportively and offered to help them get away together
- Next counseling session: June 26th at 10 AM
- In-laws visiting this weekend for baby dedication (Amanda Claire felt obligated to say yes despite burden)

### Franklin
- Field Day May 8 — class won final Tug of War; teachers Miss Smitherman and Miss Carpenter
- Parent-teacher conference: doing very well academically and socially
- Teacher recommends separating Franklin from Henry/Harley for kindergarten
- Strong literacy and math; needs practice writing last name
- School plant needs repotting into larger container

### Work (Jim Pop / UAB)
- Jim Pop website nearing completion: finalized "Jim Pop Framework" naming, removed NIH-non-compliant language, updated CAB page
- Moving newsletter to quarterly (was monthly); May newsletter needs review
- Faculty retreat at Algen coming up (Thursday/Friday)
