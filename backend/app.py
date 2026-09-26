"""
MacroMap backend — Flask API

Serves a mock fast-food menu dataset and matches individual menu items
to a user's remaining calorie/protein targets.

Endpoints:
    GET  /api/restaurants     -> list of restaurant names
    GET  /api/menu/<restaurant> -> all menu items for that restaurant
    POST /api/match           -> top 5 items that fit the user's targets
"""

import json
import os
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


def load_menu():
    """Load the mock menu dataset from disk on every request.

    Reloading from disk (instead of caching in memory) keeps this simple
    for a hackathon: edit menu.json and see changes immediately without
    restarting the server.
    """
    with open(DATA_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return data["items"]


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


if __name__ == "__main__":
    app.run(debug=True, port=5000)