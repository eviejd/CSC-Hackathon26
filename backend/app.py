"""
MacroMap backend — Flask API

Serves a mock fast-food menu dataset and matches individual menu items
to a user's remaining calorie/protein targets.

Endpoints (existing — unchanged):
    GET  /api/restaurants     -> list of restaurant names
    GET  /api/menu/<restaurant> -> all menu items for that restaurant
    POST /api/match           -> top 5 items that fit the user's targets

Endpoints (new — advanced search):
    GET  /api/categories      -> distinct categories actually present in the data
    GET  /api/tags            -> distinct dietary/descriptive tags present in the data
    GET  /api/search          -> flexible search + filter + sort across all items
"""

import json
import os
import re
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app)  # allow the frontend (served separately) to call this API

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "menu.json")

# The frontend shows a handful of broad category filters. Each one maps to
# the specific menu.json categories it should include.
CATEGORY_GROUPS = {
    "mains": ["burger", "chicken", "taco", "burrito", "quesadilla", "bowl", "dos-capas", "chikito"],
    "sides": ["sides", "nachos"],
    "breakfast": ["breakfast"],
    "kids": ["kids"],
    "desserts": ["desserts"],
    "drinks": ["drinks"],
}

# ---------------------------------------------------------------------------
# Dietary quick-filters for the advanced search.
#
# IMPORTANT: menu.json has no verified vegan / gluten-free / dairy-free /
# allergen data, so those filters are intentionally NOT implemented here —
# adding them would mean guessing, and a wrong dietary claim is a real safety
# issue. Every filter below maps directly to tags that already exist in the
# data (see the `tags` array on each item). If allergen fields are added to
# menu.json in the future, extend ALLERGEN_FIELD accordingly (see the
# `/api/search` `exclude_allergens` handling below).
# ---------------------------------------------------------------------------
DIETARY_TAG_FILTERS = {
    "vegetarian": ["vegetarian"],
    "spicy": ["spicy"],
    "chicken": ["chicken"],
    "beef": ["beef", "barbacoa-beef"],
    "pork": ["pork"],
    "lamb": ["lamb"],
}

# Name of the (currently absent) allergen field on each item, kept as a
# constant so support can be added later without touching the query logic
# in /api/search — see `exclude_allergens` there.
ALLERGEN_FIELD = "allergens"

