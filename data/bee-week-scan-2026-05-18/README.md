# Bee Week Scan - 2026-05-18

Read-only tooling and outputs for exporting the last 7 days of Bee data.

## Re-run

```bash
cd /home/ccampos/.openclaw/workspace
data/bee-week-scan-2026-05-18/export-bee-week.sh
```

Useful overrides:

```bash
BEE_EXPORT_DAYS=7 BEE_PAGE_LIMIT=100 BEE_MAX_PAGES=80 BEE_GET_TIMEOUT=60s data/bee-week-scan-2026-05-18/export-bee-week.sh
```

The script sets `DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1000/bus` unless already set, because Bee auth uses the desktop secret store.

## What It Exports

- `conversations-raw.json` and `conversations-week.json`: conversation list/summary records for the window.
- `conversation-summaries.md`: readable summary rollup.
- `week-conversation-ids.txt`: tab-separated ID, start time, state, utterance count, short summary.
- `transcripts/<id>.json` and `transcripts/<id>.md`: full transcripts for each week conversation.
- `daily-week.json` plus `daily/<id>.json|md`: daily summaries in the window.
- `facts-week.json` and `facts-week.md`: facts created in the window.
- `todos-week.json` plus `todos/<id>.json|md`: todos created or alarmed in the window.
- `journals-week.json` plus `journals/<id>.json|md`: journals created or updated in the window.
- `export-counts.json`: count summary from the last run.
- `export-warnings.log`: skipped detail fetches if an individual Bee record times out or fails.
- `manifest.json`: run timestamp, cutoff, and CLI path.

## Bee CLI Capability Notes

Observed local CLI commands:

```text
bee conversations list [--limit N] [--cursor <cursor>] [--json]
bee conversations get <id> [--json]
bee daily list [--limit N] [--cursor CURSOR] [--json]
bee daily get <id> [--json]
bee facts list [--limit N] [--cursor <cursor>] [--unconfirmed] [--json]
bee todos list [--limit N] [--cursor <cursor>] [--json]
bee journals list [--limit N] [--cursor <cursor>] [--json]
bee search --query <text> [--limit N] [--since <epochMs>] [--until <epochMs>] [--neural] [--json]
bee sync [--output <dir>] [--only <facts|todos|daily|conversations>]
bee changed [--cursor <cursor>] [--json]
```

Date filtering is limited. `bee search` supports `--since/--until`, but it is search-oriented and requires a query. `conversations`, `daily`, `facts`, `todos`, and `journals` list commands support pagination only, so the reliable fallback is to page newest-first and filter locally by timestamp. `bee sync` exports broad markdown sets but the installed source does not implement the `--recent-days` option mentioned in older docs.

## Safety

The script uses only Bee read endpoints: `status`, `list`, and `get`. It intentionally does not call `facts create/update/delete` or `todos create/update/delete`.
