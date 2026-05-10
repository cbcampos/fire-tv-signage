#!/usr/bin/env python3
"""
Meal Planner — Simplified Logic

Trigger: Check if tomorrow has a meal in Todoist Dinner project.
- If YES → do nothing.
- If NO → plan the next 5 days after tomorrow.

Shopping list:
- Grouped by grocery section (Produce, Meat, Dairy, etc.)
- Shows quantity AND which meals the item is for
- HTML email, not boring plain text
"""
import os, sys, json, re, random, subprocess, requests, base64
from datetime import datetime, timedelta, timezone
from pathlib import Path

# ── Config ──────────────────────────────────────────────────────────
WORKSPACE        = Path.home() / ".openclaw/workspace"
MEALS_DIR        = WORKSPACE / "memory/personal/meals and recipes"
MASTER_FILE      = MEALS_DIR / "meal-master.md"
TODOIST_TOKEN    = "d5ba599bd66e9ae12c35189185f6b4d87368362d"
DINNER_PROJECT   = "6fwwjRCMPhWF76mR"
GMAIL_ACCOUNT    = "clawdobby@gmail.com"
GMAIL_TO         = "chris.campos@gmail.com"

# ── Meal Ingredients (parsed from meal-master.md) ─────────────────
# Format: meal_name → {section: [(ingredient, qty, [used in...])]}
MEAL_INGREDIENTS = {
    "Turkish Turkey Meatballs with Yogurt Sauce & Cabbage Rolls": {
        "protein": [
            ("Ground Turkey", "5 lbs total (2.5 lb meatballs + 2 lb rolls)", ["Meatballs", "Cabbage Rolls"]),
        ],
        "produce": [
            ("Onions", "1.5 large (grated)", ["Meatballs"]),
            ("Garlic", "3 cloves", ["Meatballs"]),
            ("Large Cabbage", "1 head", ["Cabbage Rolls"]),
            ("Cooked Rice", "1.5 cups", ["Cabbage Rolls"]),
            ("Parsley", "1.5 cups chopped", ["Meatballs"]),
        ],
        "dairy": [
            ("Eggs", "2", ["Meatballs"]),
            ("Greek Yogurt", "2.5 cups", ["Garlic Yogurt Sauce"]),
        ],
        "pantry": [
            ("Diced Tomatoes", "1 can (14 oz)", ["Cabbage Rolls"]),
            ("Crushed Tomatoes", "1 can (28 oz)", ["Cabbage Rolls"]),
            ("Chicken Broth", "1 cup", ["Meatball sauce"]),
            ("Olive Oil", "as needed", ["All"]),
            ("Breadcrumbs", "1/4 cup", ["Meatballs"]),
            ("Cumin", "2 tsp", ["Meatballs", "Cabbage Rolls"]),
            ("Coriander", "2 tsp", ["Meatballs"]),
            ("Paprika", "1 tsp", ["Meatballs", "Cabbage Rolls"]),
            ("Chili Flakes", "1 tsp", ["Meatballs"]),
            ("Salt & Pepper", "as needed", ["All"]),
            ("Aleppo Pepper (optional)", "pinch", ["Sauce drizzle"]),
        ],
    },
    "Garlic Shrimp & Couscous Bowl with Roasted Zucchini & Lemon Tahini": {
        "protein": [
            ("Shrimp — peeled & deveined", "2 lbs", ["Garlic Shrimp"]),
        ],
        "produce": [
            ("Garlic", "4 cloves", ["Shrimp"]),
            ("Zucchini", "4 medium, sliced", ["Roasted Zucchini"]),
        ],
        "grains": [
            ("Dry Couscous", "2 cups", ["Couscous with Peas"]),
        ],
        "pantry": [
            ("Peas (frozen)", "1.5 cups", ["Couscous"]),
            ("Olive Oil", "as needed", ["Shrimp, Zucchini"]),
            ("Tahini", "1/3 cup", ["Lemon Tahini Drizzle"]),
            ("Lemon", "1.5 lemons (juice + zest)", ["Tahini"]),
            ("Garlic Powder", "as needed", ["Roasted Zucchini"]),
        ],
    },
    "Breakfast for Dinner – Omelettes, Grits & Fruit": {
        "dairy": [
            ("Eggs", "14 large", ["Omelettes"]),
            ("Milk", "1/2 cup", ["Omelettes"]),
            ("Butter", "as needed", ["Omelettes, Grits"]),
            ("Shredded Cheese", "1.5 cups", ["Omelettes"]),
            ("Goat Cheese", "4 oz", ["Omelettes"]),
        ],
        "protein": [
            ("Diced Ham", "1.5 cups", ["Omelettes"]),
        ],
        "produce": [
            ("Fresh Spinach", "2 cups", ["Omelettes"]),
            ("Strawberries", "1 quart, quartered", ["Fresh Fruit"]),
            ("Grapes", "1 bunch, halved", ["Fresh Fruit"]),
        ],
        "grains": [
            ("Quick Grits", "1.5 cups", ["Creamy Grits"]),
            ("Milk (for grits)", "6 cups", ["Creamy Grits"]),
            ("Butter (for grits)", "2 tbsp", ["Creamy Grits"]),
            ("Salt", "as needed", ["Grits"]),
        ],
    },
    "White Chicken Chili with Cornbread": {
        "protein": [
            ("Shredded Chicken", "1.5 lbs", ["White Chicken Chili"]),
        ],
        "pantry": [
            ("White Beans (canned, drained)", "2 cans (15 oz)", ["Chili"]),
            ("Green Chiles (canned)", "1 can (4 oz)", ["Chili"]),
            ("Chicken Broth", "3 cups", ["Chili"]),
            ("Cumin", "1 tsp", ["Chili"]),
            ("Oregano (dried)", "1/2 tsp", ["Chili"]),
        ],
        "produce": [
            ("Onion", "1 large, diced", ["Chili"]),
            ("Garlic", "2 cloves, minced", ["Chili"]),
        ],
        "dairy": [
            ("Greek Yogurt or Sour Cream", "1/2 cup", ["Chili"]),
        ],
        "pantry2": [
            ("Cornmeal", "1 cup", ["Cornbread"]),
            ("All-Purpose Flour", "1 cup", ["Cornbread"]),
            ("Baking Powder", "1 tbsp", ["Cornbread"]),
            ("Sugar", "1/3 cup", ["Cornbread"]),
            ("Milk", "1 cup", ["Cornbread"]),
            ("Eggs", "2", ["Cornbread"]),
            ("Oil or Melted Butter", "1/3 cup", ["Cornbread"]),
        ],
    },
    "Shrimp Creamy Lemon Garlic Pasta with Caesar Salad": {
        "protein": [
            ("Shrimp — peeled & deveined", "1.5 lbs", ["Pasta"]),
        ],
        "grains": [
            ("Linguine or Spaghetti", "1 lb", ["Pasta"]),
        ],
        "dairy": [
            ("Heavy Cream or Milk", "3/4 cup", ["Pasta"]),
            ("Parmesan — shredded", "1/2 cup", ["Pasta"]),
            ("Butter or Olive Oil", "2 tbsp", ["Pasta"]),
        ],
        "produce": [
            ("Garlic", "3-4 cloves, minced", ["Pasta"]),
            ("Romaine Lettuce", "2 heads", ["Caesar Salad"]),
            ("Lemon", "1 (zest + juice)", ["Pasta"]),
        ],
        "pantry": [
            ("Caesar Dressing", "3/4 cup", ["Caesar Salad"]),
            ("Croutons", "1/2 cup", ["Caesar Salad"]),
            ("Parmesan", "1/2 cup", ["Caesar Salad"]),
            ("Salt & Black Pepper", "as needed", ["Pasta"]),
        ],
    },
}

