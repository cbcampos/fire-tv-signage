#!/usr/bin/env python3
"""
daily-recipe.py - Build, deploy, and cast tonight's recipe card.
"""
import argparse
import base64
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.request
from datetime import date

WORKSPACE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
USER_HOME = WORKSPACE.split("/.openclaw/", 1)[0] if "/.openclaw/" in WORKSPACE else os.path.expanduser("~")
TPATH = os.path.join(WORKSPACE, "skills/google-home-visual/interactive-recipe-card.html")
RDIR = "/tmp/daily-recipe"
KOKORO = os.path.join(WORKSPACE, "scripts/kokoro_tts.sh")
DCAST = os.path.join(WORKSPACE, "skills/dashcast/dashcast.py")
TODAY = date.today().strftime("%Y-%m-%d")
DINNER_PROJECT_IDS = {"2328094641", "6fwwjRCMPhWF76mR"}


def load_secret(name):
    if os.environ.get(name):
        return os.environ[name]
    secret_files = [
        os.path.join(USER_HOME, ".openclaw/.secrets/todoist.env"),
        os.path.join(USER_HOME, ".openclaw/.secrets/netlify.env"),
    ]
    for path in secret_files:
        try:
            with open(path, encoding="utf-8") as handle:
                for line in handle:
                    if line.startswith(name + "="):
                        return line.strip().split("=", 1)[1]
        except OSError:
            continue
    return ""


