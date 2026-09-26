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
    "price_asc": ("price", False),
    "price_desc": ("price", True),
}

CHEAP_PRICE_THRESHOLD = 10.0


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



def _price_matches(price, min_price=None, max_price=None, exact_price=None):
    if min_price is None and max_price is None and exact_price is None:
        return True
    if price is None:
        return False
    if exact_price is not None and price != exact_price:
        return False
    if min_price is not None and price < min_price:
        return False
    if max_price is not None and price > max_price:
        return False
    return True


def filter_by_price(items, min_price=None, max_price=None, exact_price=None):
    return [
        item for item in items
        if _price_matches(_as_number(item.get("price")), min_price, max_price, exact_price)
    ]


_PRICE_BETWEEN_RE = re.compile(
    r"\bbetween\s*\$?(\d+(?:\.\d+)?)\s*(?:and|-|to)\s*\$?(\d+(?:\.\d+)?)\b", re.IGNORECASE
)
_PRICE_DASH_RANGE_RE = re.compile(
    r"\$(\d+(?:\.\d+)?)\s*-\s*\$?(\d+(?:\.\d+)?)|\$?(\d+(?:\.\d+)?)\s*-\s*\$(\d+(?:\.\d+)?)"
)
_PRICE_OR_LESS_RE = re.compile(r"\$(\d+(?:\.\d+)?)\s*or\s*less\b", re.IGNORECASE)
_PRICE_OR_UNDER_RE = re.compile(r"\$(\d+(?:\.\d+)?)\s*or\s*under\b", re.IGNORECASE)
_PRICE_OR_MORE_RE = re.compile(r"\$(\d+(?:\.\d+)?)\s*or\s*more\b", re.IGNORECASE)
_PRICE_UNDER_RE = re.compile(
    r"\b(?:under|below|less than|cheaper than)\s*\$?(\d+(?:\.\d+)?)\b", re.IGNORECASE
)
_PRICE_OVER_RE = re.compile(
    r"\b(?:over|above|more than)\s*\$?(\d+(?:\.\d+)?)\b", re.IGNORECASE
)
_PRICE_EXACT_RE = re.compile(r"\bexactly\s*\$(\d+(?:\.\d+)?)\b", re.IGNORECASE)
_PRICE_CHEAP_RE = re.compile(r"\bcheap\b", re.IGNORECASE)
_PRICE_BARE_RE = re.compile(r"\$(\d+(?:\.\d+)?)\b")


def _extract_price_filters(text):
    if not text:
        return text, {}

    for pattern, build in (
        (_PRICE_BETWEEN_RE, lambda m: {
            "min_price": min(float(m.group(1)), float(m.group(2))),
            "max_price": max(float(m.group(1)), float(m.group(2))),
        }),
        (_PRICE_DASH_RANGE_RE, lambda m: {
            "min_price": min(float(g) for g in m.groups() if g is not None),
            "max_price": max(float(g) for g in m.groups() if g is not None),
        }),
        (_PRICE_OR_LESS_RE, lambda m: {"max_price": float(m.group(1))}),
        (_PRICE_OR_UNDER_RE, lambda m: {"max_price": float(m.group(1))}),
        (_PRICE_OR_MORE_RE, lambda m: {"min_price": float(m.group(1))}),
        (_PRICE_UNDER_RE, lambda m: {"max_price": float(m.group(1))}),
        (_PRICE_OVER_RE, lambda m: {"min_price": float(m.group(1))}),
        (_PRICE_EXACT_RE, lambda m: {"exact_price": float(m.group(1))}),
        (_PRICE_BARE_RE, lambda m: {"max_price": float(m.group(1))}),
    ):
        match = pattern.search(text)
        if match:
            remaining = (text[:match.start()] + " " + text[match.end():]).strip()
            return remaining, build(match)

    if _PRICE_CHEAP_RE.search(text):
        remaining = _PRICE_CHEAP_RE.sub(" ", text).strip()
        return remaining, {"max_price": CHEAP_PRICE_THRESHOLD}

    return text, {}


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
    max_price = _parse_query_number(payload.get("max_price"))
    min_price = _parse_query_number(payload.get("min_price"))

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

    if min_price is not None or max_price is not None:
        candidates = filter_by_price(candidates, min_price=min_price, max_price=max_price)

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
    search_text_for_terms, extracted_price = _extract_price_filters(search_raw)
    search_terms = _normalize_text(search_text_for_terms).split() if search_text_for_terms else []

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

    min_price = _parse_query_number(args.get("min_price"))
    max_price = _parse_query_number(args.get("max_price"))
    exact_price = _parse_query_number(args.get("exact_price"))
    if min_price is None:
        min_price = extracted_price.get("min_price")
    if max_price is None:
        max_price = extracted_price.get("max_price")
    if exact_price is None:
        exact_price = extracted_price.get("exact_price")

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

        price = _as_number(item.get("price"))
        if not _price_matches(price, min_price, max_price, exact_price):
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
        if quick == "budget_friendly" and (price is None or price > CHEAP_PRICE_THRESHOLD):
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
            "min_price": min_price,
            "max_price": max_price,
            "exact_price": exact_price,
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


