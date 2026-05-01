#!/usr/bin/env python3
"""
firetv.py — Safe Fire TV remote control via ADB.

Usage:
  python3 firetv.py connect [ip]
  python3 firetv.py home|back|up|down|left|right|select|play|pause
  python3 firetv.py volume-up|volume-down|mute
  python3 firetv.py launch <app>
  python3 firetv.py force-stop <app>
  python3 firetv.py screenshot [path]
  python3 firetv.py status
  python3 firetv.py app-list
  python3 firetv.py discover
  python3 firetv.py reboot

Safe, allowlisted commands only — no raw shell execution.
"""
import subprocess, sys, shlex, json, re, os, time, socket

# ── Device Registry ──────────────────────────────────────────────────────────
DEVICES = {
    "living room":   {"ip": "192.168.2.62",  "port": 5555},
    "bedroom":       {"ip": "192.168.2.__",   "port": 5555},
}

DEFAULT_DEVICE = os.getenv("FIRETV_DEVICE") or os.getenv("FIRETV_IP") or "192.168.2.62"
DEFAULT_PORT  = int(os.getenv("FIRETV_PORT") or "5555")

# ── Keycodes ────────────────────────────────────────────────────────────────
KEYCODE_HOME   = "KEYCODE_HOME"
KEYCODE_BACK   = "KEYCODE_BACK"
KEYCODE_UP     = "KEYCODE_DPAD_UP"
KEYCODE_DOWN   = "KEYCODE_DPAD_DOWN"
KEYCODE_LEFT   = "KEYCODE_DPAD_LEFT"
KEYCODE_RIGHT  = "KEYCODE_DPAD_RIGHT"
KEYCODE_SELECT = "KEYCODE_DPAD_CENTER"
KEYCODE_PLAY   = "KEYCODE_MEDIA_PLAY_PAUSE"
KEYCODE_PAUSE  = "KEYCODE_MEDIA_PLAY_PAUSE"
KEYCODE_VOL_UP = "KEYCODE_VOLUME_UP"
KEYCODE_VOL_DOWN = "KEYCODE_VOLUME_DOWN"
KEYCODE_MUTE   = "KEYCODE_MUTE"
KEYCODE_POWER  = "KEYCODE_POWER"
KEYCODE_MENU   = "KEYCODE_MENU"

KEYCODE_TABLE = {
    "home":       KEYCODE_HOME,
    "back":       KEYCODE_BACK,
    "up":         KEYCODE_UP,
    "down":       KEYCODE_DOWN,
    "left":       KEYCODE_LEFT,
    "right":      KEYCODE_RIGHT,
    "select":     KEYCODE_SELECT,
    "ok":         KEYCODE_SELECT,
    "play":       KEYCODE_PLAY,
    "pause":      KEYCODE_PAUSE,
    "play-pause": KEYCODE_PLAY,
    "volume-up":  KEYCODE_VOL_UP,
    "volume-down":KEYCODE_VOL_DOWN,
    "mute":       KEYCODE_MUTE,
    "power":      KEYCODE_POWER,
    "menu":       KEYCODE_MENU,
}

# ── App Package Registry ────────────────────────────────────────────────────
APP_PACKAGES = {
    "youtube":    "com.google.android.youtube.tv",
    "netflix":    "com.netflix.ninja",
    "prime":      "com.amazon.avod.thirdpartyclient",
    "plex":       "com.plexapp.android",
    "disney":     "com.disney.disneyplus-prod",
    "disneyplus": "com.disney.disneyplus-prod",
    "hulu":       "com.hulu.plus",
    "pbzkids":    "org.pbs.kids",
    "pbskids":    "org.pbs.kids",
    "kids":       "org.pbs.kids",
    "silk":       "com.amazon.browser",
    "browser":    "com.amazon.browser",
    "firetv":     "com.amazon.tv.launcher",
    "launcher":   "com.amazon.tv.launcher",
    "settings":   "com.amazon.tv.settings",
    "youtube-music": "com.google.android.music64",
}

# ── ADB Helpers ─────────────────────────────────────────────────────────────
def _device(args):
    ip = os.getenv("FIRETV_IP", DEFAULT_DEVICE)
    return ["adb", "-s", f"{ip}:{DEFAULT_PORT}"] + args