# Section display names and colors
SECTIONS = {
    "produce":  ("🥬 PRODUCE",       "#4CAF50"),
    "protein":  ("🥩 MEAT & PROTEIN", "#E8613D"),
    "dairy":    ("🥛 DAIRY & EGGS",   "#2196F3"),
    "grains":   ("🍞 BREAD, RICE & GRAINS", "#9C27B0"),
    "pantry":   ("🥫 PANTRY & CANNED GOODS", "#F5A623"),
    "pantry2":  ("🧂 SPICES & BAKING", "#FF9800"),
}


# ── Helpers ─────────────────────────────────────────────────────────

def get_todoist_tasks():
    """Return all tasks in the Dinner project."""
    headers = {"Authorization": f"Bearer {TODOIST_TOKEN}"}
    resp = requests.get(
        f"https://api.todoist.com/api/v1/tasks?project_id={DINNER_PROJECT}",
        headers=headers, timeout=10
    )
    return resp.json().get("results", [])


def tomorrow_date():
    return (datetime.now() + timedelta(days=1)).strftime("%Y-%m-%d")


# ── Core Logic ──────────────────────────────────────────────────────

def check_tomorrow_has_meal():
    """Return True if any Todoist task is due tomorrow."""
    tasks = get_todoist_tasks()
    tomorrow = tomorrow_date()
    for t in tasks:
        due = t.get("due", {})
        if due and due.get("date") == tomorrow:
            name = t.get("content", "")
            if "🍽️" in name or any(kw in name.lower() for kw in ["taco", "soup", "pasta", "chicken", "turkey", "shrimp", "meatballs", "chili", "breakfast", "salmon", "rice", "couscous", "fried", "bread", "bowl", "salad", "sandwich", "lasagna", "enchilada", "burrito", "potato"]):
                return True
    return False


