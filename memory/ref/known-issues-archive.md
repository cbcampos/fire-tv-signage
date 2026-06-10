# Known Issues Archive — Full Entries

> Moved from MEMORY.md bootstrap to stay under the 10KB cap. Summaries remain in MEMORY.md.

## 2026-06-08: Franklin-Man manuscripts — STOP doing big rewrites
Sister-Keeper v2 (12:50 CT) was called "a real manuscript, not a draft being shaped." Switch to read-aloud testing + small trims ONLY where Chris's mouth trips. Don't propose structural rewrites, don't sub-agent a "v3" pass unprompted, don't re-spawn a fresh draft. Chris is the editor; Dobby is the operator. If something genuinely needs to change, flag it small and ask.

## 2026-06-08: Kids' story chapter images — VERIFIED working path
Codex sub-agent on gpt-5.4. Spawn template, prompt requirements, failure modes, and biases all live in `memory/ref/kids-story-image-gen.md` → "Sister-Keeper Fix — VERIFIED WORKING PATH". **NEVER use main-session `image_generate` for chapter art** — default model `minimax-portal/image-01` (= gpt-image-1.5) has a 1500-char prompt limit that compresses out Spider arms, breed details, and character specs.

## 2026-06-08: 3 subagent failure modes to watch for
(a) Subagent reports "saved" but file isn't on disk → always `ls -la` after completion event. (b) Poll-without-yield matches a stale unrelated JPG in a shared outbound dir → never poll, use push-based events. (c) Subagent succeeds but produces wrong content (model non-determinism) → for stories with specific character appearances, do 5–10 trial runs first.

## 2026-06-08: 3 model biases to counter
gpt-image-2 defaults to (1) Superman-S for "boy in cape + blue shirt", (2) Venom/Spider-Verse for "spider" + "mask" + "webbing", (3) adult-with-glasses for "man in bed". **"NOT X" instructions inline BACKFIRE** — the model latches onto the forbidden reference. Use a single `Avoid:` list at the END of the prompt (Marvel, DC, Spider-Man, Superman, Venom, Miles Morales, photorealistic, etc.). Always include family photo as `image` param to lock skin tone / hair.

## 2026-06-08: Bee Reflect Daily cron — facts/journals filter bug
The 8:20 PM "Daily Reflection" was dumping `bee facts list --limit 20` raw with zero date filtering, so it recycled facts captured days/weeks ago and labeled them "What's New Today". Fix: `scripts/bee_reflect_writer.py` now parses `--json` output, filters `created_at` (or `start_time` for convs) to `[start_of_target_day, start_of_target_day+1)` in `America/Chicago` (via `zoneinfo`), and shows explicit "No new X captured today" lines when nothing qualifies. `scripts/bee-reflect-cron-check.sh` now calls bee with `--json` for facts/journals/conversations, computes start/end epoch ms in CT, and passes them. Lesson: when a "daily" surface shows stale data, the bug is almost always "the source returned a limit-N list without a date filter" — not "Bee didn't capture today".

## 2026-06-08: "Failed" subagent status is often non-fatal
"OpenClaw recorded a native Codex tool.call without a matching tool.result" usually means the file is already saved and a runtime race happened after. Always verify with `ls -la`, don't reject on status alone.

## 2026-06-07: Edit tool — silent batch failure
A multi-edit call returns "Validation failed" with NO indication of which entry failed, and ZERO entries are applied. Rule: critical bulk edits, do them one at a time.

## 2026-06-07: YouTube channel routing
`videos.insert` has no `channelId` param — uploads always go to the primary channel. Always verify `videos.list?part=snippet&id=<videoId>` → check `snippet.channelId` after upload. Full: `memory/ref/youtube-channel-routing.md`.

## 2026-06-06: Franklin video assets wrong folder
Dumped videos in `running-ig/assets/`. Chris flagged. Consolidated to `media/franklin-story/`.

## 2026-06-05: TTS voice = `en-US-AndrewNeural`
Not `AndrewMultilingualNeural`.

## 2026-06-08: Story build script clone-and-forget output paths
When cloning `make-sister-keeper-video.py` → `make-shield-spinner-video.py`, I forgot to rename the output `main_path` / `share_path` to the new slug. The build succeeded, TTS + segments + concat all worked, but the final ffmpeg encode overwrote the EXISTING sister-keeper `.mp4` (84MB) with shield-spinner data. **Rule:** for ANY cloned make-*video.py, grep the script for the OLD slug (`grep -n "main_path\|share_path\|IMAGES_DIR\|AUDIO_DIR\|BOOK_TITLE"`) and update ALL old-slug references BEFORE running. Verify `ls -la` of the destination file shows the expected old file size + new mtime pattern. Recoverable from `/tmp/<slug>-build/full.mp4`.