def run(args, check=True, timeout=15):
    cmd = _device(args) if "-s" not in args[:2] and (args and args[0] == "shell" or (args and args[0] in ("connect","disconnect","devices","kill-server","start-server","version","start"))) else (
        ["adb"] + args if args and args[0] in ("connect","disconnect","devices","kill-server","start-server","version","start","shell") and "-s" not in args
        else _device(args)
    )
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"ADB failed ({r.returncode}): {r.stderr.strip() or r.stdout.strip()}")
    return r

def device_target():
    """Return the device IP:port string for adb -s."""
    ip = os.getenv("FIRETV_IP", DEFAULT_DEVICE)
    return f"{ip}:{DEFAULT_PORT}"

def adb_cmd(*args, check=True, timeout=15):
    """Run adb with -s <device> prefix."""
    ip = os.getenv("FIRETV_IP", DEFAULT_DEVICE)
    cmd = ["adb", "-s", f"{ip}:{DEFAULT_PORT}"] + list(args)
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)
    if check and r.returncode != 0:
        raise RuntimeError(f"ADB failed ({r.returncode}): {r.stderr.strip() or r.stdout.strip()}")
    return r

# ── Commands ──────────────────────────────────────────────────────────────────
def cmd_connect(ip=None):
    target = f"{ip or DEFAULT_DEVICE}:{DEFAULT_PORT}"
    r = adb_cmd("connect", target, check=False, timeout=10)
    if r.returncode == 0:
        print(f"Connected to {target}")
    else:
        print(f"Connect failed: {r.stderr}")
    return r

def cmd_discover():
    """Scan network for Fire TV devices using ARP + common ports."""
    print("Scanning for Fire TV devices on 192.168.2.0/24 ...")
    devices = []
    # Read ARP table
    with open("/proc/net/arp") as f:
        for line in f:
            parts = line.split()
            if len(parts) >= 4 and parts[2] != "0x0":
                ip = parts[0]
                if ip.startswith("192.168.2."):
                    mac = parts[3]
                    devices.append({"ip": ip, "mac": mac})

    # Filter likely Fire TV devices by MAC prefix (Amazon)
    amazon_prefixes = ("94:2a:6f", "d0:37:61", "f0:27:2d", "b0:e4:d5", "60:01:94", "18:b4:30", "50:c7:bf", "88:66:5a", "70:77:81", "dc:62:79")
    fire_tvs = [d for d in devices if any(d["mac"].upper().startswith(p.replace(":","")) for p in amazon_prefixes)]
    others = [d for d in devices if d not in fire_tvs]

    print(f"\nLikely Fire TV devices ({len(fire_tvs)}):")
    for d in fire_tvs:
        print(f"  {d['ip']}  ({d['mac']})")
    if others:
        print(f"\nOther devices on network:")
        for d in others:
            print(f"  {d['ip']}  ({d['mac']})")

    # Try connecting to likely candidates
    for d in fire_tvs:
        ip = d["ip"]
        r = adb_cmd("connect", f"{ip}:{DEFAULT_PORT}", check=False, timeout=5)
        if r.returncode == 0:
            model = get_device_model(f"{ip}:{DEFAULT_PORT}")
            print(f"  → {ip} responded to ADB (model: {model})")
    return fire_tvs

def get_device_model(target):
    try:
        r = subprocess.run(["adb", "-s", target, "shell", "getprop", "ro.product.model"],
                          capture_output=True, text=True, timeout=8)
        return r.stdout.strip() or "unknown"
    except:
        return "unknown"

def cmd_status():
    ip = os.getenv("FIRETV_IP", DEFAULT_DEVICE)
    target = f"{ip}:{DEFAULT_PORT}"
    print(f"Device: {target}")

    # Check if connected
    r = adb_cmd("shell", "getprop", "ro.product.model", check=False)
    if r.returncode != 0:
        print("NOT connected. Run: python3 firetv.py connect")
        return

    model = r.stdout.strip()
    print(f"Model: {model}")

    # Fire OS version
    r2 = adb_cmd("shell", "getprop", "ro.build.version.release", check=False)
    if r2.returncode == 0:
        print(f"Fire OS: {r2.stdout.strip()}")

    # Current app
    r3 = adb_cmd("shell", "dumpsys", "activity", "activities", check=False)
    if r3.returncode == 0:
        for line in r3.stdout.splitlines():
            if "mFocusedActivity" in line or "mResumedActivity" in line:
                print(f"Screen: {line.strip()}")
                break

    # Network
    r4 = adb_cmd("shell", "getprop", "dhcp.wlan0.ipaddress", check=False)
    if r4.returncode == 0 and r4.stdout.strip():
        print(f"IP: {r4.stdout.strip()}")
    return model

