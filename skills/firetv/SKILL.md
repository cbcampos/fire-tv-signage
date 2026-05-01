---
name: firetv
description: Remote control a Fire TV over ADB — send key events, launch apps, take screenshots, and inspect device state. Use when you need to control, automate, or troubleshoot a Fire TV on the network.
version: 0.1.0
openclaw:
  skillKey: firetv
requirements:
  os: [linux, darwin]
  binaries: [adb]
---

# Fire TV — Remote Control via ADB

📍 **Start here:** [[MOC]]

## Prerequisites

1. **Enable ADB debugging on the Fire TV:**
   - Go to _Settings → My Fire TV → Developer Options_ → enable _ADB Debugging_
   - Make note of the Fire TV's IP address (Settings → My Fire TV → About → Network)

2. **Install `adb` on this machine:**
   ```bash
   sudo apt install android-tools-adb
   ```
   (Or `brew install adb` on macOS)

3. **Connect once manually** (required first time):
   ```bash
   adb connect <FIRE_TV_IP>:5555
   ```
   The skill reuses existing connections automatically.

## Quick Commands

```bash
# Connect
python3 skills/firetv/firetv.py connect

# Remote control
python3 skills/firetv/firetv.py home
python3 skills/firetv/firetv.py back
python3 skills/firetv/firetv.py up
python3 skills/firetv/firetv.py down
python3 skills/firetv/firetv.py left
python3 skills/firetv/firetv.py right
python3 skills/firetv/firetv.py select
python3 skills/firetv/firetv.py play
python3 skills/firetv/firetv.py pause

# Volume
python3 skills/firetv/firetv.py volume-up
python3 skills/firetv/firetv.py volume-down
python3 skills/firetv/firetv.py mute

# App management
python3 skills/firetv/firetv.py launch youtube
python3 skills/firetv/firetv.py launch netflix
python3 skills/firetv/firetv.py launch prime
python3 skills/firetv/firetv.py launch plex
python3 skills/firetv/firetv.py force-stop youtube

# Screenshot
python3 skills/firetv/firetv.py screenshot [/path/to/save.png]

# Device info
python3 skills/firetv/firetv.py status
python3 skills/firetv/firetv.py app-list

# System
python3 skills/firetv/firetv.py reboot

# Discover Fire TV devices on the network
python3 skills/firetv/firetv.py discover
```

## Architecture

- **`firetv.py`** — Main CLI, all commands routed through here
- **`keycodes.py`** — Keycode constants (KEYCODE_* constants used by ADB)
- Safe, allowlisted commands only — **no raw shell execution**

## Keycodes Reference

| Command | Keycode |
|---------|---------|
| UP/DOWN/LEFT/RIGHT | KEYCODE_DPAD_UP/DOWN/LEFT/RIGHT |
| SELECT (OK) | KEYCODE_DPAD_CENTER |
| BACK | KEYCODE_BACK |
| HOME | KEYCODE_HOME |
| PLAY/PAUSE | KEYCODE_MEDIA_PLAY_PAUSE |
| VOLUME UP/DOWN | KEYCODE_VOLUME_UP/DOWN |
| MUTE | KEYCODE_MUTE |
| POWER | KEYCODE_POWER |

## Known App Package Names

| App | Package |
|-----|---------|
| YouTube | `com.google.android.youtube.tv` |
| Netflix | `com.netflix.ninja` |
| Prime Video | `com.amazon.avod.thirdpartyclient` |
| Plex | `com.plexapp.android` |
| Disney+ | `com.disney.disneyplus-prod` |
| Hulu | `com.hulu.plus` |
| PBS Kids | `org.pbs.kids` |
| Fire TV Home | `com.amazon.tv.launcher` |
| Settings | `com.amazon.tv.settings` |
| Silk Browser | `com.amazon.browser` |
| YouTube Music | `com.google.android.music64` |

## Device Registry

| Device | IP | Notes |
|--------|-----|-------|
| Living Room Fire TV | `192.168.2.62` | Likely candidate based on ARP |

> Run `firetv.py discover` to find your Fire TV IP if unsure.
