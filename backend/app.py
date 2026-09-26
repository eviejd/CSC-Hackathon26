import itertools
import json
import os
import re
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app) 

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "menu.json")

CATEGORY_GROUPS = {
    "mains": ["burger", "chicken", "taco", "burrito", "quesadilla", "bowl", "dos-capas", "chikito"],
    "sides": ["sides", "nachos"],
    "breakfast": ["breakfast"],
    "kids": ["kids"],
    "desserts": ["desserts"],
    "drinks": ["drinks"],
}

DIETARY_TAG_FILTERS = {
    "vegetarian": ["vegetarian"],
    "spicy": ["spicy"],
    "chicken": ["chicken"],
    "beef": ["beef", "barbacoa-beef"],
    "pork": ["pork"],
    "lamb": ["lamb"],
}

ALLERGEN_FIELD = "allergens"

SORT_OPTIONS = {
    "relevance": None,
    "macro_match": None, 
    "calories_asc": ("calories", False),
    "calories_desc": ("calories", True),
    "protein_asc": ("protein_g", False),
    "protein_desc": ("protein_g", True),
    "carbs_asc": ("carbs_g", False),
    "carbs_desc": ("carbs_g", True),
    "fat_asc": ("fat_g", False),
    "fat_desc": ("fat_g", True),
    "name_asc": ("name", False),
    "name_desc": ("name", True),
    "efficiency_desc": ("_efficiency", True),
}


def load_menu():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["items"]


def _as_number(value):
    if value is None:
        return None
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_query_number(raw):
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


MIN_CALORIES_FOR_EFFICIENCY = 20 

def protein_efficiency(item):
    calories = _as_number(item.get("calories"))
    protein = _as_number(item.get("protein_g"))
    if calories is None or protein is None or calories < MIN_CALORIES_FOR_EFFICIENCY:
        return None
    return round((protein / calories) * 100, 2)


_WHITESPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s]")


def _normalize_text(text):
    text = text.lower()
    text = _PUNCT_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text


def _searchable_text(item):
    parts = [item.get("name", ""), item.get("category", ""), item.get("restaurant", "")]
    parts.extend(item.get("tags", []) or [])
    return _normalize_text(" ".join(str(p) for p in parts))


def item_matches_search(item, search_terms):
    if not search_terms:
        return True
    haystack = _searchable_text(item)
    return all(term in haystack for term in search_terms)


@app.route("/api/restaurants", methods=["GET"])
def get_restaurants():
    items = load_menu()
    restaurants = list(dict.fromkeys(item["restaurant"] for item in items))
    return jsonify(restaurants)


@app.route("/api/menu/<restaurant>", methods=["GET"])
def get_menu(restaurant):
    items = load_menu()
    matches = [item for item in items if item["restaurant"] == restaurant]
    return jsonify(matches)


@app.route("/api/match", methods=["POST"])
def match_items():
    payload = request.get_json(silent=True) or {}

    restaurant = payload.get("restaurant")
    calories_target = payload.get("calories")
    protein_target = payload.get("protein")
    category = payload.get("category")

    if not restaurant:
        return jsonify({"error": "restaurant is required"}), 400
    if calories_target is None or protein_target is None:
        return jsonify({"error": "calories and protein are required"}), 400

    try:
        calories_target = float(calories_target)
        protein_target = float(protein_target)
    except (TypeError, ValueError):
        return jsonify({"error": "calories and protein must be numbers"}), 400

    items = load_menu()

    if restaurant.lower() == "all":
        candidates = list(items)
    else:
        candidates = [i for i in items if i["restaurant"] == restaurant]

    if category and category.lower() != "all":
        allowed = CATEGORY_GROUPS.get(category.lower(), [category.lower()])
        candidates = [i for i in candidates if i["category"].lower() in allowed]

    candidates = [
        i for i in candidates
        if i.get("calories") is not None
        and isinstance(i["calories"], (int, float))
        and i["calories"] <= calories_target
    ]

    if not candidates:
        return jsonify({"target": {"calories": calories_target, "protein": protein_target}, "matches": []})

    def score(item):
        protein_diff = abs(item["protein_g"] - protein_target)
        penalty = (protein_diff / max(protein_target, 1)) * 100
        return max(0, round(100 - penalty))

    for item in candidates:
        item["match_score"] = score(item)

    candidates.sort(key=lambda i: (-i["match_score"], -i["protein_g"]))

    top_matches = candidates[:30]

    for item in top_matches:
        item["remaining"] = {
            "calories": round(calories_target - item["calories"], 1),
            "protein": round(protein_target - item["protein_g"], 1),
        }

    return jsonify({
        "target": {"calories": calories_target, "protein": protein_target},
        "matches": top_matches,
    })