## 2026-06-08: Lullaby cast failures — pre-clean orphan watchdog + http server first
If `cast-lullaby.sh` exits with "Failed to connect to service HostServiceInfo(...):8009" + "Socket client's thread is stopped" + non-zero rc, check for stale `lullaby_watchdog.py` (parent cast script already dead but watchdog still spinning retry loops) and orphan `lullaby_http_server.py` on port 8775. Cleanup: `pkill -9 -f lullaby_watchdog.py; lsof -ti :8775 | xargs -r kill -9; rm -f state/lullaby-cast/{cast,http}.pid` then retry. Verified 2026-06-08 13:58 — first attempt failed after stale 18h-old watchdog, second attempt succeeded in 5s.

## 2026-06-05: Default Media Receiver on Nest Hub Max
Plays audio reliably but does NOT always wake the screen for video. Use Web Receiver for video.

## 2026-06-09: Bee mishears Amanda Johnson as "Adele"
Bee frequently mishears "Amanda" as "Adele." The 10:00 "Chris + Amanda" call summary attributed the call to "Adele" even though the Google Calendar attendee was `ajohnson@clarksdalecollegiate.org` (Amanda Johnson, Clarksdale Collegiate Executive Director). Any meeting recap system MUST cross-check caller identity against calendar attendees and treat the calendar as authoritative over Bee's speaker labels or generated summary.