def get_recent_meals(days=14):
    """Get set of meal names from plan files in last N days."""
    recent = set()
    cutoff = datetime.now() - timedelta(days=days)
    if not MEALS_DIR.exists():
        return recent
    for plan_file in MEALS_DIR.iterdir():
        if "Weekly Plan" not in plan_file.name:
            continue
        m = re.search(r'(\d{4}-\d{2}-\d{2})', plan_file.name)
        if m:
            try:
                file_date = datetime.strptime(m.group(1), "%Y-%m-%d").date()
                if file_date >= cutoff.date():
                    for line in plan_file.read_text().split('\n'):
                        if line.startswith('## '):
                            meal = re.sub(r'^.*—\s*', '', line.replace('## ', '').strip())
                            meal = re.sub(r'^[\U0001F300-\U0001F9FF]\s*', '', meal).strip()
                            if meal and 'Shopping' not in meal:
                                recent.add(meal)
            except:
                pass
    return recent


def pick_meals(n, avoid=None):
    """Pick n unique meals, optionally avoiding recent ones."""
    avoid = avoid or set()
    all_names = list(MEAL_INGREDIENTS.keys())
    available = [m for m in all_names if m not in avoid]
    if len(available) < n:
        available = all_names  # fallback if we're out
    random.shuffle(available)
    return available[:n]


