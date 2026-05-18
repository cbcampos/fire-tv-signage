#!/usr/bin/env bash
set -euo pipefail

# Exact-window Bee export helper. Read-only.
# Requires BEE_SINCE_MS and BEE_UNTIL_MS. Pages newest-first endpoints and
# filters locally to [since, until).

OUT_DIR="${1:?usage: bee-weekly-export-window.sh <out-dir>}"
LIMIT="${BEE_PAGE_LIMIT:-100}"
MAX_PAGES="${BEE_MAX_PAGES:-80}"
BEE_BIN="${BEE_BIN:-bee}"
GET_TIMEOUT="${BEE_GET_TIMEOUT:-60s}"
SINCE_MS="${BEE_SINCE_MS:?BEE_SINCE_MS required}"
UNTIL_MS="${BEE_UNTIL_MS:?BEE_UNTIL_MS required}"
TZ_NAME="${BEE_REPORT_TZ:-America/Chicago}"

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
: > "$OUT_DIR/export-warnings.log"

run_bee() { "$BEE_BIN" "$@"; }

run_bee_get_pair() {
  local kind="$1" id="$2" dir="$3" log="$OUT_DIR/export-warnings.log"
  local tmp_json tmp_md
  tmp_json="$(mktemp)"; tmp_md="$(mktemp)"
  if timeout "$GET_TIMEOUT" "$BEE_BIN" "$kind" get "$id" --json > "$tmp_json" && [[ -s "$tmp_json" ]] &&
     timeout "$GET_TIMEOUT" "$BEE_BIN" "$kind" get "$id" > "$tmp_md" && [[ -s "$tmp_md" ]]; then
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
    --arg since_ms "$SINCE_MS" \
    --arg until_ms "$UNTIL_MS" \
    --arg bee_bin "$(command -v "$BEE_BIN")" \
    '{generated_at:$generated_at, since_ms:($since_ms|tonumber), until_ms:($until_ms|tonumber), bee_bin:$bee_bin, mode:"exact-window"}' \
    > "$OUT_DIR/manifest.json"
}

list_pages_jsonl() {
  local command="$1" subcommand="$2" out_jsonl="$3" array_key="$4" timestamp_mode="$5"
  local cursor="" page=0
  : > "$out_jsonl"
  while (( page < MAX_PAGES )); do
    local tmp count min_ts next_cursor
    tmp="$(mktemp)"
    if [[ -n "$cursor" ]]; then
      run_bee "$command" "$subcommand" --limit "$LIMIT" --cursor "$cursor" --json > "$tmp"
    else
      run_bee "$command" "$subcommand" --limit "$LIMIT" --json > "$tmp"
    fi
    jq -c --arg key "$array_key" '.[$key][]?' "$tmp" >> "$out_jsonl"
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
    if [[ "$timestamp_mode" != "todo" ]] && [[ "$min_ts" =~ ^[0-9]+$ ]] && (( min_ts > 0 && min_ts < SINCE_MS )); then
      break
    fi
    cursor="$next_cursor"
    ((page += 1))
  done
}

filter_jsonl_window() {
  local in_jsonl="$1" out_json="$2" mode="$3"
  jq -s --argjson since "$SINCE_MS" --argjson until "$UNTIL_MS" --arg mode "$mode" '
    def ts:
      if $mode == "conversation" then (.start_time // .created_at // .updated_at // 0)
      elif $mode == "daily" then (.date_time // .created_at // 0)
      elif $mode == "fact" then (.created_at // .updated_at // 0)
      elif $mode == "journal" then (.updated_at // .created_at // 0)
      else (.created_at // 0) end;
    def in_window($v): (($v // 0) >= $since and ($v // 0) < $until);
    if $mode == "todo" then
      map(select(in_window(.created_at) or in_window(.alarm_at)))
    else
      map(select((ts >= $since) and (ts < $until)))
    end
  ' "$in_jsonl" > "$out_json"
}

write_manifest
run_bee status > "$OUT_DIR/bee-status.txt" 2>&1 || true
run_bee --help > "$OUT_DIR/bee-help.txt" 2>&1 || true

list_pages_jsonl conversations list "$OUT_DIR/conversations-all.jsonl" conversations conversation
filter_jsonl_window "$OUT_DIR/conversations-all.jsonl" "$OUT_DIR/conversations-week.json" conversation
jq -r '.[] | [.id, (.start_time / 1000 | strftime("%Y-%m-%d %H:%M")), .state, (.utterances_count // 0), (.short_summary // "")] | @tsv' "$OUT_DIR/conversations-week.json" > "$OUT_DIR/week-conversation-ids.txt"
jq -n --arg timezone "$TZ_NAME" --slurpfile conversations "$OUT_DIR/conversations-week.json" '{timezone:$timezone, conversations:$conversations[0], next_cursor:null}' > "$OUT_DIR/conversations-raw.json"
while IFS=$'\t' read -r id _rest; do
  [[ -z "${id:-}" ]] && continue
  run_bee_get_pair conversations "$id" "$OUT_DIR/transcripts"
done < "$OUT_DIR/week-conversation-ids.txt"

list_pages_jsonl daily list "$OUT_DIR/daily-all.jsonl" daily_summaries daily
filter_jsonl_window "$OUT_DIR/daily-all.jsonl" "$OUT_DIR/daily-week.json" daily
jq -r '.[].id' "$OUT_DIR/daily-week.json" | while read -r id; do [[ -n "$id" ]] && run_bee_get_pair daily "$id" "$OUT_DIR/daily"; done

list_pages_jsonl facts list "$OUT_DIR/facts-all.jsonl" facts fact
filter_jsonl_window "$OUT_DIR/facts-all.jsonl" "$OUT_DIR/facts-week.json" fact
jq -r '.[] | "- [\(.id)] \(.text // .content // .summary // tostring)"' "$OUT_DIR/facts-week.json" > "$OUT_DIR/facts-week.md"

list_pages_jsonl todos list "$OUT_DIR/todos-all.jsonl" todos todo
filter_jsonl_window "$OUT_DIR/todos-all.jsonl" "$OUT_DIR/todos-week.json" todo
jq -r '.[].id' "$OUT_DIR/todos-week.json" | while read -r id; do [[ -n "$id" ]] && run_bee_get_pair todos "$id" "$OUT_DIR/todos"; done

list_pages_jsonl journals list "$OUT_DIR/journals-all.jsonl" journals journal
filter_jsonl_window "$OUT_DIR/journals-all.jsonl" "$OUT_DIR/journals-week.json" journal
jq -r '.[].id' "$OUT_DIR/journals-week.json" | while read -r id; do [[ -n "$id" ]] && run_bee_get_pair journals "$id" "$OUT_DIR/journals"; done

jq -n \
  --slurpfile conversations "$OUT_DIR/conversations-week.json" \
  --slurpfile daily "$OUT_DIR/daily-week.json" \
  --slurpfile facts "$OUT_DIR/facts-week.json" \
  --slurpfile todos "$OUT_DIR/todos-week.json" \
  --slurpfile journals "$OUT_DIR/journals-week.json" \
  '{conversations:($conversations[0]|length), daily:($daily[0]|length), facts:($facts[0]|length), todos:($todos[0]|length), journals:($journals[0]|length)}' > "$OUT_DIR/export-counts.json"

echo "Export complete: $OUT_DIR"
cat "$OUT_DIR/export-counts.json"
