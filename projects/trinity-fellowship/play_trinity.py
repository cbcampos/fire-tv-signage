"""
Auto-play Trinity Fellowship episodes in Apple Podcasts to trigger TTML cache.

For each un-transcribed episode:
1. Find it in the Trinity show (id 1770057349)
2. Click Play via UI automation (AppleScript) — Apple's app downloads TTML
   as soon as the episode starts streaming
3. Advance past the first 30s (enough for the TTML fetch to complete)
4. Stop and move to the next

Usage:
  python3 play_trinity.py start      # begin from first untranscribed
  python3 play_trinity.py start 25   # resume from index 25  
  python3 play_trinity.py status     # show progress
  python3 play_trinity.py stop       # kill any running
"""
import sqlite3
import json
import subprocess
import sys
import time
import os
from pathlib import Path

# Apple Podcasts store path
LIB_DIR = Path("/Users/ccampos/Library/Containers/com.apple.podcasts/Data/Library/Caches/com.apple.podcasts/fsCachedData")
TTML_DIR = Path("/Users/ccampos/Library/Group Containers/243LU875E5.groups.com.apple.podcasts/Library/Cache/Assets/TTML")
INVENTORY = "/Users/ccampos/.openclaw/workspace/projects/trinity-fellowship/sermon-inventory-2026-06-28.json"
APPLE_MAP = "/Users/ccampos/.openclaw/workspace/projects/trinity-fellowship/apple-id-mapping.json"
PROGRESS = "/Users/ccampos/.openclaw/workspace/projects/trinity-fellowship/play_progress.json"

def load_apple_map():
    return {str(k): v for k, v in json.load(open(APPLE_MAP)).items()}

def load_inventory():
    return json.load(open(INVENTORY))

def ttml_files_now():
    """Return set of Apple episode IDs that have TTML cached."""
    found = set()
    for p in TTML_DIR.rglob("*.ttml"):
        # File names look like: transcript_<apple_id>.ttml-<apple_id>.ttml
        m = p.name
        # Extract from "transcript_<id>.ttml-<id>.ttml" or "transcript_<id>.ttml"
        for token in m.split(".ttml"):
            if token.startswith("transcript_"):
                found.add(token.replace("transcript_", ""))
                break
    return found

def get_untranscribed():
    """Return ordered list of Transistor episode IDs that lack Apple-TTML cache."""
    inv = load_inventory()
    apple = load_apple_map()
    cached = ttml_files_now()
    print(f"Currently cached TTML Apple IDs: {len(cached)}")
    # Build reverse: transistor_id -> apple_id
    inv_by_apple = {v['transistor_episode_id']: v for k, v in apple.items() if v.get('transistor_episode_id')}
    episodes = inv['episodes']
    result = []
    for e in episodes:
        eid = str(e['id'])
        apple_id = None
        for aid, info in apple.items():
            if info.get('transistor_episode_id') == eid:
                apple_id = aid
                break
        if apple_id and apple_id not in cached:
            result.append({
                'transistor_id': eid,
                'apple_id': apple_id,
                'title': e.get('title', ''),
                'release_date': e.get('release_date', ''),
            })
    # Sort oldest first to walk chronologically
    result.sort(key=lambda r: r['release_date'])
    return result

def save_progress(idx, last_apple_id):
    progress = {'last_index': idx, 'last_apple_id': last_apple_id, 'timestamp': time.time()}
    with open(PROGRESS, 'w') as f:
        json.dump(progress, f, indent=2)

def load_progress():
    if os.path.exists(PROGRESS):
        return json.load(open(PROGRESS)).get('last_index', 0)
    return 0

# AppleScript: open Podcasts, navigate to Trinity show, play specific episode
PLAY_EPISODE_AS = '''
on playEpisode(episodeId)
    tell application "Podcasts" to activate
    delay 1.5
    -- Open via deep link: podcasts://podcast.apple.com/podcast/id{podcast_id}/episode/episodeId
    -- This opens the show then jumps to that episode and auto-plays
    set theURL to "podcasts://podcasts.apple.com/podcast/id1770057349/episode/" & episodeId
    tell application "Podcasts" to open location theURL
    delay 4 -- give it time to start streaming (this is when TTML gets cached)
    return "playing"
end playEpisode

on run argv
    set episodeId to item 1 of argv
    playEpisode(episodeId)
end run
'''

STOP_AS = '''
tell application "Podcasts" to activate
delay 0.5
tell application "System Events"
    keystroke space  -- toggle pause/stop
end tell
'''

def play_episode(apple_id, duration_s=35):
    """Open Trinity episode by Apple ID, let it play for duration_s, then stop."""
    url = f"podcasts://podcasts.apple.com/podcast/id1770057349/episode/{apple_id}"
    print(f"  → Opening {url}")
    # Use 'open' command which is cleaner than AppleScript URL handler
    subprocess.run(['open', url], check=False)
    time.sleep(duration_s)
    # Stop
    subprocess.run(['osascript', '-e', f'tell application "Podcasts" to activate\ndelay 0.5\ntell application "System Events" to keystroke space'], check=False)
    time.sleep(1.5)

def cmd_status():
    inv = load_inventory()
    apple = load_apple_map()
    cached = ttml_files_now()
    eps = inv['episodes']
    have = []
    for e in eps:
        eid = str(e['id'])
        for aid, info in apple.items():
            if info.get('transistor_episode_id') == eid and aid in cached:
                have.append(e)
                break
    print(f"Total episodes: {len(eps)}")
    print(f"Have Apple TTML: {len(have)}")
    print(f"Missing: {len(eps) - len(have)}")
    prog = load_progress()
    print(f"Last play index: {prog}")

def cmd_start(start_from=0, max_count=None, duration_s=35):
    todos = get_untranscribed()
    print(f"Untranscribed queue: {len(todos)} episodes")
    if start_from >= len(todos):
        print("Already done — nothing to play.")
        return
    todo = todos[start_from:]
    if max_count:
        todo = todo[:max_count]
    print(f"Will play {len(todo)} episodes")
    for i, ep in enumerate(todo):
        idx = start_from + i
        print(f"\n[{idx+1}/{len(todos)}] {ep['release_date']} — {ep['title'][:50]}")
        print(f"  Apple ID: {ep['apple_id']}")
        before = len(ttml_files_now())
        play_episode(ep['apple_id'], duration_s=duration_s)
        after = len(ttml_files_now())
        save_progress(idx, ep['apple_id'])
        if after > before:
            print(f"  ✓ TTML cached (was {before}, now {after})")
        else:
            print(f"  ✗ NO TTML — will retry on next pass")
        time.sleep(2)
    print("\nDone.")

if __name__ == "__main__":
    cmd = sys.argv[1] if len(sys.argv) > 1 else "status"
    if cmd == "status":
        cmd_status()
    elif cmd == "start":
        start = int(sys.argv[2]) if len(sys.argv) > 2 else load_progress()
        max_count = int(sys.argv[3]) if len(sys.argv) > 3 else None
        dur = int(sys.argv[4]) if len(sys.argv) > 4 else 35
        cmd_start(start, max_count, dur)