@app.route("/api/categories", methods=["GET"])
def get_categories():
    items = load_menu()
    categories = list(dict.fromkeys(item["category"] for item in items if item.get("category")))
    return jsonify(categories)


@app.route("/api/tags", methods=["GET"])
def get_tags():
    items = load_menu()
    all_tags = sorted({tag for item in items for tag in (item.get("tags") or [])})

    available_dietary_filters = []
    for filter_name, matching_tags in DIETARY_TAG_FILTERS.items():
        if any(tag in all_tags for tag in matching_tags):
            available_dietary_filters.append(filter_name)

    return jsonify({
        "tags": all_tags,
        "dietary_filters": available_dietary_filters,
    })


@app.route("/api/search", methods=["GET"])
def search_items():
    args = request.args

    search_raw = (args.get("search") or "").strip()
    search_terms = _normalize_text(search_raw).split() if search_raw else []

    restaurant = (args.get("restaurant") or "all").strip()
    category = (args.get("category") or "all").strip()

    min_calories = _parse_query_number(args.get("min_calories"))
    max_calories = _parse_query_number(args.get("max_calories"))
    min_protein = _parse_query_number(args.get("min_protein"))
    max_protein = _parse_query_number(args.get("max_protein"))
    min_carbs = _parse_query_number(args.get("min_carbs"))
    max_carbs = _parse_query_number(args.get("max_carbs"))
    min_fat = _parse_query_number(args.get("min_fat"))
    max_fat = _parse_query_number(args.get("max_fat"))

    target_calories = _parse_query_number(args.get("target_calories"))
    target_protein = _parse_query_number(args.get("target_protein"))
    target_carbs = _parse_query_number(args.get("target_carbs"))
    target_fat = _parse_query_number(args.get("target_fat"))
    has_target = any(t is not None for t in (target_calories, target_protein, target_carbs, target_fat))

    diet_raw = (args.get("diet") or "").strip()
    diet_filters = [d.strip().lower() for d in diet_raw.split(",") if d.strip()]
    unknown_diet_filters = [d for d in diet_filters if d not in DIETARY_TAG_FILTERS]
    diet_filters = [d for d in diet_filters if d in DIETARY_TAG_FILTERS]

    quick = (args.get("quick") or "").strip().lower()

    exclude_allergens_raw = (args.get("exclude_allergens") or "").strip()
    exclude_allergens = [a.strip().lower() for a in exclude_allergens_raw.split(",") if a.strip()]

    try:
        limit = int(args.get("limit", 60))
    except (TypeError, ValueError):
        limit = 60
    limit = max(1, min(limit, 500))

    items = load_menu()
    allergen_data_available = any(ALLERGEN_FIELD in item for item in items)

    results = []
    for original in items:
        item = dict(original)

        if restaurant.lower() != "all" and item.get("restaurant") != restaurant:
            continue
        if category.lower() != "all" and str(item.get("category", "")).lower() != category.lower():
            continue

        if not item_matches_search(item, search_terms):
            continue

        if diet_filters:
            item_tags = set(t.lower() for t in (item.get("tags") or []))
            if not all(
                any(tag in item_tags for tag in DIETARY_TAG_FILTERS[f])
                for f in diet_filters
            ):
                continue

        calories = _as_number(item.get("calories"))
        protein = _as_number(item.get("protein_g"))
        carbs = _as_number(item.get("carbs_g"))
        fat = _as_number(item.get("fat_g"))

        if min_calories is not None and (calories is None or calories < min_calories):
            continue
        if max_calories is not None and (calories is None or calories > max_calories):
            continue
        if min_protein is not None and (protein is None or protein < min_protein):
            continue
        if max_protein is not None and (protein is None or protein > max_protein):
            continue
        if min_carbs is not None and (carbs is None or carbs < min_carbs):
            continue
        if max_carbs is not None and (carbs is None or carbs > max_carbs):
            continue
        if min_fat is not None and (fat is None or fat < min_fat):
            continue
        if max_fat is not None and (fat is None or fat > max_fat):
            continue

        efficiency = protein_efficiency(item)
        item["protein_per_100_cal"] = efficiency

        if quick == "high_protein" and (protein is None or protein < 25):
            continue
        if quick == "low_calorie" and (calories is None or calories > 400):
            continue
        if quick == "low_carb" and (carbs is None or carbs > 20):
            continue
        if quick == "low_fat" and (fat is None or fat > 10):
            continue
        if quick == "best_efficiency" and efficiency is None:
            continue

        if has_target:
            item["macro_match_score"] = _macro_match_score(
                item, target_calories, target_protein, target_carbs, target_fat
            )

        results.append(item)

    sort_key = args.get("sort")
    if not sort_key:
        if has_target:
            sort_key = "macro_match"
        elif search_terms:
            sort_key = "relevance"
        else:
            sort_key = "name_asc"

    if sort_key == "relevance":
        def relevance_key(item):
            name_norm = _normalize_text(item.get("name", ""))
            name_hits = sum(1 for term in search_terms if term in name_norm)
            return -name_hits
        results.sort(key=relevance_key)
    elif sort_key == "macro_match":
        results.sort(key=lambda i: -(i.get("macro_match_score") or 0))
    elif sort_key in SORT_OPTIONS and SORT_OPTIONS[sort_key]:
        field, reverse = SORT_OPTIONS[sort_key]
        if field == "_efficiency":
            results.sort(key=lambda i: (i.get("protein_per_100_cal") is None, i.get("protein_per_100_cal") or 0), reverse=False)
            if reverse:
                results = [r for r in results if r.get("protein_per_100_cal") is not None][::-1] + \
                        [r for r in results if r.get("protein_per_100_cal") is None]
        elif field == "name":
            results.sort(key=lambda i: str(i.get("name", "")).lower(), reverse=reverse)
        else:
            results.sort(key=lambda i: (_as_number(i.get(field)) is None, _as_number(i.get(field)) or 0), reverse=False)
            if reverse:
                present = [r for r in results if _as_number(r.get(field)) is not None][::-1]
                missing = [r for r in results if _as_number(r.get(field)) is None]
                results = present + missing

    total_count = len(results)
    results = results[:limit]

    response = {
        "count": total_count,
        "returned": len(results),
        "results": results,
        "applied_filters": {
            "search": search_raw or None,
            "restaurant": restaurant,
            "category": category,
            "diet": diet_filters,
            "quick": quick or None,
            "sort": sort_key,
        },
    }

    if unknown_diet_filters:
        response["warnings"] = response.get("warnings", [])
        response["warnings"].append(
            f"Ignored unsupported dietary filter(s): {', '.join(unknown_diet_filters)}"
        )
    if exclude_allergens and not allergen_data_available:
        response["warnings"] = response.get("warnings", [])
        response["warnings"].append(
            "Allergen exclusion was requested but menu.json does not currently include "
            "allergen data, so no allergen filtering was applied."
        )

    return jsonify(response)


