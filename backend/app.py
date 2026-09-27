import itertools
import json
import os
import re
from flask import Flask, jsonify, request
from flask_cors import CORS

app = Flask(__name__)
CORS(app) 

DATA_PATH = os.path.join(os.path.dirname(__file__), "data", "menu.json")
INGREDIENTS_PATH = os.path.join(os.path.dirname(__file__), "data", "menuIngredients.json")

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

CHEAP_PRICE_THRESHOLD = 10.0

TAG_WEIGHTS = {
    # Tier 1 — food type + protein: the "core identity" of the item
    "burger": 3, "chicken": 3, "beef": 3, "lamb": 3, "pork": 3,
    "cauliflower": 3, "vegetarian": 3, "bowl": 3, "taco": 3,
    "burrito": 3, "wrap": 3, "quesadilla": 3, "chikito": 3,
    "dos-capas": 3, "nuggets": 3, "wings": 3,

    # Tier 2 — meaningful but secondary attributes
    "cheese": 1, "bacon": 1, "double": 1, "high-protein": 1,
    "leaner": 1, "crispy": 1, "spicy": 1, "zinger": 1,
    "original": 1, "wicked": 1, "tenders": 1, "fillet": 1,

    # Tier 3 — flavor/branding descriptors
    "bbq": 0.3, "stacker": 0.3, "supercharged": 0.3, "mayo": 0.3,
    "slider": 0.3, "no-sauce": 0.3, "sweet": 0.3, "chocolate": 0.3,
    "caramel": 0.3, "strawberry": 0.3, "vanilla": 0.3,
}

ALLERGEN_KEYS = ("ingredients", "allergens", "may_contain", "allergen_status", "allergen_source")

_ingredients_cache = None

DEFAULT_TAG_WEIGHT = 0.3  # fallback for any tag not listed above

