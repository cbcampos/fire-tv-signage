---
description: Start, stop, restart, and health-check the Fire TV Signage backend
priority: high
links:
  - SKILL
  - fire-tv-signage.devices
  - fire-tv-signage.content
---

# fire-tv-signage.manage

Start, stop, restart, and health-check the Fire TV Signage backend.

## Backend Details
- **Location:** `~/.openclaw/workspace/fire-tv-signage/backend/`
- **URL:** `http://192.168.2.90:3002`
- **Admin UI:** `http://192.168.2.90:3002` (in browser)
- **Startup:** `node server.mjs` (Node.js ES module, `type: module` in package.json)

## Commands

### Start the backend
```bash
cd ~/.openclaw/workspace/fire-tv-signage/backend && node server.mjs &
```

### Health check
```bash
curl http://127.0.0.1:3002/api/health
```
Returns: `{"ok":true,"devices":N,"pendingPairings":M}`

### Check admin state
```bash
curl http://127.0.0.1:3002/api/admin/state
```
Returns full state including all devices and pending pairings.

### Stop the backend
```bash
pkill -f "node server.mjs" || pkill -f "fire-tv-signage"
```

### Restart (stop + start)
```bash
pkill -f "node server.mjs" 2>/dev/null; sleep 1; cd ~/.openclaw/workspace/fire-tv-signage/backend && node server.mjs &
```

## Log
Backend stdout/stderr goes to `~/.openclaw/workspace/logs/fire-tv-signage.log`.

## When to restart
- After editing the server.mjs
- After changing device state via CLI (usually live reload is automatic, but if behavior seems stale)

See also: [[fire-tv-signage.devices]], [[fire-tv-signage.content]]
