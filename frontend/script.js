    // MacroMap frontend
    // Talks to the Flask API at API_BASE. No frameworks, just fetch + DOM updates.

    const API_BASE = "http://127.0.0.1:5000/api";

    const CATEGORY_ICONS = {
    burger: '<i class="fa-solid fa-burger"></i>',
    chicken: "🍗",
    sides: "🍟",
    desserts: "🍦",
    drinks: "🥤",
    };

    // ---- element references ----
    const form = document.getElementById("match-form");
    const restaurantSelect = document.getElementById("restaurant");
    const categoryGroup = document.getElementById("category-group");
    const categoryInput = document.getElementById("category");
    const submitBtn = document.getElementById("submit-btn");

    const resultsEmpty = document.getElementById("results-empty");
    const resultsLoading = document.getElementById("results-loading");
    const resultsError = document.getElementById("results-error");
    const resultsContent = document.getElementById("results-content");
    const targetSummary = document.getElementById("target-summary");
    const resultsGrid = document.getElementById("results-grid");

    // ---- state ----
    let selectedCategory = "all";

    // ---------------------------------------------------------
    // Setup: load the restaurant list on page load
    // ---------------------------------------------------------
    async function loadRestaurants() {
    try {
        const res = await fetch(`${API_BASE}/restaurants`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const restaurants = await res.json();

        restaurantSelect.innerHTML = "";
        if (restaurants.length === 0) {
        restaurantSelect.innerHTML = `<option value="" disabled selected>No restaurants available</option>`;
        return;
        }

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.textContent = "Choose a restaurant";
        placeholder.disabled = true;
        placeholder.selected = true;
        restaurantSelect.appendChild(placeholder);

        restaurants.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        restaurantSelect.appendChild(opt);
        });
    } catch (err) {
        restaurantSelect.innerHTML = `<option value="" disabled selected>Couldn't load restaurants</option>`;
        console.error("Failed to load restaurants:", err);
    }
    }

    // ---------------------------------------------------------
    // Category buttons — single-select, mirrors value into hidden input
    // ---------------------------------------------------------
    categoryGroup.addEventListener("click", (event) => {
    const btn = event.target.closest(".category-btn");
    if (!btn) return;

    categoryGroup.querySelectorAll(".category-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    selectedCategory = btn.dataset.category;
    categoryInput.value = selectedCategory;
    });

    // ---------------------------------------------------------
    // Form submission
    // ---------------------------------------------------------
    form.addEventListener("submit", async (event) => {
    event.preventDefault();

    const calories = Number(document.getElementById("calories").value);
    const protein = Number(document.getElementById("protein").value);
    const restaurant = restaurantSelect.value;

    if (!restaurant) {
        showError("Pick a restaurant first.");
        return;
    }
    if (Number.isNaN(calories) || Number.isNaN(protein) || calories < 0 || protein < 0) {
        showError("Enter valid calorie and protein numbers.");
        return;
    }

    await fetchMatches({ restaurant, calories, protein, category: selectedCategory });
    });

    // ---------------------------------------------------------
    // API call + rendering
    // ---------------------------------------------------------
    async function fetchMatches(payload) {
    setState("loading");
    submitBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/match`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        });

        if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
        }

        const data = await res.json();
        renderResults(data, payload.calories, payload.protein);
    } catch (err) {
        console.error("Match request failed:", err);
        showError("Couldn't reach the server. Is the Flask backend running?");
    } finally {
        submitBtn.disabled = false;
    }
    }

    function renderResults(data, calories, protein) {
    if (!data.matches || data.matches.length === 0) {
        setState("empty");
        resultsEmpty.textContent = "No menu items fit those targets. Try raising your calorie limit.";
        return;
    }

    targetSummary.innerHTML = `
        <span class="target-chip">${calories} kcal</span>
        <span class="target-chip">${protein}g protein</span>
    `;

    resultsGrid.innerHTML = "";
    data.matches.forEach((item, index) => {
        resultsGrid.appendChild(buildCard(item, index === 0));
    });

    setState("content");
    }

    function buildCard(item, isBest) {
    const card = document.createElement("article");
    card.className = "result-card" + (isBest ? " is-best" : "");

    const icon = CATEGORY_ICONS[item.category] || "🍽️";

    card.innerHTML = `
        ${isBest ? '<span class="best-tag">Best match</span>' : ""}
        <div class="result-card-header">
        <span class="result-name">${icon} ${escapeHtml(item.name)}</span>
        <span class="match-badge">${item.match_score}% match</span>
        </div>
        <dl class="macro-list">
        <span>Calories</span><strong>${item.calories} kcal</strong>
        <span>Protein</span><strong>${item.protein_g}g</strong>
        <span>Carbs</span><strong>${item.carbs_g}g</strong>
        <span>Fat</span><strong>${item.fat_g}g</strong>
        </dl>
        <p class="remaining">
        ${formatRemaining(item.remaining.calories, " kcal")} · ${formatRemaining(item.remaining.protein, "g protein")}
        </p>
    `;
    return card;
    }

    // Shows e.g. "50 kcal remaining" or "2g protein remaining" (or "over" if negative).
    function formatRemaining(value, label) {
    const over = value < 0;
    return `${Math.abs(value)}${label} ${over ? "over" : "remaining"}`;
    }

    function showError(message) {
    resultsError.textContent = message;
    setState("error");
    }

    // ---------------------------------------------------------
    // Simple state machine for the results panel
    // ---------------------------------------------------------
    function setState(state) {
    resultsEmpty.hidden = state !== "empty";
    resultsLoading.hidden = state !== "loading";
    resultsError.hidden = state !== "error";
    resultsContent.hidden = state !== "content";
    }

    function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
    }

    // ---- init ----
    loadRestaurants();