def _load_ingredients_by_id():
    """Loads menuIngredients.json once and indexes it by item id.
    Only ALLERGEN_KEYS are ever pulled from this file — everything else
    in it (calories, price, image, etc.) is ignored, since menu.json
    stays the source of truth for those fields."""
    global _ingredients_cache
    if _ingredients_cache is not None:
        return _ingredients_cache

    try:
        with open(INGREDIENTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: could not load menuIngredients.json ({e}); allergen data will be unavailable.")
        _ingredients_cache = {}
        return _ingredients_cache

    by_id = {}
    for entry in data.get("items", []):
        item_id = entry.get("id")
        if not item_id:
            continue
        by_id[item_id] = {key: entry.get(key) for key in ALLERGEN_KEYS}

    _ingredients_cache = by_id
    return _ingredients_cache

TAG_WEIGHTS = {
    # Tier 1 — food type + protein: the "core identity" of the item
    "burger": 3, "chicken": 3, "beef": 3, "lamb": 3, "pork": 3,
    "cauliflower": 3, "vegetarian": 3, "bowl": 3, "taco": 3,
    "burrito": 3, "wrap": 3, "quesadilla": 3, "chikito": 3,
    "dos-capas": 3, "nuggets": 3, "wings": 3,

    # Tier 2 — meaningful but secondary attributes
    "cheese": 1, "bacon": 1, "double": 1, "high-protein": 1,
    "leaner": 1, "crispy": 1, "spicy": 1, "zinger": 1,
    "original": 1, "wicked": 1, "tenders": 1, "fillet": 1,

    # Tier 3 — flavor/branding descriptors
    "bbq": 0.3, "stacker": 0.3, "supercharged": 0.3, "mayo": 0.3,
    "slider": 0.3, "no-sauce": 0.3, "sweet": 0.3, "chocolate": 0.3,
    "caramel": 0.3, "strawberry": 0.3, "vanilla": 0.3,
}

ALLERGEN_KEYS = ("ingredients", "allergens", "may_contain", "allergen_status", "allergen_source")

_ingredients_cache = None

DEFAULT_TAG_WEIGHT = 0.3  # fallback for any tag not listed above

def _load_ingredients_by_id():
    """Loads menuIngredients.json once and indexes it by item id.
    Only ALLERGEN_KEYS are ever pulled from this file — everything else
    in it (calories, price, image, etc.) is ignored, since menu.json
    stays the source of truth for those fields."""
    global _ingredients_cache
    if _ingredients_cache is not None:
        return _ingredients_cache

    try:
        with open(INGREDIENTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError) as e:
        print(f"Warning: could not load menuIngredients.json ({e}); allergen data will be unavailable.")
        _ingredients_cache = {}
        return _ingredients_cache

    by_id = {}
    for entry in data.get("items", []):
        item_id = entry.get("id")
        if not item_id:
            continue
        by_id[item_id] = {key: entry.get(key) for key in ALLERGEN_KEYS}

    _ingredients_cache = by_id
    return _ingredients_cache


def load_menu():
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    
    items = data["items"]
    ingredients_by_id = _load_ingredients_by_id()
    for item in items:
        allergen_data = ingredients_by_id.get(item.get("id"))
        if allergen_data:
            item.update(allergen_data)
        else:
            # No matching entry in menuIngredients.json for this id —
            # treat exactly like an "unavailable" item so the allergen
            # filter hides it rather than guessing.
            item.setdefault("allergen_status", "unavailable")
            item.setdefault("allergens", None)
            item.setdefault("may_contain", None)
            item.setdefault("allergen_source", None)
    return items


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

@app.route("/api/allergens", methods=["GET"])
def get_allergens():
    try:
        with open(INGREDIENTS_PATH, "r", encoding="utf-8") as f:
            data = json.load(f)
    except (FileNotFoundError, json.JSONDecodeError):
        return jsonify([])
    return jsonify(data.get("allergen_codes", []))


# ---- Relevance scoring shared by individual items and auto-generated bundles --------

def _search_relevance_score(item, search_terms):
    """0-100 score for how strongly an item matches the search terms, given that
    item_matches_search() already guarantees every term appears *somewhere* in the
    item's searchable text. A name hit counts for more than a tag/category hit."""
    if not search_terms:
        return None
    name_norm = _normalize_text(item.get("name", ""))
    name_words = set(name_norm.split())
    tags_norm = _normalize_text(" ".join(str(t) for t in (item.get("tags") or [])))
    category_norm = _normalize_text(str(item.get("category", "")))

    per_term_scores = []
    for term in search_terms:
        if term in name_words:
            per_term_scores.append(1.0)
        elif term in name_norm:
            per_term_scores.append(0.85)
        elif term in tags_norm:
            per_term_scores.append(0.6)
        elif term in category_norm:
            per_term_scores.append(0.5)
        else:
            per_term_scores.append(0.3)
    return round((sum(per_term_scores) / len(per_term_scores)) * 100, 1)


def _combine_relevance(macro_score, search_score, has_target, has_search):
    """Overall 'how relevant is this result to what the user asked for' score,
    blending macro fit and search relevance rather than letting either one alone
    dominate the ranking."""
    if has_target and has_search and search_score is not None:
        return round(0.65 * (macro_score or 0) + 0.35 * search_score, 1)
    if has_target:
        return round(macro_score, 1) if macro_score is not None else 0.0
    if has_search and search_score is not None:
        return search_score
    return 100.0


# ---- Automatic meal-bundle generation (folded into Macro Match results) -------------

MAX_BUNDLE_POOL_PER_RESTAURANT = 18
MAX_BUNDLES_PER_ANCHOR = 2
MAX_BUNDLES_IN_RESULTS = 6


def _bundle_component_candidates(items, restaurant, category, diet_filters, search_terms):
    """Items eligible to be part of a bundle. Restaurant/category/diet/search are
    meaningful per-component, so they're applied here; numeric ranges (calories,
    price, etc.) are applied to the bundle TOTAL later, not to each component,
    so a filter like 'max 400 calories' doesn't wrongly reject a 150-calorie side
    that would have made a great bundle piece."""
    candidates = []
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
        if not _valid_item_for_meal(item):
            continue
        candidates.append(item)
    return candidates


def _bundle_totals_pass_filters(totals, min_calories, max_calories, min_protein, max_protein,
                                 min_carbs, max_carbs, min_fat, max_fat,
                                 min_price, max_price, exact_price, quick):
    calories = totals["calories"]
    protein = totals["protein_g"]
    carbs = totals["carbs_g"]
    fat = totals["fat_g"]
    price = totals["price"]

    if min_calories is not None and (calories is None or calories < min_calories):
        return False
    if max_calories is not None and (calories is None or calories > max_calories):
        return False
    if min_protein is not None and (protein is None or protein < min_protein):
        return False
    if max_protein is not None and (protein is None or protein > max_protein):
        return False
    if min_carbs is not None and (carbs is None or carbs < min_carbs):
        return False
    if max_carbs is not None and (carbs is None or carbs > max_carbs):
        return False
    if min_fat is not None and (fat is None or fat < min_fat):
        return False
    if max_fat is not None and (fat is None or fat > max_fat):
        return False
    if not _price_matches(price, min_price, max_price, exact_price):
        return False

    efficiency = None
    if calories and calories >= MIN_CALORIES_FOR_EFFICIENCY and protein is not None:
        efficiency = round((protein / calories) * 100, 2)

    if quick == "high_protein" and (protein is None or protein < 25):
        return False
    if quick == "low_calorie" and (calories is None or calories > 400):
        return False
    if quick == "low_carb" and (carbs is None or carbs > 20):
        return False
    if quick == "low_fat" and (fat is None or fat > 10):
        return False
    if quick == "best_efficiency" and efficiency is None:
        return False
    if quick == "budget_friendly" and (price is None or price > CHEAP_PRICE_THRESHOLD):
        return False

    return True


def _generate_bundles(component_pool, target_calories, target_protein, target_carbs, target_fat,
                       search_terms, has_search,
                       min_calories, max_calories, min_protein, max_protein,
                       min_carbs, max_carbs, min_fat, max_fat,
                       min_price, max_price, exact_price, quick):
    """Build 2-3 item, same-restaurant bundles, score them with the same
    macro_match_score/relevance approach as individual items, then keep only a
    diverse top set. Meaningless combinations are never surfaced by the caller,
    which only shows bundles that clear the same relevance bar as everything else."""
    if target_calories is None or target_protein is None:
        return []

    by_restaurant = {}
    for item in component_pool:
        by_restaurant.setdefault(item.get("restaurant"), []).append(item)

    per_item_target = target_calories / 2.5 if target_calories else None

    scored_bundles = []
    for restaurant_name, group in by_restaurant.items():
        if len(group) < 2:
            continue
        if per_item_target:
            pool = sorted(group, key=lambda i: abs((_as_number(i.get("calories")) or 0) - per_item_target))
        else:
            pool = group
        pool = pool[:MAX_BUNDLE_POOL_PER_RESTAURANT]

        for size in MEAL_COMBO_SIZES:
            if len(pool) < size:
                continue
            for combo in itertools.combinations(pool, size):
                totals = _meal_totals(combo)
                if not _bundle_totals_pass_filters(
                    totals, min_calories, max_calories, min_protein, max_protein,
                    min_carbs, max_carbs, min_fat, max_fat,
                    min_price, max_price, exact_price, quick,
                ):
                    continue

                macro_score = _macro_match_score(
                    totals, target_calories, target_protein, target_carbs, target_fat
                )

                search_score = None
                if has_search:
                    component_scores = [
                        s for s in (_search_relevance_score(i, search_terms) for i in combo)
                        if s is not None
                    ]
                    search_score = max(component_scores) if component_scores else None

                relevance = _combine_relevance(macro_score, search_score, True, has_search)

                anchor = max(combo, key=lambda i: _as_number(i.get("calories")) or 0)

                scored_bundles.append({
                    "restaurant": restaurant_name,
                    "items": list(combo),
                    "totals": totals,
                    "macro_match_score": macro_score,
                    "search_relevance_score": search_score,
                    "relevance_score": relevance,
                    "anchor_id": anchor.get("id"),
                    "item_id_set": frozenset(i.get("id") for i in combo),
                })

    # Rank by relevance, then greedily keep a diverse top set: no exact-duplicate
    # item combinations, and no single "anchor" item appearing in too many bundles
    # (avoids "Burger + Fries / Burger + Nuggets / Burger + Drink ..." spam).
    scored_bundles.sort(key=lambda b: -b["relevance_score"])

    selected = []
    seen_item_sets = set()
    anchor_counts = {}
    for bundle in scored_bundles:
        if bundle["item_id_set"] in seen_item_sets:
            continue
        anchor = bundle["anchor_id"]
        if anchor_counts.get(anchor, 0) >= MAX_BUNDLES_PER_ANCHOR:
            continue
        selected.append(bundle)
        seen_item_sets.add(bundle["item_id_set"])
        anchor_counts[anchor] = anchor_counts.get(anchor, 0) + 1
        if len(selected) >= MAX_BUNDLES_IN_RESULTS:
            break

    return selected


def _format_bundle_result(bundle):
    items = bundle["items"]
    name = " + ".join(i.get("name", "") for i in items)
    return {
        "result_type": "bundle",
        "id": "bundle-" + "-".join(sorted(str(i.get("id", "")) for i in items)),
        "name": name,
        "restaurant": bundle["restaurant"],
        "category": "bundle",
        "items": [
            {
                "id": i.get("id"),
                "name": i.get("name"),
                "image": i.get("image"),
                "price": i.get("price"),
            }
            for i in items
        ],
        "calories": bundle["totals"]["calories"],
        "protein_g": bundle["totals"]["protein_g"],
        "carbs_g": bundle["totals"]["carbs_g"],
        "fat_g": bundle["totals"]["fat_g"],
        "price": bundle["totals"]["price"],
        "macro_match_score": bundle["macro_match_score"],
        "search_relevance_score": bundle["search_relevance_score"],
        "relevance_score": bundle["relevance_score"],
    }


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

    strict_allergens_raw = (args.get("strict_allergens") or "").strip().lower()
    strict_allergens = strict_allergens_raw in ("1", "true", "yes")

    try:
        limit = int(args.get("limit", 60))
    except (TypeError, ValueError):
        limit = 60
    limit = max(1, min(limit, 500))

    items = load_menu()
    allergen_data_available = any(item.get(ALLERGEN_FIELD) is not None for item in items)

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

        if exclude_allergens:
            item_status = item.get("allergen_status")
            item_allergens = item.get(ALLERGEN_FIELD)
            item_may_contain = item.get("may_contain")

            # unknown allergen data -> hide for safety, don't guess
            if item_status == "unavailable" or item_allergens is None:
                continue

            present = set(a.lower() for a in item_allergens)
            if any(a in present for a in exclude_allergens):
                continue

            if strict_allergens:
                traces = set(a.lower() for a in (item_may_contain or []))
                if any(a in traces for a in exclude_allergens):
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

        search_score = _search_relevance_score(item, search_terms) if search_terms else None
        if search_score is not None:
            item["search_relevance_score"] = search_score
        item["relevance_score"] = _combine_relevance(
            item.get("macro_match_score"), search_score, has_target, bool(search_terms)
        )
        item["result_type"] = "item"

        results.append(item)

    # Meal bundles are generated automatically as part of the same Macro Match
    # request whenever the user has given calorie + protein targets (the two
    # required fields), rather than as a separate user-selected mode.
    has_core_target = target_calories is not None and target_protein is not None
    bundle_results = []
    if has_core_target:
        component_pool = _bundle_component_candidates(items, restaurant, category, diet_filters, search_terms)
        bundles = _generate_bundles(
            component_pool, target_calories, target_protein, target_carbs, target_fat,
            search_terms, bool(search_terms),
            min_calories, max_calories, min_protein, max_protein,
            min_carbs, max_carbs, min_fat, max_fat,
            min_price, max_price, exact_price, quick,
        )
        bundle_results = [_format_bundle_result(b) for b in bundles]

    combined = results + bundle_results

    # Sorting is "quality filtered": establish a minimum relevance bar first, then
    # sort *within* the qualifying set, so a secondary criterion like price or
    # protein can never push an obviously poor match above genuinely relevant
    # results. The preferred bar is ~80% relevance; if too few results clear it,
    # it's relaxed step by step rather than padding the list with weak matches.
    RELEVANCE_LEVELS = [80, 65, 50, 35, 20, 0]
    MIN_QUALIFYING = 3

    def _relevance(r):
        return r.get("relevance_score") or 0

    qualifying = combined
    if combined:
        needed = min(MIN_QUALIFYING, len(combined))
        for threshold in RELEVANCE_LEVELS:
            at_level = [r for r in combined if _relevance(r) >= threshold]
            if len(at_level) >= needed:
                qualifying = at_level
                break
        else:
            qualifying = combined

    sort_key = (args.get("sort") or "most_relevant").strip().lower()
    if sort_key in ("relevance", "macro_match"):  # backward-compat aliases
        sort_key = "most_relevant"

    if sort_key == "price_asc":
        present = [r for r in qualifying if _as_number(r.get("price")) is not None]
        missing = [r for r in qualifying if _as_number(r.get("price")) is None]
        present.sort(key=lambda r: (_as_number(r.get("price")), -_relevance(r)))
        qualifying = present + missing
    elif sort_key == "protein_desc":
        present = [r for r in qualifying if _as_number(r.get("protein_g")) is not None]
        missing = [r for r in qualifying if _as_number(r.get("protein_g")) is None]
        present.sort(key=lambda r: (-_as_number(r.get("protein_g")), -_relevance(r)))
        qualifying = present + missing
    elif sort_key == "calories_asc":
        present = [r for r in qualifying if _as_number(r.get("calories")) is not None]
        missing = [r for r in qualifying if _as_number(r.get("calories")) is None]
        present.sort(key=lambda r: (_as_number(r.get("calories")), -_relevance(r)))
        qualifying = present + missing
    else:
        sort_key = "most_relevant"
        qualifying.sort(key=lambda r: (-_relevance(r), -(r.get("macro_match_score") or 0)))

    total_count = len(qualifying)
    item_count = sum(1 for r in qualifying if r.get("result_type") == "item")
    bundle_count = sum(1 for r in qualifying if r.get("result_type") == "bundle")
    final_results = qualifying[:limit]

    response = {
        "count": total_count,
        "returned": len(final_results),
        "item_count": item_count,
        "bundle_count": bundle_count,
        "results": final_results,
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
            "exclude_allergens": exclude_allergens,
            "strict_allergens": strict_allergens,
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

# for node edge cimilarity colouring
def _tag_similarity(item_a, item_b, tag_weights=TAG_WEIGHTS):
    tags_a = set(item_a.get("tags") or [])
    tags_b = set(item_b.get("tags") or [])

    shared = tags_a & tags_b  # set intersection: tags both items have

    def weight(tag):
        return tag_weights.get(tag, DEFAULT_TAG_WEIGHT)

    shared_weight = sum(weight(t) for t in shared)
    total_weight_a = sum(weight(t) for t in tags_a)
    total_weight_b = sum(weight(t) for t in tags_b)

    # avoid divide-by-zero for an item with no tags at all
    match_pct_a = round((shared_weight / total_weight_a) * 100, 1) if total_weight_a else 0
    match_pct_b = round((shared_weight / total_weight_b) * 100, 1) if total_weight_b else 0

    return {
        "shared_tags": sorted(shared),
        "match_pct_a": match_pct_a,
        "match_pct_b": match_pct_b,
    }

    # ---- Explore graph: precomputed tag-similarity edges between items -----------------

GRAPH_CACHE_PATH = os.path.join(os.path.dirname(__file__), "data", "graph_cache.json")


def _build_edge_index(items):
    """All pairwise tag-similarity edges among items that share at least one tag.
    Stored per item id, from that item's own perspective (match_pct_a when the
    item is item_a in _tag_similarity), so a node always finds its own % when
    looked up by its own id."""
    edges = {item["id"]: [] for item in items if item.get("id")}

    for i, item_a in enumerate(items):
        id_a = item_a.get("id")
        if not id_a:
            continue
        for item_b in items[i + 1:]:
            id_b = item_b.get("id")
            if not id_b:
                continue
            result = _tag_similarity(item_a, item_b)
            if not result["shared_tags"]:
                continue  # no shared tags -> no edge at all
            edges[id_a].append({
                "neighbor_id": id_b,
                "match_pct": result["match_pct_a"],
                "shared_tags": result["shared_tags"],
            })
            edges[id_b].append({
                "neighbor_id": id_a,
                "match_pct": result["match_pct_b"],
                "shared_tags": result["shared_tags"],
            })

    return edges


def _load_edge_index(items):
    """Loads cached edges if menu.json hasn't changed since they were generated;
    otherwise recomputes and re-caches. Avoids recalculating every tag comparison
    on every request."""
    current_mtime = os.path.getmtime(DATA_PATH)

    if os.path.exists(GRAPH_CACHE_PATH):
        try:
            with open(GRAPH_CACHE_PATH, "r", encoding="utf-8") as f:
                cache = json.load(f)
            if cache.get("menu_mtime") == current_mtime:
                return cache["edges"]
        except (json.JSONDecodeError, KeyError):
            pass  # fall through and regenerate

    edges = _build_edge_index(items)
    try:
        with open(GRAPH_CACHE_PATH, "w", encoding="utf-8") as f:
            json.dump({"menu_mtime": current_mtime, "edges": edges}, f)
    except OSError:
        pass  # cache write failing shouldn't break the request

    return edges


def _closeness_pct(value, target):
    """100 = exactly at target, dropping toward 0 the further away value is
    (in either direction). Used for both the calorie fill and protein outline."""
    if value is None or target is None or target <= 0:
        return 0
    diff_pct = abs(value - target) / target * 100
    return max(0, round(100 - diff_pct, 1))


@app.route("/api/graph", methods=["GET"])
def get_graph():
    args = request.args
    target_calories = _parse_query_number(args.get("target_calories"))
    target_protein = _parse_query_number(args.get("target_protein"))
    restaurant = (args.get("restaurant") or "all").strip()
    category = (args.get("category") or "all").strip()

    items = load_menu()
    edge_index = _load_edge_index(items)

    filtered = []
    for item in items:
        if restaurant.lower() != "all" and item.get("restaurant") != restaurant:
            continue
        if category.lower() != "all" and str(item.get("category", "")).lower() != category.lower():
            continue
        filtered.append(item)

    visible_ids = {item["id"] for item in filtered if item.get("id")}

    nodes = []
    for item in filtered:
        calories = _as_number(item.get("calories"))
        protein = _as_number(item.get("protein_g"))
        nodes.append({
            "id": item.get("id"),
            "name": item.get("name"),
            "restaurant": item.get("restaurant"),
            "category": item.get("category"),
            "image": item.get("image"),
            "calories": calories,
            "protein_g": protein,
            "cal_pct": _closeness_pct(calories, target_calories),
            "protein_pct": _closeness_pct(protein, target_protein),
        })

    edges = []
    seen_pairs = set()
    for item_id in visible_ids:
        for edge in edge_index.get(item_id, []):
            neighbor_id = edge["neighbor_id"]
            if neighbor_id not in visible_ids:
                continue
            pair = tuple(sorted((item_id, neighbor_id)))
            if pair in seen_pairs:
                continue
            seen_pairs.add(pair)
            neighbor_pct = next(
                (e["match_pct"] for e in edge_index.get(neighbor_id, []) if e["neighbor_id"] == item_id),
                edge["match_pct"],
            )
            edges.append({
                "source": item_id,
                "target": neighbor_id,
                "source_match_pct": edge["match_pct"],
                "target_match_pct": neighbor_pct,
                "shared_tags": edge["shared_tags"],
            })

    return jsonify({
        "target": {"calories": target_calories, "protein_g": target_protein},
        "nodes": nodes,
        "edges": edges,
    })


if __name__ == "__main__":
    import os
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)