def build_shopping_list_html(plan):
    """Build a nice HTML shopping list grouped by section with meal tags."""
    # plan = [(date_str, day_name, meal_name), ...]
    
    # Collect all items by section
    section_items = {}  # section → {item: (qty, [meals])}
    for date_str, day_name, meal_name in plan:
        if meal_name not in MEAL_INGREDIENTS:
            continue
        for section, items in MEAL_INGREDIENTS[meal_name].items():
            if section not in section_items:
                section_items[section] = {}
            for ingredient, qty, used_in in items:
                if ingredient not in section_items[section]:
                    section_items[section][ingredient] = (qty, set())
                section_items[section][ingredient][1].add(meal_name)

    # Build HTML
    plan_start = plan[0][0]
    plan_end = plan[-1][0]
    meals_bar = "\n".join(
        f'  <div class="meal-row"><span class="meal-day">{d.split()[1] if len(d.split())>1 else d}</span><span class="meal-name">{m}</span></div>'
        for _, d, m in [(None, d, m) for d, m in [(d, m) for _, d, m in plan]]
    )
    # Fix day display (Mon 4/5 etc)
    days_short = []
    for date_str, day_name, meal_name in plan:
        dt = datetime.strptime(date_str, "%Y-%m-%d")
        days_short.append((dt.strftime("%a %m/%d"), meal_name))
    
    meals_rows = "\n".join(
        f'  <div class="meal-row"><span class="meal-day">{day}</span><span class="meal-name">{name}</span></div>'
        for day, name in days_short
    )

    sections_html = ""
    for section_key in ["produce", "protein", "dairy", "grains", "pantry", "pantry2"]:
        if section_key not in section_items:
            continue
        label, color = SECTIONS.get(section_key, (section_key.upper(), "#888"))
        items_html = ""
        for ingredient, (qty, meals) in sorted(section_items[section_key].items()):
            meals_str = ", ".join(sorted(meals))
            items_html += f'''  <div class="item">
    <div><div class="item-name">{ingredient}</div><div class="item-meals">{meals_str}</div></div>
    <span class="item-qty">{qty}</span>
  </div>
'''
        sections_html += f'''
<div class="section" style="border-left-color: {color};">
  <div class="section-label" style="color: {color};">{label}</div>
{items_html}</div>
'''

    html = f"""<!DOCTYPE html>
<html><head><meta charset="UTF-8">
<style>
  body {{ font-family: 'Segoe UI', Arial, sans-serif; background: #f4f4f4; margin: 0; padding: 20px; }}
  .wrapper {{ max-width: 580px; margin: 0 auto; }}
  .header {{ background: linear-gradient(135deg, #E8613D 0%, #F5A623 100%); color: white; border-radius: 16px 16px 0 0; padding: 28px 32px; text-align: center; }}
  .header h1 {{ margin: 0 0 4px 0; font-size: 26px; font-weight: 700; }}
  .header p {{ margin: 0; opacity: 0.9; font-size: 14px; }}
  .meals-bar {{ background: #2D2A4A; color: white; padding: 16px 28px; display: flex; flex-direction: column; gap: 6px; }}
  .meal-row {{ display: flex; align-items: center; gap: 10px; font-size: 13px; }}
  .meal-day {{ font-weight: 600; color: #F5A623; min-width: 72px; }}
  .meal-name {{ opacity: 0.85; }}
  .section {{ background: white; margin: 0 0 2px 0; padding: 18px 28px; border-left: 5px solid; }}
  .item {{ padding: 5px 0; border-bottom: 1px solid #f0f0f0; display: flex; justify-content: space-between; align-items: baseline; }}
  .item:last-child {{ border-bottom: none; }}
  .item-name {{ font-size: 14px; color: #333; }}
  .item-meals {{ font-size: 11px; color: #999; margin-top: 1px; }}
  .item-qty {{ font-size: 13px; font-weight: 600; color: #555; white-space: nowrap; margin-left: 16px; }}
  .footer {{ background: #2D2A4A; color: rgba(255,255,255,0.5); border-radius: 0 0 16px 16px; padding: 16px 28px; text-align: center; font-size: 12px; }}
</style>
</head><body>
<div class="wrapper">
<div class="header">
  <h1>🛒 Shopping List</h1>
  <p>{plan_start} to {plan_end} &nbsp;•&nbsp; {len(plan)} Dinners &nbsp;•&nbsp; Serves 6</p>
</div>
<div class="meals-bar">{meals_rows}</div>
{sections_html}
<div class="footer">🍽️ Planned by Dobby — {datetime.now().strftime('%b %d, %Y')}</div>
</div></body></html>"""
    return html


