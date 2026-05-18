#!/usr/bin/env bash
set -euo pipefail

# Read-only Bee weekly export helper.
# Exports recent conversation summaries/transcripts plus daily summaries, facts,
# todos, and journals into this directory. Bee list endpoints mostly lack date
# filters, so this script pages newest-first results and filters locally by ms
# timestamps.

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
OUT_DIR="${1:-$ROOT_DIR}"
DAYS="${BEE_EXPORT_DAYS:-7}"
LIMIT="${BEE_PAGE_LIMIT:-100}"
MAX_PAGES="${BEE_MAX_PAGES:-80}"
BEE_BIN="${BEE_BIN:-bee}"
GET_TIMEOUT="${BEE_GET_TIMEOUT:-60s}"

export DBUS_SESSION_BUS_ADDRESS="${DBUS_SESSION_BUS_ADDRESS:-unix:path=/run/user/1000/bus}"

if ! command -v "$BEE_BIN" >/dev/null 2>&1; then
  echo "Bee CLI not found: $BEE_BIN" >&2
  exit 127
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "jq is required" >&2
  exit 127
fi

mkdir -p "$OUT_DIR" "$OUT_DIR/transcripts" "$OUT_DIR/daily" "$OUT_DIR/journals" "$OUT_DIR/todos" "$OUT_DIR/facts"

NOW_MS="$(node -e 'process.stdout.write(String(Date.now()))')"
CUTOFF_MS="$(DAYS="$DAYS" node -e 'process.stdout.write(String(Date.now() - Number(process.env.DAYS) * 86400000))')"

run_bee() {
  "$BEE_BIN" "$@"
}

run_bee_get_pair() {
  local kind="$1"
  local id="$2"
  local dir="$3"
  local log="$OUT_DIR/export-warnings.log"
  local tmp_json tmp_md
  tmp_json="$(mktemp)"
  tmp_md="$(mktemp)"

  if timeout "$GET_TIMEOUT" "$BEE_BIN" "$kind" get "$id" --json > "$tmp_json" &&
    [[ -s "$tmp_json" ]] &&
    timeout "$GET_TIMEOUT" "$BEE_BIN" "$kind" get "$id" > "$tmp_md" &&
    [[ -s "$tmp_md" ]]; then
    mv "$tmp_json" "$dir/$id.json"
    mv "$tmp_md" "$dir/$id.md"
  else
    echo "WARN: skipped $kind $id after failed or timed-out get" >> "$log"
    rm -f "$dir/$id.json" "$dir/$id.md"
  fi

  rm -f "$tmp_json" "$tmp_md"
}

write_manifest() {
  jq -n \
    --arg generated_at "$(date --iso-8601=seconds)" \
    --arg days "$DAYS" \
    --arg now_ms "$NOW_MS" \
    --arg cutoff_ms "$CUTOFF_MS" \
    --arg bee_bin "$(command -v "$BEE_BIN")" \
    '{generated_at:$generated_at, days:($days|tonumber), now_ms:($now_ms|tonumber), cutoff_ms:($cutoff_ms|tonumber), bee_bin:$bee_bin}' \
    > "$OUT_DIR/manifest.json"
}