MEAL_COMBO_SIZES = (2, 3)
MAX_MEAL_CANDIDATE_POOL = 45 
MAX_MEAL_RESULTS = 5


def _valid_item_for_meal(item):
    calories = _as_number(item.get("calories"))
    protein = _as_number(item.get("protein_g"))
    return calories is not None and protein is not None and calories > 0


def _meal_totals(combo_items):
    total_calories = 0.0
    total_protein = 0.0
    total_carbs = 0.0
    total_fat = 0.0
    total_price = 0.0
    has_carbs = False
    has_fat = False
    has_price = True

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

        price = _as_number(item.get("price"))
        if price is not None:
            total_price += price
        else:
            has_price = False

    return {
        "calories": round(total_calories, 1),
        "protein_g": round(total_protein, 1),
        "carbs_g": round(total_carbs, 1) if has_carbs else None,
        "fat_g": round(total_fat, 1) if has_fat else None,
        "price": round(total_price, 2) if has_price else None,
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
    max_budget = _parse_query_number(payload.get("max_price"))
    if max_budget is None:
        max_budget = _parse_query_number(payload.get("budget"))

    if calories_target is None or protein_target is None:
        return jsonify({"error": "calories and protein are required and must be numbers"}), 400
    if calories_target <= 0 or protein_target <= 0:
        return jsonify({"error": "calories and protein must be greater than zero"}), 400
    if max_budget is not None and max_budget <= 0:
        return jsonify({"error": "max_price/budget must be greater than zero"}), 400

    items = load_menu()
    candidates = list(items)

    if restaurant and restaurant.lower() != "all":
        candidates = [i for i in candidates if i.get("restaurant") == restaurant]

    if category and category.lower() != "all":
        allowed = CATEGORY_GROUPS.get(category.lower(), [category.lower()])
        candidates = [i for i in candidates if str(i.get("category", "")).lower() in allowed]

    candidates = [i for i in candidates if _valid_item_for_meal(i)]
    candidates = [i for i in candidates if _as_number(i["calories"]) <= calories_target * 1.05]

    if max_budget is not None:
        # Pre-filter out any single item priced above the whole budget: since all
        # prices are non-negative, an item like that could never be part of a combo
        # whose *total* fits the budget either, so dropping it early just shrinks
        # the candidate pool before we generate combinations.
        candidates = filter_by_price(candidates, max_price=max_budget)

    if not candidates:
        return jsonify({
            "target": {"calories": calories_target, "protein_g": protein_target},
            "max_price": max_budget,
            "meals": [],
        })

    per_item_target = calories_target / 2.5
    candidates.sort(key=lambda i: abs(_as_number(i["calories"]) - per_item_target))
    candidate_pool = candidates[:MAX_MEAL_CANDIDATE_POOL]

    scored_meals = []
    for size in MEAL_COMBO_SIZES:
        if len(candidate_pool) < size:
            continue
        for combo in itertools.combinations(candidate_pool, size):
            totals = _meal_totals(combo)
            # The budget is a cap on what the whole meal costs, not just each item,
            # so combos whose combined price breaks the budget are dropped here.
            # totals["price"] is None only if some item in the combo had an
            # invalid/missing price; treat that as failing the budget check too,
            # since we can't confirm it's within budget.
            if max_budget is not None and (totals["price"] is None or totals["price"] > max_budget):
                continue
            score = _meal_score(totals, calories_target, protein_target)
            scored_meals.append((score, combo, totals))

    if not scored_meals:
        return jsonify({
            "target": {"calories": calories_target, "protein_g": protein_target},
            "max_price": max_budget,
            "meals": [],
        })


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
        "max_price": max_budget,
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
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)