def fetch_todoist():
    token = load_secret("TODOIST_API_TOKEN")
    if not token:
        return None, None
    for project_id in DINNER_PROJECT_IDS:
        try:
            request = urllib.request.Request(
                f"https://api.todoist.com/api/v1/tasks?project_id={project_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            with urllib.request.urlopen(request, timeout=15) as response:
                payload = json.loads(response.read())
        except Exception:
            continue
        tasks = payload.get("results", []) if isinstance(payload, dict) else (payload or [])
        for task in tasks:
            due = task.get("due") or {}
            labels = {str(label).lower() for label in (task.get("labels") or [])}
            if (
                due.get("date", "").startswith(TODAY)
                and task.get("content")
                and (str(project_id) in DINNER_PROJECT_IDS or "dinner" in labels)
            ):
                return task["content"], task.get("description") or ""
    return None, None


def parse_recipe(content, description):
    emoji_match = re.match(r"^\s*(\S)", content or "")
    emoji = emoji_match.group(1) if emoji_match else "🍽️"
    ingredients = []
    steps = []
    section = "ingredients"
    saw_instructions = False
    for raw_line in description.splitlines():
        line = raw_line.strip()
        if not line:
            continue
        lower = line.lower()
        plain = re.sub(r"[*_`#]", "", line).strip()
        if "instruction" in lower:
            section = "steps"
            saw_instructions = True
            continue
        if re.match(r"^-{3,}$", lower) or lower.startswith("note") or "tip:" in lower:
            continue
        if section == "ingredients":
            if re.match(r"^\d+[\.\)]\s*", line):
                section = "steps"
                saw_instructions = True
            elif line.startswith("•") or line.startswith("-"):
                cleaned = re.sub(r"^[-•*]\s*", "", line)
                ingredients.append({"amount": "", "item": cleaned})
                continue
        if section == "steps":
            cleaned = re.sub(r"^\d+[\.\)]\s*", "", line).strip()
            if cleaned and cleaned != plain.replace(':', '').strip():
                pass
            if re.match(r"^\d+[\.\)]\s*", line):
                steps.append(cleaned)
            elif saw_instructions and not re.match(r"^[*_#]+.*[*_#:]$", line):
                steps.append(plain.rstrip(':'))
    return {
        "name": content.strip(),
        "emoji": emoji,
        "ingredients": ingredients,
        "steps": steps,
        "temp": "425°F",
        "time": "45 min",
        "servings": "4 servings",
    }


def extract_timer(text):
    match = re.search(r"(\d+)\s*(minutes?|mins?|min|hours?|hrs?|hr)\b", text, re.I)
    return match.group(0) if match else ""


def split_title(name, fallback_emoji):
    match = re.match(r"^\s*(\S+)\s+(.*)$", name.strip())
    if match and len(match.group(1)) <= 3:
        return match.group(1), match.group(2).strip()
    return fallback_emoji, name.strip()


def summarize_step(step, index):
    prefixes = ["Prep", "Cook", "Rest", "Finish"]
    label = prefixes[min(index, len(prefixes) - 1)]
    if step.get("timer"):
        label = f"{label} · {step['timer']}"
    return label


def gen_audio(steps):
    os.makedirs(f"{RDIR}/audio", exist_ok=True)
    audio_data = []
    for index, step in enumerate(steps):
        path = f"{RDIR}/audio/step-{index}.mp3"
        try:
            result = subprocess.run(
                ["bash", KOKORO, step, "bm_fable", path],
                capture_output=True,
                timeout=30,
                text=True,
                env={**os.environ, "HOME": USER_HOME},
            )
            if result.returncode == 0 and os.path.exists(path):
                with open(path, "rb") as f:
                    audio_data.append("data:audio/mp3;base64," + base64.b64encode(f.read()).decode())
                print(f"   [OK]  Step {index + 1} audio")
            else:
                audio_data.append("")
                print(f"   [--]  Step {index + 1} audio skipped")
        except Exception as error:
            audio_data.append("")
            print(f"   [--]  Step {index + 1}: {error}")
    return audio_data


def load_existing_audio(step_count):
    audio_data = []
    for index in range(step_count):
        path = f"{RDIR}/audio/step-{index}.mp3"
        if not os.path.exists(path):
            return []
        with open(path, "rb") as f:
            audio_data.append("data:audio/mp3;base64," + base64.b64encode(f.read()).decode())
    return audio_data


def build_recipe_payload(recipe, audio_base64=None):
    emoji, display_title = split_title(recipe["name"], recipe["emoji"])
    # Template JS expects steps as plain string[], not objects
    steps_strings = list(recipe["steps"])
    ingredient_count = len(recipe["ingredients"])
    step_count = len(steps_strings)
    # Template expects [[amount, name]] format for ingredients
    ingredients_flat = [
        [ing.get("amount", ""), ing.get("item", "")]
        for ing in recipe["ingredients"]
    ]
    return {
        "title": recipe["name"],
        "emoji": emoji,
        "steps": steps_strings,
        "ingredients": ingredients_flat,
        "temp": recipe["temp"],
        "time": recipe["time"],
        "servings": recipe["servings"],
        "stepAudio": audio_base64 or [],
    }


def build_html(recipe, payload):
    with open(TPATH, encoding="utf-8") as handle:
        raw = handle.read()
    step_audio_json = json.dumps(payload.get("stepAudio", []), ensure_ascii=False).replace("</", "<\\/")
    recipe_json = json.dumps(payload, ensure_ascii=False).replace("</", "<\\/")
    html = raw.replace("__STEPAUDIO__", step_audio_json).replace("__RECIPE_JSON__", recipe_json)
    print(f"   [OK]  {recipe['name']} - {len(recipe['steps'])} steps, {len(recipe['ingredients'])} ingredients")
    return html


def create_netlify_site():
    token = load_secret("NETLIFY_AUTH_TOKEN") or load_secret("NETLIFY_TOKEN")
    env = {**os.environ, "HOME": USER_HOME}
    if token:
        env["NETLIFY_AUTH_TOKEN"] = token
    result = subprocess.run(
        ["netlify", "api", "createSite", "--data", "{}"],
        capture_output=True, text=True, timeout=60, env=env,
    )
    if result.returncode != 0:
        raise RuntimeError(f"createSite failed:\n{result.stderr[-400:] or result.stdout[-400:]}")
    output = result.stdout.strip()
    site = json.loads(output[output.find("{"):])
    return site["id"], site["ssl_url"] or site["url"]


def deploy(html_content):
    tmpdir = tempfile.mkdtemp(prefix="recipe-card-")
    try:
        with open(os.path.join(tmpdir, "index.html"), "w", encoding="utf-8") as handle:
            handle.write(html_content)
        audio_dir = os.path.join(RDIR, "audio")
        if os.path.isdir(audio_dir):
            shutil.copytree(audio_dir, os.path.join(tmpdir, "audio"), dirs_exist_ok=True)
        # Always deploy to the dedicated recipe-card site
        site_id = "519158f8-469e-4151-ae4e-bf35e3ef6ec6"
        site_url = "https://stupendous-gnome-5797cf.netlify.app"
        print(f"   [>>]  Deploying to {site_url}")
        env = {**os.environ, "HOME": USER_HOME}
        token = load_secret("NETLIFY_AUTH_TOKEN") or load_secret("NETLIFY_TOKEN")
        if token:
            env["NETLIFY_AUTH_TOKEN"] = token
        result = subprocess.run(
            ["netlify", "deploy", "--dir", tmpdir, "--site", site_id, "--prod"],
            capture_output=True, text=True, timeout=120, env=env,
        )
        if result.returncode != 0:
            raise RuntimeError(f"deploy failed:\n{result.stderr[-400:] or result.stdout[-400:]}")
        return site_url
    finally:
        shutil.rmtree(tmpdir, ignore_errors=True)
def cast(url):
    result = subprocess.run(
        ["python3", DCAST, url, os.environ.get("KITCHEN_DISPLAY", "Kitchen Display")],
        capture_output=True, text=True, timeout=30,
        env={**os.environ, "HOME": USER_HOME},
    )
    if result.returncode == 0:
        print("   [OK]  Cast sent")
    else:
        print(f"   [--]  Cast failed: {result.stderr[:200]}")


def push_to_ipad_display(recipe):
    repo_dir = "/tmp/dobby-display-repo"
    github_url = "https://github.com/cbcampos/dobby-display.git"
    try:
        if not os.path.isdir(os.path.join(repo_dir, ".git")):
            print("   [>>]  Cloning dobby-display repo...")
            subprocess.run(
                ["git", "clone", github_url, repo_dir],
                capture_output=True, timeout=30, check=True
            )
        os.chdir(repo_dir)
        subprocess.run(["git", "config", "user.email", "dobby@camposfamily.com"], capture_output=True)
        subprocess.run(["git", "config", "user.name", "Dobby"], capture_output=True)
        emoji, display_title = split_title(recipe["name"], recipe["emoji"])
        ingredients = [[ing.get("amount", ""), ing.get("item", "")] for ing in recipe["ingredients"]]
        data = {
            "mode": "recipe",
            "recipe": {
                "title": display_title,
                "emoji": emoji,
                "time": recipe["time"],
                "temp": recipe["temp"],
                "servings": recipe["servings"],
                "ingredients": ingredients,
                "steps": recipe["steps"],
            },
            "state": {"step": 1},
        }
        with open(os.path.join(repo_dir, "data.json"), "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
        subprocess.run(["git", "add", "data.json"], capture_output=True, check=True)
        result = subprocess.run(
            ["git", "commit", "-m", f"Recipe: {display_title}"],
            capture_output=True, text=True
        )
        if result.returncode == 0 or "nothing to commit" not in result.stderr:
            push_result = subprocess.run(
                ["git", "push", "origin", "master"],
                capture_output=True, text=True, timeout=30,
                env={**os.environ, "HOME": USER_HOME, "GIT_ASKPASS": "true"}
            )
            if push_result.returncode == 0:
                print("   [OK]  iPad display updated")
            else:
                print(f"   [--]  iPad push failed")
    except Exception as e:
        print(f"   [--]  iPad display skipped: {e}")


def load_recipe_from_args(args):
    if args.json:
        with open(args.json, encoding="utf-8") as handle:
            payload = json.load(handle)
        ingredients = []
        for item in payload.get("ingredients", []):
            if isinstance(item, dict):
                ingredients.append({"amount": item.get("amount", ""), "item": item.get("item", "")})
            elif isinstance(item, list) and item:
                ingredients.append({"amount": item[0] if len(item) > 1 else "", "item": item[-1]})
        return {
            "name": payload.get("name", ""),
            "emoji": payload.get("emoji", "🍽️"),
            "ingredients": ingredients,
            "steps": payload.get("steps", []),
            "temp": payload.get("temp", "425°F"),
            "time": payload.get("time", "45 min"),
            "servings": payload.get("servings", "4 servings"),
        }
    if args.name:
        emoji_match = re.match(r"^\s*(\S)", args.name)
        ingredients = []
        for line in args.ingredients.splitlines():
            if not line.strip():
                continue
            parts = [part.strip() for part in line.split(":", 1)]
            if len(parts) == 2:
                ingredients.append({"amount": parts[0], "item": parts[1]})
            else:
                ingredients.append({"amount": "", "item": parts[0]})
        return {
            "name": args.name,
            "emoji": emoji_match.group(1) if emoji_match else "🍽️",
            "ingredients": ingredients,
            "steps": [step.strip() for step in args.steps.splitlines() if step.strip()],
            "temp": args.temp,
            "time": args.time,
            "servings": args.servings,
        }
    title, description = fetch_todoist()
    if not title:
        print("ERROR: No recipe found for today.")
        print(f"  Add a task to Dinner due today. Accepted project IDs: {sorted(DINNER_PROJECT_IDS)}")
        sys.exit(1)
    return parse_recipe(title, description)


def main():
    parser = argparse.ArgumentParser(description="Build and cast tonight's recipe card")
    parser.add_argument("--name", default="")
    parser.add_argument("--ingredients", default="")
    parser.add_argument("--steps", default="")
    parser.add_argument("--temp", default="425°F")
    parser.add_argument("--time", default="45 min")
    parser.add_argument("--servings", default="4 servings")
    parser.add_argument("--json", default="", help="Load recipe from JSON file")
    parser.add_argument("--deploy-only", action="store_true")
    args = parser.parse_args()

    recipe = load_recipe_from_args(args)
    
    # Skip "no recipe" / restaurant entries
    name_lower = recipe.get("name", "").lower()
    skip_phrases = ["no recipe", "eating out", "restaurant", "takeout", "delivery", "going out"]
    if any(phrase in name_lower for phrase in skip_phrases):
        print(f"SKIP: {recipe['name']} — restaurant/meal out, no recipe to cast.")
        sys.exit(0)

    step_count = len(recipe["steps"])
    if step_count == 0:
        print("ERROR: Recipe has no steps.")
        sys.exit(1)

    print(f"\n{'=' * 50}\n  {recipe['name']}\n{'=' * 50}\n  {step_count} steps  |  {len(recipe['ingredients'])} ingredients\n")

    audio_data = []
    if args.deploy_only:
        audio_data = load_existing_audio(step_count)
        if audio_data:
            print(f"AUDIO: Reusing {len(audio_data)} existing step files")
        else:
            print("AUDIO: No existing step files found; deploying without audio")
    else:
        print("AUDIO: Generating...")
        audio_data = gen_audio(recipe["steps"])

    print("\nHTML: Building...")
    payload = build_recipe_payload(recipe, audio_data)
    html = build_html(recipe, payload)
    os.makedirs(RDIR, exist_ok=True)
    with open(f"{RDIR}/index.html", "w", encoding="utf-8") as handle:
        handle.write(html)

    print("\nDEPLOY: Netlify (fresh site)...")
    url = deploy(html)
    print(f"   [OK]  {url}")

    print("\nCAST: Kitchen Display...")
    cast(url)

    print("\nIPAD: Updating display...")
    push_to_ipad_display(recipe)

    print(f"\n{'=' * 50}\n  LIVE: {url}\n{'=' * 50}\n")


if __name__ == "__main__":
    main()