def cmd_screenshot(path=None):
    import datetime as dt
    out = path or f"/tmp/firetv-screenshot-{dt.datetime.now().strftime('%Y%m%d-%H%M%S')}.png"
    r = adb_cmd("exec-out", "screencap", "-p", check=False, timeout=10)
    if r.returncode != 0:
        print(f"Screenshot failed: {r.stderr}")
        return
    with open(out, "wb") as f:
        f.write(r.stdout.encode("latin-1"))
    print(f"Saved: {out}")
    return out

def cmd_launch(app_name):
    pkg = resolve_app(app_name)
    r = adb_cmd("shell", "monkey", "-p", pkg, "1", check=False)
    if r.returncode == 0:
        print(f"Launched {app_name} ({pkg})")
    else:
        print(f"Launch failed: {r.stderr}")
    return r

def cmd_force_stop(app_name):
    pkg = resolve_app(app_name)
    r = adb_cmd("shell", "am", "force-stop", pkg, check=False)
    if r.returncode == 0:
        print(f"Stopped {app_name} ({pkg})")
    else:
        print(f"Stop failed: {r.stderr}")
    return r

def cmd_app_list():
    r = adb_cmd("shell", "pm", "list", "packages", check=False)
    if r.returncode == 0:
        packages = [l.replace("package:", "").strip() for l in r.stdout.splitlines() if l.startswith("package:")]
        print(f"Installed packages ({len(packages)}):")
        for p in sorted(packages):
            print(f"  {p}")
        return packages
    else:
        print(f"Failed: {r.stderr}")
    return []

def cmd_key(code):
    r = adb_cmd("shell", "input", "keyevent", code, check=False)
    if r.returncode == 0:
        print(f"Sent {code}")
    else:
        print(f"Failed: {r.stderr}")
    return r

def cmd_text(text):
    # Escape spaces and special chars for ADB shell
    safe = text.replace(" ", "%s").replace("'", "\\'")
    r = adb_cmd("shell", "input", "text", safe, check=False)
    if r.returncode == 0:
        print(f"Typed: {text}")
    else:
        print(f"Failed: {r.stderr}")
    return r

def cmd_reboot():
    r = adb_cmd("reboot", check=False, timeout=5)
    print(f"Rebooting... ({r.stdout.strip() or r.stderr.strip() or 'ok'})")
    return r

def resolve_app(name):
    name = name.lower().strip()
    if name in APP_PACKAGES:
        return APP_PACKAGES[name]
    if name.startswith("com."):
        return name
    raise ValueError(f"Unknown app '{name}'. Known: {', '.join(sorted(APP_PACKAGES))}")

# ── CLI Dispatch ────────────────────────────────────────────────────────────
def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(0)

    cmd = sys.argv[1].lower()
    args = sys.argv[2:]

    try:
        if cmd == "connect":
            ip = args[0] if args else None
            cmd_connect(ip)

        elif cmd == "discover":
            cmd_discover()

        elif cmd == "status":
            cmd_status()

        elif cmd == "screenshot":
            path = args[0] if args else None
            cmd_screenshot(path)

        elif cmd == "app-list":
            cmd_app_list()

        elif cmd == "reboot":
            cmd_reboot()

        elif cmd == "launch":
            if not args:
                print("Usage: firetv.py launch <app>")
                sys.exit(1)
            cmd_launch(args[0])

        elif cmd == "force-stop":
            if not args:
                print("Usage: firetv.py force-stop <app>")
                sys.exit(1)
            cmd_force_stop(args[0])

        elif cmd == "text":
            if not args:
                print("Usage: firetv.py text <string>")
                sys.exit(1)
            cmd_text(" ".join(args))

        elif cmd in KEYCODE_TABLE:
            code = KEYCODE_TABLE[cmd]
            cmd_key(code)

        else:
            print(f"Unknown command: {cmd}")
            print("Known commands:", ", ".join(sorted(set(list(KEYCODE_TABLE) + ["connect","discover","status","screenshot","app-list","launch","force-stop","text","reboot"]))))
            sys.exit(1)

    except RuntimeError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

if __name__ == "__main__":
    main()
