#!/bin/bash
# Regenerate family dashboard pages and push to Kitchen Display
# Usage: bash refresh-family-calendar.sh

DASHBOARD_URL="http://192.168.2.90:8888"
DEVICE="Kitchen Display"

echo "$(date): Starting family calendar refresh..."

# 1. Regenerate calendar page (fetches from Google Calendar)
python3 ~/.openclaw/workspace/skills/google-home-visual/generate-family-calendar-v2.py ~/.openclaw/workspace/dashboards/family-calendar-hubmax-v2.html

# 2. Copy meals + chores pages to dashboard server
cp ~/.openclaw/workspace/skills/google-home-visual/family-meals-hubmax.html ~/.openclaw/workspace/dashboards/
cp ~/.openclaw/workspace/skills/google-home-visual/family-chores-hubmax.html ~/.openclaw/workspace/dashboards/

# 3. Update nav links to use LAN URLs
python3 << 'PYEOF'
base = "/home/ccampos/.openclaw/workspace/dashboards/"
cal_url = "http://192.168.2.90:8888/family-calendar-hubmax-v2.html"
chores_url = "http://192.168.2.90:8888/family-chores-hubmax.html"
meals_url = "http://192.168.2.90:8888/family-meals-hubmax.html"

files = {
    "family-calendar-hubmax-v2.html": {
        "links": {"family-chores-hubmax.html": chores_url, "family-meals-hubmax.html": meals_url}
    },
    "family-chores-hubmax.html": {
        "links": {"family-calendar-hubmax-v2.html": cal_url, "family-meals-hubmax.html": meals_url}
    },
    "family-meals-hubmax.html": {
        "links": {"family-calendar-hubmax-v2.html": cal_url, "family-chores-hubmax.html": chores_url}
    }
}

for fname, config in files.items():
    path = base + fname
    with open(path) as f:
        content = f.read()
    for old_href, new_url in config["links"].items():
        old = f"onclick=\"location.href='{old_href}'\""
        new = f"onclick=\"window.location.href='{new_url}'\""
        content = content.replace(old, new)
    with open(path, "w") as f:
        f.write(content)
    print(f"Updated nav in {fname}")
print("Nav links updated.")
PYEOF

# 4. Re-cast to Kitchen Display
python3 ~/.openclaw/workspace/skills/dashcast/dashcast.py "http://192.168.2.90:8888/family-calendar-hubmax-v2.html" "Kitchen Display" 2>&1

echo "$(date): Refresh complete."