#
# ---------------------------------------------------------------
# Build My Meal
#
# Finds small combinations (2-3 items) of existing menu items that
# together land as close as possible to a target calorie/protein
# goal. Never invents nutrition values, only combines real items.
# ---------------------------------------------------------------
#

MEAL_COMBO_SIZES = (2, 3)
MAX_MEAL_CANDIDATE_POOL = 45  # keeps combination count bounded even as the menu grows
MAX_MEAL_RESULTS = 5


def _valid_item_for_meal(item):
    """An item can only be used in a meal combo if it has real, usable
    calorie and protein numbers. Never lets a None slip through into
    a comparison or arithmetic operation."""
    calories = _as_number(item.get("calories"))
    protein = _as_number(item.get("protein_g"))
    return calories is not None and protein is not None and calories > 0


def _meal_totals(combo_items):
    total_calories = 0.0
    total_protein = 0.0
    total_carbs = 0.0
    total_fat = 0.0
    has_carbs = False
    has_fat = False

    for item in combo_items:
        total_calories += _as_number(item.get("calories")) or 0
        total_protein += _as_number(item.get("protein_g")) or 0

        carbs = _as_number(item.get("carbs_g"))
        if carbs is not None:
            total_carbs += carbs
            has_carbs = True

        fat = _as_number(item.get("fat_g"))
        if fat is not None:
            total_fat += fat
            has_fat = True

    return {
        "calories": round(total_calories, 1),
        "protein_g": round(total_protein, 1),
        "carbs_g": round(total_carbs, 1) if has_carbs else None,
        "fat_g": round(total_fat, 1) if has_fat else None,
    }