## 2026-06-09 22:04: Bee "we need more [noun]" pattern miss + Unknown-speaker triage
Missed "we need more ice cream" at 6:00 PM (utt #1833 conv 8575346). Two bugs: (1) `\bwe\s+need\s+to\b` regex required "to" after "need" — "we need more [noun]" never matched. (2) The cron's triage auto-skipped `speaker: Unknown` action-phrase hits. Bee's speaker diarization is unreliable (attributed the parent-voice hit to Unknown; Chris's "You ate it all" response was the giveaway). **Fixes:** (a) added `\bwe\s+need\s+(?!\s*to\s)\w+` and `\bI\s+need\s+(?!\s*to\s)\w+` patterns to `scripts/bee-live-window.py` ACTION_PATTERNS (the lookahead `(?!\s*to\s)` ensures "we need to" still goes to the original `need to` pattern, no double-fire). (b) New triage rule: `speaker: Unknown` is an "investigate context" signal, NOT a skip. Read 3-5 surrounding utterances; if parent/Chris context, treat as Chris candidate; if pure child speech with no adult follow-up, skip; if ambiguous, surface to Discord for human review. (c) `scripts/test_bee_live_window_patterns.py` — 15 assertions lock the new patterns in. (d) Prompt updated: `cron/bee-live-capture-prompt.md` documents the new patterns and the Unknown-speaker rule with the exact 6:00 PM ice-cream example. **Todoist entry:** "ice cream" added to Shopping project (id `6Crfx7wRcx657GMp`), task id `6gqWJMQ3fmmpx2gG`, label `bee-capture`. Added 2026-06-09 22:04 CT with full audit note as description.

## 2026-06-09 21:30: Bee summarizer propagates a name said once across the entire summary
Raw utt #46 had Chris say "Adele" once (misheard Amanda). The pre-scan takes names at face value from raw utterances and propagated "Adele" 7 times across the generated summary. **Cross-check any name in a Bee summary against known Bee facts before trusting it**; if a discrepancy, treat the known fact as ground truth and ask Chris to confirm. If uncertain about a person, write "colleague" / "they" — never propagate an unrecognized name from STT.

## 2026-06-09 16:52: Full M2.7→M3 cron sweep — gpt-5.5 fallback was the real failure
Before: 38 agentTurn crons, all on M2.7, several with `fallbacks: [gpt-5.5, M2.7]` chains. After: all 38 on M3, all `fallbacks: []`. Trigger: 5 confirmed-broken crons (Evening Digest, Continuity Action Engine, Franklin Lullaby Cast, Bee Captures Review, Bee Reflect Daily) silently using gpt-5.5 fallback every run for a week, plus hard M2.7 overload errors on bedtime-critical crons. The gpt-5.5 fallback was the **real** failure mode — gpt-5.5 routes to the OpenAI Codex runtime, which has tools our agent runtime doesn't (`codex.list_mcp_resources`, `computer-use.list_apps`), so any time the LLM tried to use them, the run crashed. M3 doesn't have that problem. **Rule going forward:** agentTurn crons are M3 with NO fallbacks. If M3 fails, the run fails honestly — better than a silent crash. Force-test: Meeting Watchdog (4470dd55) verified clean M3 run at 12:42:46 PM CT (22s, NO_REPLY).

## 2026-06-09: Meeting Watchdog — timeout recovery + empty-completion + Codex-tool-crash lessons
**Three confirmed-broken runs in one day on the new shadow rollout:**
1. **12:00 PM CT** — first hourly run timed out at 300s (`last phase: tool-execution-started`); gateway auto-retried at 12:05:45 PM and succeeded in 45s. Recovery works.
2. **12:29:46 PM** — manual run: M2.7 gave an **empty completion** (0 tokens, known issue) while waiting on the exec call; cron retried with gpt-5.5 fallback, which routed to the OpenAI Codex runtime and called `codex.list_mcp_resources` + `computer-use.list_apps` — both Codex-specific tools that don't exist in our agent setup; `list_apps` failed and the run errored.
3. **12:30 PM CT** — the actual watchdog script ran fine (`run_complete` entry in the shadow log proves it). The cron "failure" was upstream plumbing, not the script.

**Fixes applied 2026-06-09 PM:** (a) removed gpt-5.5 fallback (Codex tools don't apply to our runtime — fallbacks to a different runtime are poison), (b) wrapped the exec call in `timeout 30 bash -c '...'` so it can never wedge the agent waiting on output, (c) reduced `toolsAllow` to just `[exec]` to prevent the model from trying to call other tools, (d) made the prompt deterministic: exit 0 → NO_REPLY, exit ≠ 0 → post stderr to #cron-notifications, NO_REPLY. **Verified clean run at 12:42:46 PM CT under new config: 22s, M3, NO_REPLY, shadow log clean.**

## 2026-06-09: Todoist API v1 endpoint required — rest/v2 is deprecated
`api.todoist.com/api/v1/...` works. The old `api.todoist.com/rest/v2/...` path returns "This endpoint is deprecated" with no useful response. Update `scripts/todoist-push-meals.py` and any other Todoist callers if they still use `rest/v2`.

## 2026-06-09: Email monitor reverted to `is:unread` only
Chris said "It's only supposed to flag unread emails." The morning's generalized "kid programs surface regardless of read state" clause was removed. `scripts/email-monitor-formatter.py` SEARCH_QUERY is now a single clause: `is:unread after:yesterday (priority signals incl. franklin OR from:churchcenter.com|churchcenteronline.com|stpetersbhm.org OR from:procaresoftware ...)`. Dry-run after revert: 1 unread priority email (was 10 with the read+unread mix).

## 2026-06-09: Email monitor `extract_body()` + total_count + html-entity bugs (3 fixes)
`scripts/email-monitor-formatter.py` had three bugs the morning's revert exposed:
1. **`extract_body()` didn't handle single-part `text/html` / `text/plain` emails** (no `parts` array) — MemorySync Lunch Briefs are exactly that shape, so their body came back empty and the categorizer dropped them into `general` even when body said "Franklin". Added top-level fallbacks for `payload.mimeType == "text/html"` and `"text/plain"` with no `parts`.
2. **The rich output's "Total: N priority email" counted entries in the `general` bucket** (uncategorized noise) — misleading, since those entries are never rendered. Now `total_count = sum(1 for e in entries if e.category != "general")`.
3. **`_strip_html` decoded `&nbsp;`/`&lt;`/`&gt;` but not `&amp;`** — added.

Tests live at `scripts/test_email_monitor_formatter.py` (31 tests, all pass: extract_body shapes, categorizer signals, format_output count semantics, category render order).

## 2026-06-10 08:53: Cron created 3 gatorade tasks — no Todoist pre-check
Bee Live Capture cron (heartbeat agent) created three identical "gatorade" tasks from three separate utterances across the day: utt #267 (07:56 CT, id `6gqfPh6j85Vv4X5G`), utt #348 (08:05 CT, id `6gqfRMFWjMRG89Xp`), utt #508 (08:53 CT, id `6gqfjFF5Jj4VQGJp`). Chris completed #1 at 08:32, then the cron fired two more times creating #2 and #3. Both unchecked at 08:54 — the duplicate Chris flagged.

**Root cause:** `bee-live-window.py` dedupes correctly at the *utterance* level (per-conversation `acted_through_utterances` counter) so it never re-fires the same utt #348. But the agent that processes the action-phrase hits does **not** check Todoist state before creating. Each new "we need gatorade" / "I need gatorade" utterance is a separate hit → separate Todoist task. The agent's own short-term memory of having created task #1 is gone by the time utt #508 fires in a later act run.

**Fix shipped 2026-06-10 08:54 CT:**
1. **`scripts/todoist-task-dedupe.py`** — atomic create-or-find. Searches active tasks in the target project for a word-boundary substring / exact match, returns the existing id if found, otherwise creates. Flags: `--content`, `--project-id` (default: Shopping `6Crfx7wRcx657GMp`), `--priority`, `--label` (default `bee-capture`), `--noun` (strips leading imperative verb), `--search-only`, `--dry-run`. JSON output: `{"action": "existing"|"created"|"dry_run_would_create"|"not_found", "task_id", "content", "url"}`. Completes with no error on existing.
2. **`scripts/test_todoist_task_dedupe.py`** — 8 tests (all pass): noun extraction across 10 imperative patterns, word-boundary content matching across 10 cases, end-to-end real-Todoist roundtrips (existing task returns existing, new noun creates + second call returns existing, dry-run does NOT create). Cleanup closes the test task via `POST /tasks/{id}/close`.
3. **`HEARTBEAT.md`** Lane 0 — added "Todoist dedupe (REQUIRED)" rule: cron agent MUST run `todoist-task-dedupe.py` before any Todoist creation; if `action: existing`, log as `todoist_existing` (don't recreate); if `action: created`, log as `todoist_shopping` (or appropriate).
4. **Cleanup:** closed both unchecked duplicate gatorade tasks (08:54 CT). Active count: 0. Chris can re-add if he actually still needs gatorade.

**Documented limitation:** word-boundary substring match is a syntactic dedupe, not a semantic one. "gatorade" matches "blue gatorade" (correct — same drink, different flavor) AND "gatorade powder" (hypothetical false positive — different product). A semantic dedupe would need an LLM call or a product ontology; not worth it for the 1×/day shopping-list case.

**Rule going forward:** never call `POST /tasks` directly from the cron agent's action extraction. Always go through `todoist-task-dedupe.py`. If a new dedupe target appears (different project, different content shape), extend the helper rather than inlining the check.

## 2026-06-10 09:08: bee-live-window.py auto-prune wiped acted-state mid-stream — gatorade duplicate #4

**Compounding bug from the 09:53 gatorade incident.** I shipped the Todoist pre-check helper and closed the dups, but at 09:06:44 the Bee Live Capture cron created a FOURTH gatorade task (`6gqfpHGJPHRVxWpp`). The helper prompt update I planned wasn't in place yet, but a deeper issue surfaced in the audit trail: between the 08:53 run that set `acted_through=520` for conv 8585999 and the 09:06 run, the **state file itself was wiped** — mtime jumped from 08:53 to 09:08:39 with the file ending up as `{"conversations": {}}`.

**Root cause:** `bee-live-window.py` had this auto-prune block (lines 430-435 pre-fix):
```python
# Auto-prune: drop tracked convs that are no longer in any window.
in_window_convs = [c for c in conversations if in_window(c, args.minutes)]
in_window_ids = {_conv_id(c) for c in in_window_convs}
stale = [cid for cid in acted.keys() if cid not in in_window_ids]
if stale:
    for cid in stale:
        del acted[cid]
    _save_state(state)
```

A CAPTURING conv that fell out of the 30-min window (e.g., Chris stopped talking for 30+ min during the gatorade pause) had its `acted_through_utterances` entry deleted. The next cron run saw an empty acted state for the conv, re-scanned from utterance 1, found utt #508 gatorade again, and the agent (faithful to the prompt) created another task. The Todoist pre-check helper I shipped earlier never even got a chance to fire because the agent didn't know to call it for a re-seen utterance.

**This was the deeper bug behind the gatorade × 3.** The Todoist pre-check would have caught dup #2 and #3 (same content), but the acted-state wipe meant the agent never recognized utt #508 as already-processed in the first place. The whole "we already created gatorade" trail was lost.

**Fix shipped 2026-06-10 09:13 CT:**
1. **`scripts/bee-live-window.py` prune logic rewrite** — only prune convs that are BOTH (a) NOT in the current window AND (b) either `acted_at` is missing/parse-fails OR `acted_at` is >24h old AND the conv is not currently LIVE/CAPTURING/PROCESSING/IN_PROGRESS. The state-aware branch preserves any conv that the live `bee-now` query still reports as active, even if it fell out of the time window.
2. **Naive-timestamp tolerance** — `acted_at` strings without tzinfo now get the script's local tz applied instead of crashing the subtraction. Pre-existing files (or files hand-edited during incidents) won't poison the prune logic.
3. **`scripts/test_bee_live_window_pruning.py`** — 4 regression tests, all pass:
   - `[PASS] CAPTURING conv state survives 5-min window prune` — the core regression
   - `[PASS] 25h-old COMPLETED conv is pruned` — old entries still drop after 24h
   - `[INFO] recent COMPLETED conv state after run` — recent closed convs keep their state for cron-retry safety
   - `[PASS] orphan entry (no acted_at) is pruned` — pre-schema entries drop
4. **Restored `state/bee-live-acted.json`** for conv 8585999 with `acted_through=520, acted_at=2026-06-10T09:08:00-05:00` so the next cron run sees `new_since=0` and does not re-fire on utt #508. Verified via `bee-live-window.py --minutes 720 --json`.
5. **Closed gatorade task `6gqfpHGJPHRVxWpp`** (the one the 09:06:44 cron created). Net active gatorade: 0.

**Rule going forward:**
- The acted-state file is a **per-conv-durable dedupe**, not a time-window dedupe. Do not auto-prune any conv that could plausibly re-appear in a later `bee-now` query, regardless of how long it's been since the last activity.
- The 24h cap is a safety valve against unbounded state growth, not a feature. Bee convs that complete in a morning should be safely remembered if the same household re-discusses them in the afternoon.
- The Todoist pre-check helper (`scripts/todoist-task-dedupe.py`) and the acted-state dedupe are **complementary** layers, not alternatives. Both are required:
  - **Acted-state** = "I already processed utt #N from conv X" (utterance-level).
  - **Todoist pre-check** = "There's already an open task in Todoist with this content" (project-level).
  - Missing either layer creates a different bug class. The 09:08 incident was a layer-1 (acted-state) failure; the 09:53 incident was a layer-2 (Todoist pre-check) failure.

**Lesson:** any time the state file's mtime jumps without a `--mark-acted` call, suspect the auto-prune. The `bee-live-window.py` `stale` variable name is misleading — it includes live convs that fell out of the time window. Renaming it to `out_of_window_convs` would have made the bug obvious.

- **2026-06-10 11:46:** CSS Grid + flex children — grid items default to `min-width: auto`, so any flex child with intrinsic content width (pill, badge, code, long word) expands the track beyond the column's `1fr`. Symptom: column is wider than the viewport; text gets clipped at the right edge. Fix: `min-width: 0` on every grid item + the flex container inside. Confirmed in work-dashboard.html portrait Asana list (column was 725px on a 393px viewport; `min-width: 0` brought it to 361px).

- **2026-06-10 16:16 — Lemonade × 2 (acted-state worked, dedupe was rule-only, second utterance duped).** The same conversation (8596425) was processed twice in two cron runs: 15:35 CT (utt #165 → `6gqhqPVphvHhV62p`) and 16:07 CT (utt #270 "We need to get lemonade" → `6gqj2jwWMXF3XWrp`). Both runs had valid acted-state increments; the second run saw 153 new utterances and created a new task for one of them. The Todoist pre-check helper (`scripts/todoist-task-dedupe.py`) was a HEARTBEAT.md rule the cron agent could skip, and on the second run the agent created anyway. **Fix shipped 2026-06-10 16:24:** moved the pre-check into `scripts/bee-live-window.py::scan_for_action_phrases()` so it's enforced at the script level, not the agent level. Each hit is now looked up against active Todoist tasks in the Shopping project; matches get `existing_task_id` / `existing_task_url` / `existing_task_content` fields and a `🔁 DUPLICATE` line in the text output. `--no-todoist-precheck` escape hatch for debug. Regression test: `scripts/test_bee_live_window_todoist_precheck.py` (7 tests, all pass). **Rule going forward:** dedupe MUST be enforced in the script that produces the action-item signal. HEARTBEAT.md rules are advisory; agent LLMs can skip them when the pattern looks unambiguous (in this case: a new utterance with a clear noun). The two-layer model from the gatorade incident (acted-state + Todoist pre-check) is intact — both layers are required, and they protect against different failure modes. The acted-state layer was working correctly; the Todoist layer was advisory. The Todoist layer is now mandatory.
