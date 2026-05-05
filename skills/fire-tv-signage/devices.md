---
description: List paired devices, pair new Fire TVs, rename and configure them
priority: high
links:
  - SKILL
  - fire-tv-signage.manage
  - fire-tv-signage.content
---

# fire-tv-signage.devices

Manage paired Fire TV devices.

## Pairing Flow
1. Fire TV shows a 6-character pairing code on screen
2. Enter the code with `signage pair <CODE> --name "<label>"`
3. Device appears in the device list
4. The Fire TV will start showing content once images are uploaded

## CLI Commands

### List all devices
```bash
cd ~/.openclaw/workspace/fire-tv-signage/backend && npm run signage -- devices
```

### Pair a device (requires 6-char code from Fire TV)
```bash
npm run signage -- pair ABC123 --name "Lobby Display"
```

### Rename a device
```bash
npm run signage -- set DEVICE_ID --name "New Name"
```

### Set slide delay (seconds between slides)
```bash
npm run signage -- set DEVICE_ID --delay 15
```

### Show device full details
```bash
npm run signage -- show DEVICE_ID
```

### Remove/unpair a device
```bash
npm run signage -- remove DEVICE_ID
```

## Finding Device ID
- Run `devices` — shows ID, name, paired status, delay, image count
- Or check `~/.openclaw/workspace/fire-tv-signage/backend/data/db.json`

## Pending Pairings
Fire TVs that have requested a code but haven't been approved yet show up in `pendingPairings`. Use the admin UI or `pair <code>` to approve.

See also: [[fire-tv-signage.manage]], [[fire-tv-signage.content]]
