---
description: Map of Contents for fire-tv-signage skill graph
priority: low
links:
  - SKILL
---

# Fire TV Signage - Map of Contents

- [[SKILL]] — Entry point
- [[fire-tv-signage.manage]] — Start, stop, restart, check health
- [[fire-tv-signage.devices]] — Pair devices, list status, set delays
- [[fire-tv-signage.content]] — Upload images, clear playlists, manage content

## Quick Start

1. **Backend must be running** — use [[fire-tv-signage.manage]] to start it
2. **Get pairing code** from Fire TV screen (6 characters)
3. **Pair device** with [[fire-tv-signage.devices]]
4. **Upload content** with [[fire-tv-signage.content]]

## Backend Details

- **URL:** `http://192.168.2.90:3002`
- **Location:** `~/.openclaw/workspace/fire-tv-signage/backend/`
- **Admin UI:** `http://192.168.2.90:3002` (browser)
- **Data:** `~/.openclaw/workspace/fire-tv-signage/backend/data/`
- **Uploads:** `~/.openclaw/workspace/fire-tv-signage/backend/data/uploads/`

## Nodes

### fire-tv-signage.manage
Start, stop, restart, and health-check the backend service. The backend is a Node.js HTTP server that serves the admin UI and receiver APIs.

### fire-tv-signage.devices
List all paired devices, pair new ones using the 6-char code shown on the Fire TV, rename devices, and set slide delay timing.

### fire-tv-signage.content
Upload images to specific devices, remove individual images, clear entire playlists, view current content.
