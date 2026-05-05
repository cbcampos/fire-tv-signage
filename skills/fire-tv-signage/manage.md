---
description: Start, stop, restart, and health-check the Fire TV Signage backend
priority: high
links:
  - SKILL
  - fire-tv-signage.devices
---

# fire-tv-signage.manage — Backend Management

## Start Backend
```bash
cd ~/.openclaw/workspace/fire-tv-signage/backend && node server.mjs
# Or:
npm run signage -- start
```

Backend starts on `0.0.0.0:3002`. Data stored in `~/.openclaw/workspace/fire-tv-signage/backend/data/`.

## Health Check
```bash
npm run signage -- health
```
Returns:
- Server uptime
- Number of paired devices
- Uptime in hours
- Last activity time

## Restart Backend
```bash
npm run signage -- restart
```
Kills existing process and restarts. Zero-downtime restart not required for signage — displays poll every 5s and recover automatically.

## Check if Running
```bash
npm run signage -- status
```
Returns running/stopped + port binding info.

## Logs
Backend writes to `~/.openclaw/workspace/fire-tv-signage/backend/signage.log` when started with `nohup`.
Check with: `tail -f ~/.openclaw/workspace/fire-tv-signage/backend/signage.log`

## Environment Variables
| Variable | Default | Description |
|----------|---------|-------------|
| `SIGNAGE_DATA_DIR` | `./data/` | Data directory |
| `SIGNAGE_UPLOAD_DIR` | `./data/uploads/` | Uploaded media |
| `SIGNAGE_PORT` | `3002` | Listen port |
| `SIGNAGE_HOST` | `0.0.0.0` | Bind address |

## Troubleshooting
- **Port 3002 in use:** `pkill -f "signage.*server.mjs"; npm run signage -- start`
- **Permissions error:** Ensure node process has write access to data directory
- **Data directory missing:** Server auto-creates on first start

## Service Setup (optional)
For auto-start on boot, create a systemd service:
```bash
# Location: ~/.openclaw/workspace/fire-tv-signage/backend/signage.service
```

## See Also
- [[fire-tv-signage.devices]] — Device management (backend must be running)
- [[fire-tv-signage.content]] — Content management (backend must be running)