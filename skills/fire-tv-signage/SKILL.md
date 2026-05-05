---
name: fire-tv-signage
description: Manage the Fire TV Signage backend — pair devices, upload images, manage playlists
version: 0.1.0
openclaw:
  skillKey: fire-tv-signage
requirements:
  os: [linux]
  binaries: [node]
---

# Fire TV Signage Skill Graph

📍 **Start here:** [[MOC]]

## When to use
- You need to pair a Fire TV receiver with the backend
- You need to upload or manage images on a paired device
- You need to check device status or health
- The backend needs to be started or stopped

## Skill graph overview
- [[fire-tv-signage.manage]] — Start, stop, restart, and check health of the backend service
- [[fire-tv-signage.devices]] — List paired devices, pair new ones, set slide delays
- [[fire-tv-signage.content]] — Upload images, clear playlists, manage content

## Backend Location
`~/.openclaw/workspace/fire-tv-signage/backend/`

## Backend URL
`http://192.168.2.90:3002`

## CLI Usage
```bash
cd ~/.openclaw/workspace/fire-tv-signage/backend && npm run signage -- <command>
```

## Common Commands
```bash
# Health check
npm run signage -- health

# List devices
npm run signage -- devices

# Pair a device (6-char code from Fire TV screen)
npm run signage -- pair ABC123 --name "Lobby Display"

# Set slide delay (seconds)
npm run signage -- set DEVICE_ID --delay 15

# Upload image to device
npm run signage -- upload DEVICE_ID /path/to/image.jpg

# Show device details
npm run signage -- show DEVICE_ID

# Remove an image
npm run signage -- remove-image DEVICE_ID IMAGE_ID

# Clear device playlist
npm run signage -- clear DEVICE_ID
```

📍 **Start here:** [[MOC]]
