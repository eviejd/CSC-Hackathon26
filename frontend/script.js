const API_BASE = "http://127.0.0.1:5000/api";

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

        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "All restaurants";
        allOption.selected = true;
        restaurantSelect.appendChild(allOption);

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
    const restaurant = restaurantSelect.value || "all";

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

    const imageMarkup = item.image
        ? `<img class="food-card-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'), { className: 'food-card-image food-card-placeholder', textContent: 'No image available' }))">`
        : `<div class="food-card-image food-card-placeholder">No image available</div>`;

    card.innerHTML = `
        ${isBest ? '<span class="best-tag">Best match</span>' : ""}
        ${imageMarkup}
        <div class="result-card-header">
        <span class="result-name">${escapeHtml(item.name)}</span>
        <span class="match-badge">${item.match_score}% match</span>
        </div>
        <p class="result-restaurant">${escapeHtml(item.restaurant)}</p>
        <dl class="macro-list">
        <span>Calories</span><strong>${item.calories} kcal</strong>
        <span>Protein</span><strong>${item.protein_g}g</strong>
        <span>Carbs</span><strong>${item.carbs_g}g</strong>
        <span>Fat</span><strong>${item.fat_g}g</strong>
        </dl>
        <p class="remaining">
        ${formatRemaining(item.remaining.calories, " kcal")} · ${formatRemaining(item.remaining.protein, "g protein")}
        </p>
        <span class="category-chip">${escapeHtml(formatCategory(item.category))}</span>
    `;
    return card;
    }

    // "dos-capas" -> "Dos Capas"
    function formatCategory(category) {
    return String(category)
        .split("-")
        .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
        .join(" ");
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

    /* =========================================================
    ADVANCED SEARCH — additive feature, does not touch anything
    above this line. Uses the new GET /api/search endpoint.
    ========================================================= */

    // ---- tab switching ----
    const tabMacroMatch = document.getElementById("tab-macro-match");
    const tabAdvancedSearch = document.getElementById("tab-advanced-search");
    const macroMatchView = document.getElementById("macro-match-view");
    const advancedSearchView = document.getElementById("advanced-search-view");

    function activateTab(tab) {
    const isAdvanced = tab === "advanced";
    tabMacroMatch.classList.toggle("is-active", !isAdvanced);
    tabAdvancedSearch.classList.toggle("is-active", isAdvanced);
    tabMacroMatch.setAttribute("aria-selected", String(!isAdvanced));
    tabAdvancedSearch.setAttribute("aria-selected", String(isAdvanced));
    macroMatchView.hidden = isAdvanced;
    advancedSearchView.hidden = !isAdvanced;
    if (isAdvanced && !advancedSearchInitialized) {
        initAdvancedSearch();
    }
    }

    tabMacroMatch.addEventListener("click", () => activateTab("macro"));
    tabAdvancedSearch.addEventListener("click", () => activateTab("advanced"));

    // ---- advanced search element references ----
    const searchInput = document.getElementById("search-input");
    const searchRestaurantSelect = document.getElementById("search-restaurant");
    const searchCategorySelect = document.getElementById("search-category");
    const minCalories = document.getElementById("min-calories");
    const maxCalories = document.getElementById("max-calories");
    const minProtein = document.getElementById("min-protein");
    const maxProtein = document.getElementById("max-protein");
    const minCarbs = document.getElementById("min-carbs");
    const maxCarbs = document.getElementById("max-carbs");
    const minFat = document.getElementById("min-fat");
    const maxFat = document.getElementById("max-fat");
    const targetCalories = document.getElementById("target-calories");
    const targetProtein = document.getElementById("target-protein");
    const targetCarbs = document.getElementById("target-carbs");
    const targetFat = document.getElementById("target-fat");
    const quickFilterGroup = document.getElementById("quick-filter-group");
    const dietFilterGroup = document.getElementById("diet-filter-group");
    const sortSelect = document.getElementById("sort-select");
    const clearFiltersBtn = document.getElementById("clear-filters-btn");

    const searchResultsEmpty = document.getElementById("search-results-empty");
    const searchResultsLoading = document.getElementById("search-results-loading");
    const searchResultsError = document.getElementById("search-results-error");
    const searchResultsContent = document.getElementById("search-results-content");
    const searchResultsCount = document.getElementById("search-results-count");
    const searchResultsGrid = document.getElementById("search-results-grid");

    // Human-friendly labels for the raw category values that live in menu.json
    // (e.g. "dos-capas" -> "Dos Capas"); reuses the same formatter already
    // defined above for the macro-match cards.

    // Human-friendly labels for the built-in dietary filters
    const DIET_FILTER_LABELS = {
    vegetarian: "Vegetarian",
    spicy: "Spicy",
    chicken: "Chicken",
    beef: "Beef",
    pork: "Pork",
    lamb: "Lamb",
    };

    let advancedSearchInitialized = false;
    let activeQuickFilter = null; // single-select, like the macro-match category buttons
    let activeDietFilters = new Set(); // multi-select

    async function initAdvancedSearch() {
    advancedSearchInitialized = true;
    await Promise.all([populateSearchRestaurants(), populateSearchCategories(), populateDietFilters()]);
    attachAdvancedSearchListeners();
    runSearch(); // show the full (unfiltered) menu on first open
    }

    async function populateSearchRestaurants() {
    try {
        const res = await fetch(`${API_BASE}/restaurants`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const restaurants = await res.json();
        restaurants.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        searchRestaurantSelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load restaurants for search:", err);
    }
    }

    async function populateSearchCategories() {
    try {
        const res = await fetch(`${API_BASE}/categories`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const categories = await res.json();
        categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = formatCategory(cat);
        searchCategorySelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load categories for search:", err);
    }
    }

    async function populateDietFilters() {
    try {
        const res = await fetch(`${API_BASE}/tags`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const data = await res.json();
        const available = data.dietary_filters || [];
        if (available.length === 0) {
        dietFilterGroup.innerHTML = `<span class="hint-text">No dietary tags available in this menu data.</span>`;
        return;
        }
        dietFilterGroup.innerHTML = "";
        available.forEach((key) => {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "quick-filter-btn";
        btn.dataset.diet = key;
        btn.textContent = DIET_FILTER_LABELS[key] || formatCategory(key);
        dietFilterGroup.appendChild(btn);
        });
    } catch (err) {
        console.error("Failed to load dietary filters:", err);
        dietFilterGroup.innerHTML = `<span class="hint-text">Couldn't load dietary filters.</span>`;
    }
    }

    function attachAdvancedSearchListeners() {
    // debounced text search so we don't fire a request on every keystroke
    let debounceHandle = null;
    searchInput.addEventListener("input", () => {
        clearTimeout(debounceHandle);
        debounceHandle = setTimeout(runSearch, 300);
    });

    [
        searchRestaurantSelect,
        searchCategorySelect,
        sortSelect,
    ].forEach((el) => el.addEventListener("change", runSearch));

    [
        minCalories, maxCalories, minProtein, maxProtein,
        minCarbs, maxCarbs, minFat, maxFat,
        targetCalories, targetProtein, targetCarbs, targetFat,
    ].forEach((el) => {
        let handle = null;
        el.addEventListener("input", () => {
        clearTimeout(handle);
        handle = setTimeout(runSearch, 400);
        });
    });

    quickFilterGroup.addEventListener("click", (event) => {
        const btn = event.target.closest(".quick-filter-btn");
        if (!btn) return;
        const isAlreadyActive = btn.classList.contains("is-active");
        quickFilterGroup.querySelectorAll(".quick-filter-btn").forEach((b) => b.classList.remove("is-active"));
        if (isAlreadyActive) {
        activeQuickFilter = null; // click again to deselect
        } else {
        btn.classList.add("is-active");
        activeQuickFilter = btn.dataset.quick;
        }
        runSearch();
    });

    dietFilterGroup.addEventListener("click", (event) => {
        const btn = event.target.closest(".quick-filter-btn");
        if (!btn) return;
        const key = btn.dataset.diet;
        if (activeDietFilters.has(key)) {
        activeDietFilters.delete(key);
        btn.classList.remove("is-active");
        } else {
        activeDietFilters.add(key);
        btn.classList.add("is-active");
        }
        runSearch();
    });

    clearFiltersBtn.addEventListener("click", () => {
        searchInput.value = "";
        searchRestaurantSelect.value = "all";
        searchCategorySelect.value = "all";
        [minCalories, maxCalories, minProtein, maxProtein, minCarbs, maxCarbs, minFat, maxFat,
        targetCalories, targetProtein, targetCarbs, targetFat].forEach((el) => (el.value = ""));
        sortSelect.value = "relevance";
        activeQuickFilter = null;
        activeDietFilters.clear();
        quickFilterGroup.querySelectorAll(".quick-filter-btn").forEach((b) => b.classList.remove("is-active"));
        dietFilterGroup.querySelectorAll(".quick-filter-btn").forEach((b) => b.classList.remove("is-active"));
        runSearch();
    });
    }

    function buildSearchParams() {
    const params = new URLSearchParams();

    if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
    if (searchRestaurantSelect.value && searchRestaurantSelect.value !== "all") {
        params.set("restaurant", searchRestaurantSelect.value);
    }
    if (searchCategorySelect.value && searchCategorySelect.value !== "all") {
        params.set("category", searchCategorySelect.value);
    }

    const numericFields = [
        ["min_calories", minCalories], ["max_calories", maxCalories],
        ["min_protein", minProtein], ["max_protein", maxProtein],
        ["min_carbs", minCarbs], ["max_carbs", maxCarbs],
        ["min_fat", minFat], ["max_fat", maxFat],
        ["target_calories", targetCalories], ["target_protein", targetProtein],
        ["target_carbs", targetCarbs], ["target_fat", targetFat],
    ];
    numericFields.forEach(([key, el]) => {
        if (el.value !== "") params.set(key, el.value);
    });

    if (activeQuickFilter) params.set("quick", activeQuickFilter);
    if (activeDietFilters.size > 0) params.set("diet", Array.from(activeDietFilters).join(","));

    // Only override the default sort if the user picked one that isn't the
    // implicit default already, so "Best match to macro goal" stays selected
    // sensibly when a target is filled in.
    if (sortSelect.value) params.set("sort", sortSelect.value);

    return params;
    }

    async function runSearch() {
    setSearchState("loading");
    const params = buildSearchParams();

    try {
        const res = await fetch(`${API_BASE}/search?${params.toString()}`);
        if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
        }
        const data = await res.json();
        renderSearchResults(data);
    } catch (err) {
        console.error("Search request failed:", err);
        searchResultsError.textContent = "Couldn't reach the server. Is the Flask backend running?";
        setSearchState("error");
    }
    }

    function renderSearchResults(data) {
    const results = data.results || [];
    if (results.length === 0) {
        setSearchState("empty");
        searchResultsEmpty.textContent = "No menu items match those filters. Try loosening a filter.";
        return;
    }

    searchResultsCount.textContent = `Showing ${data.returned} of ${data.count} result${data.count === 1 ? "" : "s"}`;

    searchResultsGrid.innerHTML = "";
    results.forEach((item) => {
        searchResultsGrid.appendChild(buildSearchCard(item));
    });

    setSearchState("content");
    }

    function buildSearchCard(item) {
    const card = document.createElement("article");
    card.className = "result-card";

    const imageMarkup = item.image
        ? `<img class="food-card-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.replaceWith(Object.assign(document.createElement('div'), { className: 'food-card-image food-card-placeholder', textContent: 'No image available' }))">`
        : `<div class="food-card-image food-card-placeholder">No image available</div>`;

    // Only show a score badge when it's actually meaningful (macro-goal
    // matching was requested); a plain filtered search has no "score".
    const scoreBadge = (item.macro_match_score !== undefined)
        ? `<span class="match-badge">${item.macro_match_score}% match</span>`
        : "";

    const calories = item.calories != null ? `${item.calories} kcal` : "—";
    const protein = item.protein_g != null ? `${item.protein_g}g` : "—";
    const carbs = item.carbs_g != null ? `${item.carbs_g}g` : "—";
    const fat = item.fat_g != null ? `${item.fat_g}g` : "—";
    const efficiency = item.protein_per_100_cal != null
        ? `<p class="remaining">${item.protein_per_100_cal}g protein per 100 kcal</p>`
        : "";

    card.innerHTML = `
        ${imageMarkup}
        <div class="result-card-header">
        <span class="result-name">${escapeHtml(item.name)}</span>
        ${scoreBadge}
        </div>
        <p class="result-restaurant">${escapeHtml(item.restaurant)}</p>
        <dl class="macro-list">
        <span>Calories</span><strong>${calories}</strong>
        <span>Protein</span><strong>${protein}</strong>
        <span>Carbs</span><strong>${carbs}</strong>
        <span>Fat</span><strong>${fat}</strong>
        </dl>
        ${efficiency}
        <span class="category-chip">${escapeHtml(formatCategory(item.category))}</span>
    `;
    return card;
    }

    function setSearchState(state) {
    searchResultsEmpty.hidden = state !== "empty";
    searchResultsLoading.hidden = state !== "loading";
    searchResultsError.hidden = state !== "error";
    searchResultsContent.hidden = state !== "content";
    }