def push_to_todoist(plan):
    """Push meal tasks to Todoist Dinner project."""
    headers = {
        "Authorization": f"Bearer {TODOIST_TOKEN}",
        "Content-Type": "application/json",
    }
    created = []
    for date_str, day_name, meal_name in plan:
        due = f"{date_str}T00:00:00"
        payload = {
            "content": f"🍽️ {meal_name}",
            "due_date": due,
            "project_id": DINNER_PROJECT,
            "labels": ["dinner"],
        }
        try:
            resp = requests.post(
                "https://api.todoist.com/api/v1/tasks",
                headers=headers, json=payload, timeout=10
            )
            if resp.status_code == 200:
                created.append(resp.json())
                print(f"  ✓ {date_str} — {meal_name}")
            else:
                print(f"  ✗ {date_str} — {meal_name}: {resp.status_code}")
        except Exception as e:
            print(f"  ✗ {date_str} — {meal_name}: {e}")
    return created


def send_email(subject, html_body):
    """Send HTML email via gws."""
    result = subprocess.run([
        "gws", "gmail", "+send",
        "--to", GMAIL_TO,
        "--subject", subject,
        "--body", html_body,
        "--html",
    ], capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        print(f"Email error: {result.stderr[:300]}")
    else:
        print(f"  ✅ Email sent to {GMAIL_TO}")


def create_weekly_plan(plan):
    """Write weekly plan to memory."""
    start = datetime.strptime(plan[0][0], "%Y-%m-%d")
    content = f"# Weekly Meal Plan — {plan[0][0]} to {plan[-1][0]}\n\n"
    content += "**Servings:** 6 adults\n\n---\n\n"
    for date_str, day_name, meal_name in plan:
        content += f"## {day_name}, {date_str} — 🍽️ {meal_name}\n\n"
    filename = MEALS_DIR / f"{plan[0][0]} Weekly Plan.md"
    filename.write_text(content)
    print(f"  ✅ Plan saved: {filename.name}")
    return str(filename)


# ── Main ────────────────────────────────────────────────────────────

def main():
    print(f"=== Meal Planner — {datetime.now().strftime('%Y-%m-%d %H:%M')} ===")
    
    # Check if tomorrow has a meal
    if check_tomorrow_has_meal():
        print("Tomorrow already has a meal — doing nothing.")
        return
    
    print("Tomorrow has no meal planned — starting planning...")
    
    # Find next 5 days without meals
    tasks = get_todoist_tasks()
    upcoming = set()
    for t in tasks:
        due = t.get("due", {})
        if due and due.get("date"):
            upcoming.add(due["date"])

    days_of_week = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    today = datetime.now()
    
    # Start from tomorrow (day 1)
    planned = []
    recent = get_recent_meals()
    
    i = 1
    while len(planned) < 5 and i <= 12:
        future = today + timedelta(days=i)
        date_str = future.strftime("%Y-%m-%d")
        day_name = days_of_week[future.weekday()]
        if date_str not in upcoming:
            # Pick a meal avoiding recent
            candidates = [m for m in MEAL_INGREDIENTS.keys() if m not in recent]
            if not candidates:
                candidates = list(MEAL_INGREDIENTS.keys())
            random.shuffle(candidates)
            meal_name = candidates[0]
            planned.append((date_str, day_name, meal_name))
            recent.add(meal_name)
        i += 1

    if not planned:
        print("Could not find 5 days to plan.")
        return

    print(f"\n📋 Planning {len(planned)} dinners:")
    for date_str, day_name, meal_name in planned:
        print(f"  {date_str} ({day_name}) — {meal_name}")

    # Save plan
    create_weekly_plan(planned)
    
    # Push to Todoist
    print("\nPushing to Todoist...")
    push_to_todoist(planned)
    
    # Build and send shopping list
    print("Building shopping list...")
    html = build_shopping_list_html(planned)
    subject = f"🛒 Shopping List — {planned[0][0]} to {planned[-1][0]} ({len(planned)} Dinners)"
    print("Sending email...")
    send_email(subject, html)
    
    print("\n✅ Done!")


if __name__ == "__main__":
    main()