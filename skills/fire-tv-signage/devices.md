---
description: List, pair, rename, and remove Fire TV devices
priority: high
links:
  - SKILL
  - fire-tv-signage.manage
  - fire-tv-signage.content
---

# fire-tv-signage.devices — Device Management

## List Devices
```bash
signage devices
```
Output: Device ID, name, location (if set), token, image count, last seen timestamp.

## Pair New Device
```bash
signage pair ABC123 --name "Living Room TV"
signage pair ABC123 --name "Bedroom TV" --location "Master Bedroom"
```

Pairing process:
1. Fire TV shows 6-char pairing code
2. Run `pair` command with the code
3. Device is registered; TV receives confirmation on next poll
4. TV exits pairing mode and waits for content

## Rename Device
```bash
signage set DEVICE_ID --name "New Name"
signage set DEVICE_ID --name "Lobby Display" --location "Building Entrance"
```

## Set Global Slide Delay
```bash
signage set DEVICE_ID --delay 10
```
Sets the default delay between slides in seconds. Per-slide overrides are set individually.

## View Device Details
```bash
signage show DEVICE_ID
```
Full device info: ID, name, location, delay, playlist contents.

## Remove Device
```bash
signage remove DEVICE_ID
```
Removes device and its playlist from the system. Uploaded files are NOT deleted (they remain in uploads/).

## Pending Pairings
Check for waiting devices:
```bash
signage pending
```
Devices waiting for pairing approval show up here. Approve with `signage pair CODE`.

## Finding Device ID
`signage devices` lists all paired devices with their UUIDs.
Or check `~/.openclaw/workspace/fire-tv-signage/backend/data/db.json` directly.

## Single Device Mode
If only one device is paired, `--device` flag can be omitted in most commands:
```bash
signage push /path/to/image.jpg   # pushes to only device
signage clear                      # clears only device
```

## Multi-Display Push
Push to multiple devices at once:
```bash
signage push --all /path/to/image.jpg   # all paired devices
signage push DEVICE1_ID,DEVICE2_ID /path/to/image.jpg  # specific list
```

## See Also
- [[fire-tv-signage.manage]] — Start/stop backend
- [[fire-tv-signage.content]] — Upload and manage content
- [[fire-tv-signage.push]] — Push workflow