SORT_OPTIONS = {
    "relevance": None,  # handled specially (search rank / insertion order)
    "macro_match": None,  # handled specially (multi-macro target distance)
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
    """Load the mock menu dataset from disk on every request.

    Reloading from disk (instead of caching in memory) keeps this simple
    for a hackathon: edit menu.json and see changes immediately without
    restarting the server.
    """
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["items"]


# ---------------------------------------------------------------------------
# Safe numeric helpers — every numeric filter goes through these so that
# missing/null/invalid values are ignored rather than crashing the API or
# being silently treated as zero.
# ---------------------------------------------------------------------------

def _as_number(value):
    """Return value as a float, or None if it's missing/invalid. Never
    raises, and never treats None/missing as 0."""
    if value is None:
        return None
    if isinstance(value, bool):  # bool is a subclass of int — reject it
        return None
    if isinstance(value, (int, float)):
        return float(value)
    try:
        return float(value)
    except (TypeError, ValueError):
        return None


def _parse_query_number(raw):
    """Parse a numeric query-string parameter. Returns None if absent/blank
    or not a valid number (never raises)."""
    if raw is None or str(raw).strip() == "":
        return None
    try:
        return float(raw)
    except (TypeError, ValueError):
        return None


MIN_CALORIES_FOR_EFFICIENCY = 20  # below this, trace protein/calorie values
# (e.g. a diet soda with 1 kcal and 0.2g protein) produce a technically-correct
# but meaningless ratio — exclude them rather than let them top a "best
# efficiency" sort.


def protein_efficiency(item):
    """Grams of protein per 100 calories. Returns None when it can't be
    safely computed (missing/zero/invalid/too-small calories or missing
    protein) — see MIN_CALORIES_FOR_EFFICIENCY above."""
    calories = _as_number(item.get("calories"))
    protein = _as_number(item.get("protein_g"))
    if calories is None or protein is None or calories < MIN_CALORIES_FOR_EFFICIENCY:
        return None
    return round((protein / calories) * 100, 2)


_WHITESPACE_RE = re.compile(r"\s+")
_PUNCT_RE = re.compile(r"[^\w\s]")


def _normalize_text(text):
    """Lowercase, strip punctuation, collapse whitespace — used for both the
    search query and the searchable text pulled from each item, so things
    like "Big  Mac!" and "big-mac" line up."""
    text = text.lower()
    text = _PUNCT_RE.sub(" ", text)
    text = _WHITESPACE_RE.sub(" ", text).strip()
    return text


def _searchable_text(item):
    parts = [item.get("name", ""), item.get("category", ""), item.get("restaurant", "")]
    parts.extend(item.get("tags", []) or [])
    return _normalize_text(" ".join(str(p) for p in parts))


def item_matches_search(item, search_terms):
    """True if every whitespace-separated search word appears somewhere in
    the item's searchable text (name/category/restaurant/tags), case- and
    punctuation-insensitive partial matching."""
    if not search_terms:
        return True
    haystack = _searchable_text(item)
    return all(term in haystack for term in search_terms)


@app.route("/api/restaurants", methods=["GET"])
def get_restaurants():
    items = load_menu()
    # dict.fromkeys preserves first-seen order while de-duplicating
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
    category = payload.get("category")  # optional, "all" or missing = no filter

    # --- basic validation ---
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

    # 1. filter by restaurant (an "all" value means every restaurant)
    if restaurant.lower() == "all":
        candidates = list(items)
    else:
        candidates = [i for i in items if i["restaurant"] == restaurant]

    # 2. filter by category, if one was chosen and isn't "all"
    if category and category.lower() != "all":
        allowed = CATEGORY_GROUPS.get(category.lower(), [category.lower()])
        candidates = [i for i in candidates if i["category"].lower() in allowed]

    # 3. remove items above the calorie limit or with invalid calorie data
    candidates = [
        i for i in candidates
        if i.get("calories") is not None
        and isinstance(i["calories"], (int, float))
        and i["calories"] <= calories_target
    ]

    if not candidates:
        return jsonify({"target": {"calories": calories_target, "protein": protein_target}, "matches": []})

    # 4. score + rank by closeness to the protein target
    #    match_score: 100 = hits the protein target exactly, drops off as the
    #    item's protein gets further away from what the user asked for.
    def score(item):
        protein_diff = abs(item["protein_g"] - protein_target)
        # scale the penalty relative to the target so small targets aren't
        # unfairly punished by the same flat penalty as large targets
        penalty = (protein_diff / max(protein_target, 1)) * 100
        return max(0, round(100 - penalty))

    for item in candidates:
        item["match_score"] = score(item)

    # closest protein match first; ties broken by higher protein (usually more useful)
    candidates.sort(key=lambda i: (-i["match_score"], -i["protein_g"]))

    # 5. top 5 matches
    top_matches = candidates[:5]

    # 6. remaining target after eating the item, for the frontend to display
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
    """Distinct categories actually present in menu.json, in first-seen
    order — the advanced-search category filter is built from this rather
    than a hard-coded list."""
    items = load_menu()
    categories = list(dict.fromkeys(item["category"] for item in items if item.get("category")))
    return jsonify(categories)


@app.route("/api/tags", methods=["GET"])
def get_tags():
    """Distinct tags present in menu.json, plus which of the built-in
    dietary quick-filters are actually usable given the current data (a
    filter is only reported as available if at least one item has a
    matching tag)."""
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
    """Flexible search + filter + sort across the whole menu.

    Query parameters (all optional):
        search              free text, matched against name/category/tags
        restaurant          exact restaurant name, or "all"
        category            exact category (as it appears in menu.json), or "all"
        min_calories, max_calories
        min_protein, max_protein
        min_carbs, max_carbs
        min_fat, max_fat
        target_calories, target_protein, target_carbs, target_fat
                            optional macro goal — when any target_* is given,
                            each result gets a match_score (0-100) for how
                            close it is to the given target(s)
        diet                comma-separated dietary quick-filters, e.g.
                            "vegetarian,spicy" (see DIETARY_TAG_FILTERS) — ANDed
        quick               a single convenience quick-filter: one of
                            "high_protein", "low_calorie", "low_carb",
                            "low_fat", "best_efficiency"
        sort                one of SORT_OPTIONS' keys (default: "relevance"
                            when `search` is set, else "macro_match" when a
                            target is set, else "name_asc")
        limit               max results to return (default 60)

    This endpoint is purely additive — it does not touch /api/match, so any
    existing frontend or API consumer calling /api/match is unaffected.
    """
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

    # Allergen exclusion is future-proofed but not active: menu.json has no
    # allergen field today, so honoring this would either silently do
    # nothing or (worse) require guessing. We accept the parameter, ignore
    # it safely, and say so in the response rather than pretending to filter.
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
        item = dict(original)  # never mutate the loaded/cached data

        # --- restaurant / category exact filters ---
        if restaurant.lower() != "all" and item.get("restaurant") != restaurant:
            continue
        if category.lower() != "all" and str(item.get("category", "")).lower() != category.lower():
            continue

        # --- free-text search ---
        if not item_matches_search(item, search_terms):
            continue

        # --- dietary tag filters (AND across selected filters) ---
        if diet_filters:
            item_tags = set(t.lower() for t in (item.get("tags") or []))
            if not all(
                any(tag in item_tags for tag in DIETARY_TAG_FILTERS[f])
                for f in diet_filters
            ):
                continue

        # --- numeric range filters (missing values -> excluded, never crash) ---
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

        # --- quick filters, derived from the actual data (not hard-coded lists) ---
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

        # --- macro-goal match score (only meaningful if a target was given) ---
        if has_target:
            item["macro_match_score"] = _macro_match_score(
                item, target_calories, target_protein, target_carbs, target_fat
            )

        results.append(item)

    # --- sort ---
    sort_key = args.get("sort")
    if not sort_key:
        if has_target:
            sort_key = "macro_match"
        elif search_terms:
            sort_key = "relevance"
        else:
            sort_key = "name_asc"

    if sort_key == "relevance":
        # Rank by number of matched search terms found in the name specifically
        # (closest to what the user typed), falling back to insertion order.
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
            # numeric field: items missing the value sort to the end regardless of direction
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


def _macro_match_score(item, target_calories, target_protein, target_carbs, target_fat):
    """Score 0-100 for how close an item is to whichever macro targets were
    given. Only targets that were actually supplied are considered; missing
    item fields are skipped rather than penalized as zero."""
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