list_pages_jsonl() {
  local command="$1"
  local subcommand="$2"
  local out_jsonl="$3"
  local array_key="$4"
  local timestamp_mode="$5"
  local cursor=""
  local page=0

  : > "$out_jsonl"
  while (( page < MAX_PAGES )); do
    local tmp
    tmp="$(mktemp)"
    if [[ -n "$cursor" ]]; then
      run_bee "$command" "$subcommand" --limit "$LIMIT" --cursor "$cursor" --json > "$tmp"
    else
      run_bee "$command" "$subcommand" --limit "$LIMIT" --json > "$tmp"
    fi

    jq -c --arg key "$array_key" '.[$key][]?' "$tmp" >> "$out_jsonl"

    local count min_ts next_cursor
    count="$(jq --arg key "$array_key" '.[$key] | length // 0' "$tmp")"
    min_ts="$(jq --arg key "$array_key" --arg mode "$timestamp_mode" '
      def ts:
        if $mode == "conversation" then (.start_time // .created_at // .updated_at // 0)
        elif $mode == "daily" then (.date_time // .created_at // 0)
        elif $mode == "fact" then (.created_at // .updated_at // 0)
        elif $mode == "todo" then ([.created_at, .alarm_at] | map(select(type == "number")) | min // 0)
        elif $mode == "journal" then (.updated_at // .created_at // 0)
        else (.created_at // 0) end;
      [.[$key][]? | ts] | min // 0
    ' "$tmp")"
    next_cursor="$(jq -r '.next_cursor // empty' "$tmp")"
    rm -f "$tmp"

    (( count == 0 )) && break
    [[ -z "$next_cursor" ]] && break
    if [[ "$min_ts" =~ ^[0-9]+$ ]] && (( min_ts > 0 && min_ts < CUTOFF_MS )); then
      break
    fi
    cursor="$next_cursor"
    ((page += 1))
  done
}

filter_jsonl_since() {
  local in_jsonl="$1"
  local out_json="$2"
  local mode="$3"
  jq -s --argjson cutoff "$CUTOFF_MS" --arg mode "$mode" '
    def keep:
      if $mode == "conversation" then ((.start_time // .created_at // .updated_at // 0) >= $cutoff)
      elif $mode == "daily" then ((.date_time // .created_at // 0) >= $cutoff)
      elif $mode == "fact" then ((.created_at // .updated_at // 0) >= $cutoff)
      elif $mode == "todo" then (((.created_at // 0) >= $cutoff) or ((.alarm_at // 0) >= $cutoff))
      elif $mode == "journal" then (((.updated_at // 0) >= $cutoff) or ((.created_at // 0) >= $cutoff))
      else false end;
    map(select(keep))
  ' "$in_jsonl" > "$out_json"
}

write_manifest
run_bee status > "$OUT_DIR/bee-status.txt" 2>&1 || true
run_bee --help > "$OUT_DIR/bee-help.txt" 2>&1 || true
: > "$OUT_DIR/export-warnings.log"

# Conversations: list summaries, then fetch full transcript JSON and markdown.
list_pages_jsonl conversations list "$OUT_DIR/conversations-all.jsonl" conversations conversation
filter_jsonl_since "$OUT_DIR/conversations-all.jsonl" "$OUT_DIR/conversations-week.json" conversation
jq -r '.[] | [.id, (.start_time / 1000 | strftime("%Y-%m-%d %H:%M")), .state, (.utterances_count // 0), (.short_summary // "")] | @tsv' \
  "$OUT_DIR/conversations-week.json" > "$OUT_DIR/week-conversation-ids.txt"
jq -n --arg timezone "America/Chicago" --slurpfile conversations "$OUT_DIR/conversations-week.json" \
  '{timezone:$timezone, conversations:$conversations[0], next_cursor:null}' > "$OUT_DIR/conversations-raw.json"

while IFS=$'\t' read -r id _rest; do
  [[ -z "${id:-}" ]] && continue
  run_bee_get_pair conversations "$id" "$OUT_DIR/transcripts"
done < "$OUT_DIR/week-conversation-ids.txt"

jq -r '
  ["# Bee Conversation Summaries", ""] +
  (map("## Conversation \(.id)\n\n- start_time: \((.start_time / 1000) | strftime("%Y-%m-%d %H:%M"))\n- state: \(.state)\n- utterances_count: \(.utterances_count // 0)\n- short_summary: \(.short_summary // "")\n\n\(.summary // "(no summary)")\n") )
  | join("\n")
' "$OUT_DIR/conversations-week.json" > "$OUT_DIR/conversation-summaries.md"

# Daily summaries.
list_pages_jsonl daily list "$OUT_DIR/daily-all.jsonl" daily_summaries daily
filter_jsonl_since "$OUT_DIR/daily-all.jsonl" "$OUT_DIR/daily-week.json" daily
jq -r '.[].id' "$OUT_DIR/daily-week.json" | while read -r id; do
  [[ -z "$id" ]] && continue
  run_bee_get_pair daily "$id" "$OUT_DIR/daily"
done

# Facts, todos, and journals. Facts list output is sufficient; todos and
# journals also have get endpoints, so fetch detail files for week hits.
list_pages_jsonl facts list "$OUT_DIR/facts-all.jsonl" facts fact
filter_jsonl_since "$OUT_DIR/facts-all.jsonl" "$OUT_DIR/facts-week.json" fact
jq -r '.[] | "- [\(.id)] \(.text)"' "$OUT_DIR/facts-week.json" > "$OUT_DIR/facts-week.md"

list_pages_jsonl todos list "$OUT_DIR/todos-all.jsonl" todos todo
filter_jsonl_since "$OUT_DIR/todos-all.jsonl" "$OUT_DIR/todos-week.json" todo
jq -r '.[].id' "$OUT_DIR/todos-week.json" | while read -r id; do
  [[ -z "$id" ]] && continue
  run_bee_get_pair todos "$id" "$OUT_DIR/todos"
done

list_pages_jsonl journals list "$OUT_DIR/journals-all.jsonl" journals journal
filter_jsonl_since "$OUT_DIR/journals-all.jsonl" "$OUT_DIR/journals-week.json" journal
jq -r '.[].id' "$OUT_DIR/journals-week.json" | while read -r id; do
  [[ -z "$id" ]] && continue
  run_bee_get_pair journals "$id" "$OUT_DIR/journals"
done

jq -n \
  --slurpfile conversations "$OUT_DIR/conversations-week.json" \
  --slurpfile daily "$OUT_DIR/daily-week.json" \
  --slurpfile facts "$OUT_DIR/facts-week.json" \
  --slurpfile todos "$OUT_DIR/todos-week.json" \
  --slurpfile journals "$OUT_DIR/journals-week.json" \
  '{conversations:($conversations[0]|length), daily:($daily[0]|length), facts:($facts[0]|length), todos:($todos[0]|length), journals:($journals[0]|length)}' \
  > "$OUT_DIR/export-counts.json"

echo "Export complete: $OUT_DIR"
cat "$OUT_DIR/export-counts.json"