def _meal_score(totals, target_calories, target_protein):
    calorie_diff = abs(totals["calories"] - target_calories)
    protein_diff = abs(totals["protein_g"] - target_protein)
    return (
        calorie_diff / max(target_calories, 1)
        + protein_diff / max(target_protein, 1)
    )


def _meal_name(totals, target_calories):
    calories = totals["calories"] or 1
    protein_ratio = (totals["protein_g"] / calories) if calories else 0

    if protein_ratio >= 0.16:
        return "High Protein Meal"
    if totals["carbs_g"] is not None and totals["carbs_g"] <= 30:
        return "Low Carb Meal"
    if target_calories and totals["calories"] <= target_calories * 0.85:
        return "Lighter Meal"
    return "Balanced Meal"


@app.route("/api/build-meal", methods=["POST"])
def build_meal():
    payload = request.get_json(silent=True) or {}

    calories_target = _parse_query_number(payload.get("calories"))
    protein_target = _parse_query_number(payload.get("protein"))
    restaurant = (payload.get("restaurant") or "all")
    category = (payload.get("category") or "all")

    if calories_target is None or protein_target is None:
        return jsonify({"error": "calories and protein are required and must be numbers"}), 400
    if calories_target <= 0 or protein_target <= 0:
        return jsonify({"error": "calories and protein must be greater than zero"}), 400

    items = load_menu()
    candidates = list(items)

    if restaurant and restaurant.lower() != "all":
        candidates = [i for i in candidates if i.get("restaurant") == restaurant]

    if category and category.lower() != "all":
        allowed = CATEGORY_GROUPS.get(category.lower(), [category.lower()])
        candidates = [i for i in candidates if str(i.get("category", "")).lower() in allowed]

    # Only items with real calorie/protein numbers can enter a combo, and a
    # single item that already blows past the target isn't a useful building
    # block for a 2-3 item meal.
    candidates = [i for i in candidates if _valid_item_for_meal(i)]
    candidates = [i for i in candidates if _as_number(i["calories"]) <= calories_target * 1.05]

    if not candidates:
        return jsonify({
            "target": {"calories": calories_target, "protein_g": protein_target},
            "meals": [],
        })

    # Bound the combination search: bias the candidate pool toward items
    # sized roughly like one part of a 2-3 item meal, then cap the pool so
    # combination count stays small regardless of how large the menu gets.
    per_item_target = calories_target / 2.5
    candidates.sort(key=lambda i: abs(_as_number(i["calories"]) - per_item_target))
    candidate_pool = candidates[:MAX_MEAL_CANDIDATE_POOL]

    scored_meals = []
    for size in MEAL_COMBO_SIZES:
        if len(candidate_pool) < size:
            continue
        for combo in itertools.combinations(candidate_pool, size):
            totals = _meal_totals(combo)
            score = _meal_score(totals, calories_target, protein_target)
            scored_meals.append((score, combo, totals))

    if not scored_meals:
        return jsonify({
            "target": {"calories": calories_target, "protein_g": protein_target},
            "meals": [],
        })

    # itertools.combinations never repeats a set of items in a different
    # order, so "Burger + Nuggets" and "Nuggets + Burger" can't both appear.
    scored_meals.sort(key=lambda m: m[0])
    top_meals = scored_meals[:MAX_MEAL_RESULTS]

    meals_out = []
    for index, (score, combo, totals) in enumerate(top_meals):
        meals_out.append({
            "name": _meal_name(totals, calories_target),
            "score": round(score, 4),
            "is_best": index == 0,
            "items": list(combo),
            "totals": totals,
            "differences": {
                "calories": round(totals["calories"] - calories_target, 1),
                "protein_g": round(totals["protein_g"] - protein_target, 1),
            },
        })

    return jsonify({
        "target": {"calories": calories_target, "protein_g": protein_target},
        "meals": meals_out,
    })


def _macro_match_score(item, target_calories, target_protein, target_carbs, target_fat):
    targets = {
        "calories": target_calories,
        "protein_g": target_protein,
        "carbs_g": target_carbs,
        "fat_g": target_fat,
    }
    diffs = []
    for field, target in targets.items():
        if target is None:
            continue
        value = _as_number(item.get(field))
        if value is None:
            continue
        diff_pct = abs(value - target) / max(target, 1) * 100
        diffs.append(diff_pct)

    if not diffs:
        return 0
    avg_penalty = sum(diffs) / len(diffs)
    return max(0, round(100 - avg_penalty))


if __name__ == "__main__":
    app.run(debug=True, port=5000)