---
description: Push locally-hosted web dashboards to Fire TV displays over LAN
priority: high
links:
  - SKILL
  - fire-tv-signage.push
---

# fire-tv-signage.local-dashboards — Local LAN Dashboards

Push privately-hosted web dashboards to Fire TV displays without going through the public internet.

## Local Dashboard Server

- **Machine:** `192.168.2.90` (server desktop)
- **Port:** `8888`
- **Protocol:** Plain HTTP (LAN only — no TLS)
- **URL pattern:** `http://192.168.2.90:8888/<dashboard>.html`

## Serve a New Dashboard

1. Drop the HTML file into:
   ```
   ~/.openclaw/workspace/dashboards/
   ```
2. Push to any paired device:
   ```
   signage push <deviceId> --from-web "http://192.168.2.90:8888/<file>.html" --name "Dashboard Title"
   ```

## Start Server (if not running)

```bash
bash ~/.openclaw/workspace/scripts/start-dashboards.sh
# Or directly:
python3 -m http.server 8888 --directory ~/.openclaw/workspace/dashboards
```

Server auto-starts on boot via `~/.openclaw/workspace/scripts/post-startup.sh`.

## Dashboard Library

| File | Name | Description |
|------|------|-------------|
| `command-center.html` | Family Command Center | Live clock, weather, today's calendar, family panel |

## Adding New Dashboards

1. Create the HTML file at `~/.openclaw/workspace/dashboards/<name>.html`
2. Design for **1920×1080** (fixed viewport, no scroll)
3. Push: `signage push <deviceId> --from-web "http://192.168.2.90:8888/<name>.html" --name "Title"`
4. Optionally add to `local-dashboards.md` table above

## Architecture

```
HTML file in ~/.openclaw/workspace/dashboards/
         ↓
python3 -m http.server :8888
         ↓
Fire TV receiver → WebView loads URL
```

No public internet required. Fire TV just needs to be on the same LAN.

## See Also
- [[fire-tv-signage.push]] — All push command options
- [[fire-tv-signage.devices]] — Device IDs and pairing
