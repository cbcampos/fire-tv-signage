#!/bin/bash
set -euo pipefail

# backup_to_github.sh - Disaster-recovery backup with hard secret exclusions
# Keeps only non-sensitive config/docs/state needed for rebuilds.
# Never backs up credentials, identity, auth profiles, session stores, env files, or raw tokens.

BACKUP_REPO="cbcampos/openclaw-backup-v2"
LOG="$HOME/.openclaw/workspace/scripts/cron-log/backup.log"
DEST="/tmp/oc-backup"
mkdir -p "$(dirname "$LOG")"
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Backup starting" | tee -a "$LOG"

cleanup() {
    rm -rf "$DEST"
}
trap cleanup EXIT

rm -rf "$DEST"
mkdir -p \
    "$DEST/openclaw" \
    "$DEST/openclaw/settings" \
    "$DEST/openclaw/workflows" \
    "$DEST/workspace"

copy_if_exists() {
    local src="$1"
    local dst="$2"
    [ -e "$src" ] || return 0
    mkdir -p "$(dirname "$dst")"
    cp -R "$src" "$dst"
}

safe_rsync() {
    local src="$1"
    local dst="$2"
    shift 2
    [ -e "$src" ] || return 0
    mkdir -p "$dst"
    rsync -a "$@" "$src" "$dst"
}

# OpenClaw config: safe rebuild inputs only
copy_if_exists "$HOME/.openclaw/openclaw.json" "$DEST/openclaw/openclaw.json"
copy_if_exists "$HOME/.openclaw/cron/jobs.json" "$DEST/openclaw/cron-jobs.json"
safe_rsync "$HOME/.openclaw/settings/" "$DEST/openclaw/settings/" --include='*.json' --exclude='*'
safe_rsync "$HOME/.openclaw/workflows/" "$DEST/openclaw/workflows/" --include='*.json' --exclude='*'

# Workspace memory/docs with aggressive secret/state exclusions
safe_rsync "$HOME/.openclaw/workspace/memory/" "$DEST/workspace/memory/" \
    --exclude='.obsidian/' \
    --exclude='.dreams/' \
    --exclude='.stfolder/' \
    --exclude='export_package.tgz' \
    --exclude='*.db' \
    --exclude='*.sqlite' \
    --exclude='*.sqlite3' \
    --exclude='*.tgz' \
    --exclude='*.zip' \
    --exclude='session-context*.json' \
    --exclude='heartbeat-context.json' \
    --exclude='decision-context.json'

safe_rsync "$HOME/.openclaw/workspace/skills/" "$DEST/workspace/skills/" \
    --include='*/' --include='*.md' --include='*.json' --exclude='*'

for f in HEARTBEAT.md MEMORY.md SOUL.md USER.md AGENTS.md TOOLS.md IDENTITY.md BOOTSTRAP.md BRAIN.md; do
    [ -f "$HOME/.openclaw/workspace/$f" ] && cp "$HOME/.openclaw/workspace/$f" "$DEST/workspace/"
done

safe_rsync "$HOME/.openclaw/workspace/data/" "$DEST/workspace/data/" \
    --include='*/' \
    --include='*.json' \
    --include='*.md' \
    --exclude='*.sqlite' \
    --exclude='*.sqlite3' \
    --exclude='*.db' \
    --exclude='memory_sync.db' \
    --exclude='cron-log.db' \
    --exclude='me_and_you_cal.json' \
    --exclude='me_and_you_events.json' \
    --exclude='personal_cal.json' \
    --exclude='personal_events.json' \
    --exclude='work_events.json' \
    --exclude='voice_notes/' \
    --exclude='podcasts/' \
    --exclude='team-test/' \
    --exclude='forge-ahead-april7-pm/' \
    --exclude='*' 

safe_rsync "$HOME/.openclaw/workspace/stories/" "$DEST/workspace/stories/" \
    --include='*/' --include='*.md' --include='*.txt' --exclude='*'

safe_rsync "$HOME/.openclaw/workspace/scripts/" "$DEST/workspace/scripts/" \
    --include='*.sh' --include='*.py' --include='*.md' --exclude='*'

cat > "$DEST/.gitignore" <<'EOF'
*
!.gitignore
!openclaw/
!openclaw/**
!workspace/
!workspace/**
EOF

cd "$DEST"
git init -q
git remote add origin "https://github.com/$BACKUP_REPO.git" 2>/dev/null || git remote set-url origin "https://github.com/$BACKUP_REPO.git"
git checkout -B master >/dev/null 2>&1
git add .
if git diff --cached --quiet; then
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] No backup changes to commit" | tee -a "$LOG"
else
    git commit -m "Backup: $(date '+%Y-%m-%d %H:%M')" >/dev/null
fi

echo "[$(date '+%Y-%m-%d %H:%M:%S')] Pushing..." | tee -a "$LOG"
git push origin master --force 2>&1 | tee -a "$LOG"

COUNT=$(find "$DEST" -type f 2>/dev/null | wc -l)
SIZE=$(du -sh "$DEST" 2>/dev/null | cut -f1)
echo "[$(date '+%Y-%m-%d %H:%M:%S')] Done. $COUNT files, $SIZE" | tee -a "$LOG"
