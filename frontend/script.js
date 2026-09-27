const API_BASE = "https://macro-aware-picks-backend.onrender.com/api";

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
    // Image Presentation Helper
    // Eliminates excessive whitespace and centers the food
    // ---------------------------------------------------------
    const ITEM_IMAGE_OVERRIDES = {
    // KFC items with significant empty top space
    "kfc-original-crispy-burger": { scale: 1.32, position: "center 65%" },
    "kfc-zinger-burger": { scale: 1.32, position: "center 65%" },
    "kfc-zinger-crunch-burger": { scale: 1.30, position: "center 65%" },
    "kfc-original-crispy-bacon-cheese-burger": { scale: 1.30, position: "center 65%" },
    "kfc-original-crispy-bbq-bacon-stacker-burger": { scale: 1.32, position: "center 65%" },
    "kfc-zinger-stacker-burger": { scale: 1.32, position: "center 65%" },
    "kfc-double-tender-burger": { scale: 1.30, position: "center 65%" },
    "kfc-wicked-burger": { scale: 1.30, position: "center 65%" },
    "kfc-original-crispy-fillet-piece": { scale: 1.25, position: "center 58%" },
    "kfc-zinger-fillet-piece": { scale: 1.25, position: "center 58%" },

    // McDonald's burgers & muffins with extra tile padding
    "mcdonalds-big-mac": { scale: 1.25, position: "center 58%" },
    "mcdonalds-quarter-pounder-cheese": { scale: 1.26, position: "center 58%" },
    "mcdonalds-cheeseburger": { scale: 1.28, position: "center 60%" },
    "mcdonalds-double-quarter-pounder": { scale: 1.25, position: "center 58%" },
    "mcdonalds-triple-cheeseburger": { scale: 1.25, position: "center 58%" },
    "mcdonalds-hamburger": { scale: 1.28, position: "center 60%" },
    "mcdonalds-mcchicken": { scale: 1.26, position: "center 58%" },
    "mcdonalds-mcspicy-burger": { scale: 1.25, position: "center 58%" },
    "mcdonalds-filet-o-fish": { scale: 1.25, position: "center 58%" },
    "mcdonalds-dbl-filet-o-fish": { scale: 1.25, position: "center 58%" },
    "mcdonalds-bacon-egg-muffin": { scale: 1.28, position: "center 62%" },
    "mcdonalds-sausage-muffin": { scale: 1.28, position: "center 62%" },
    "mcdonalds-deluxe-bacon-egg-mcmuffin": { scale: 1.26, position: "center 60%" },
    "mcdonalds-dbl-saus-egg-muffin": { scale: 1.25, position: "center 60%" },
    "mcdonalds-saus-egg-muffin": { scale: 1.26, position: "center 60%" },
    "mcdonalds-hotcakes": { scale: 1.24, position: "center 55%" },
    };

    function getImagePresentation(item) {
    // 1. Direct explicit fields from JSON if present
    if (item.image_scale || item.image_position) {
        return {
        scale: item.image_scale || 1.15,
        position: item.image_position || "center center",
        };
    }

    // 2. Specific item override
    if (ITEM_IMAGE_OVERRIDES[item.id]) {
        return ITEM_IMAGE_OVERRIDES[item.id];
    }

    const category = (item.category || "").toLowerCase();
    const restaurant = (item.restaurant || "").toLowerCase();

    // 3. Category / Restaurant heuristics
    if (restaurant.includes("kfc")) {
        if (category === "burger") return { scale: 1.30, position: "center 65%" };
        if (category === "chicken") return { scale: 1.22, position: "center 56%" };
        return { scale: 1.20, position: "center 58%" };
    }

    if (restaurant.includes("mcdonald")) {
        if (category === "burger") return { scale: 1.25, position: "center 58%" };
        if (category === "breakfast") return { scale: 1.25, position: "center 60%" };
        if (category === "desserts") return { scale: 1.14, position: "center 48%" };
        if (category === "chicken" && !item.name.toLowerCase().includes("wrap")) {
        return { scale: 1.24, position: "center 58%" };
        }
    }

    // Default balanced zoom to remove surrounding transparent margins
    return { scale: 1.16, position: "center center" };
    }

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
        renderEmptyState(resultsEmpty, {
        title: "No matches found",
        message: "Try adjusting your calorie, protein, or other filters.",
        showClear: true,
        onClear: resetMatchForm,
        });
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

    const { scale, position } = getImagePresentation(item);
    const styleString = `--img-scale: ${scale}; --img-pos: ${position};`;

    const imageMarkup = item.image
        ? `<div class="food-card-image-container" style="${styleString}">
            <img class="food-card-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'food-card-placeholder\\'>No image available</div>'">
        </div>`
        : `<div class="food-card-image-container">
            <div class="food-card-placeholder">No image available</div>
        </div>`;

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

    function formatRemaining(value, label) {
    const over = value < 0;
    return `${Math.abs(value)}${label} ${over ? "over" : "remaining"}`;
    }

    function showError(message) {
    resultsError.textContent = message;
    setState("error");
    }

    function setState(state) {
    resultsEmpty.hidden = state !== "empty";
    resultsLoading.hidden = state !== "loading";
    resultsError.hidden = state !== "error";
    resultsContent.hidden = state !== "content";
    if (state === "loading") {
        resultsLoading.innerHTML = buildSkeletonGrid(6);
    }
    }

    function resetMatchForm() {
    document.getElementById("calories").value = "";
    document.getElementById("protein").value = "";
    if (restaurantSelect.querySelector('option[value="all"]')) {
        restaurantSelect.value = "all";
    }
    categoryGroup.querySelectorAll(".category-btn").forEach((b) => b.classList.remove("is-active"));
    const allBtn = categoryGroup.querySelector('[data-category="all"]');
    if (allBtn) allBtn.classList.add("is-active");
    selectedCategory = "all";
    categoryInput.value = "all";

    setState("empty");
    renderEmptyState(resultsEmpty, {
        title: "Set your targets",
        message: "Set your targets and pick a restaurant to see what fits.",
        showClear: false,
    });
    }

    function escapeHtml(str) {
    const div = document.createElement("div");
    div.textContent = str;
    return div.innerHTML;
    }

    // ---------------------------------------------------------
    // Shared skeleton loading grid
    // Used by Macro Match, Advanced Search, and Build My Meal so
    // the layout stays stable while a request is in flight.
    // ---------------------------------------------------------
    function buildSkeletonCard() {
    return `
        <div class="skeleton-card" aria-hidden="true">
        <div class="skeleton-block skeleton-image"></div>
        <div class="skeleton-block skeleton-line is-title"></div>
        <div class="skeleton-block skeleton-line is-short"></div>
        <div class="skeleton-macros">
            <div class="skeleton-block"></div>
            <div class="skeleton-block"></div>
            <div class="skeleton-block"></div>
            <div class="skeleton-block"></div>
        </div>
        </div>
    `;
    }

    function buildSkeletonGrid(count) {
    return `<div class="skeleton-grid">${Array.from({ length: count }, buildSkeletonCard).join("")}</div>`;
    }

    // ---------------------------------------------------------
    // Shared structured empty state
    // options: { title, message, showClear, onClear }
    // ---------------------------------------------------------
    function renderEmptyState(container, options) {
    const { title, message, showClear, onClear } = options;
    container.innerHTML = `
        <div class="empty-state">
        <p class="empty-state-title">${escapeHtml(title)}</p>
        <p class="empty-state-message">${escapeHtml(message)}</p>
        ${showClear ? '<button type="button" class="clear-btn empty-state-clear">Clear Filters</button>' : ""}
        </div>
    `;
    if (showClear && typeof onClear === "function") {
        container.querySelector(".empty-state-clear").addEventListener("click", onClear);
    }
    }

    // ---- init ----
    loadRestaurants();

    /* =========================================================
    ADVANCED SEARCH
    ========================================================= */

    const tabMacroMatch = document.getElementById("tab-macro-match");
    const tabAdvancedSearch = document.getElementById("tab-advanced-search");
    const tabBuildMeal = document.getElementById("tab-build-meal");
    const macroMatchView = document.getElementById("macro-match-view");
    const advancedSearchView = document.getElementById("advanced-search-view");
    const buildMealView = document.getElementById("build-meal-view");

    const TAB_CONFIG = {
    macro: { btn: tabMacroMatch, view: macroMatchView },
    advanced: { btn: tabAdvancedSearch, view: advancedSearchView },
    "build-meal": { btn: tabBuildMeal, view: buildMealView },
    };

    function activateTab(tab) {
    Object.entries(TAB_CONFIG).forEach(([key, { btn, view }]) => {
        const isActive = key === tab;
        btn.classList.toggle("is-active", isActive);
        btn.setAttribute("aria-selected", String(isActive));
        view.hidden = !isActive;
    });

    if (tab === "advanced" && !advancedSearchInitialized) {
        initAdvancedSearch();
    }
    if (tab === "build-meal" && !buildMealInitialized) {
        initBuildMeal();
    }
    }

    tabMacroMatch.addEventListener("click", () => activateTab("macro"));
    tabAdvancedSearch.addEventListener("click", () => activateTab("advanced"));
    tabBuildMeal.addEventListener("click", () => activateTab("build-meal"));

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
    const allergenFilterGroup = document.getElementById("allergen-filter-group");
    const strictAllergensToggle = document.getElementById("strict-allergens-toggle");
    const sortSelect = document.getElementById("sort-select");
    const clearFiltersBtn = document.getElementById("clear-filters-btn");

    const searchResultsEmpty = document.getElementById("search-results-empty");
    const searchResultsLoading = document.getElementById("search-results-loading");
    const searchResultsError = document.getElementById("search-results-error");
    const searchResultsContent = document.getElementById("search-results-content");
    const searchResultsCount = document.getElementById("search-results-count");
    const searchResultsGrid = document.getElementById("search-results-grid");
    const searchResultsWarning = document.getElementById("search-results-warning");

    const DIET_FILTER_LABELS = {
    vegetarian: "Vegetarian",
    spicy: "Spicy",
    chicken: "Chicken",
    beef: "Beef",
    pork: "Pork",
    lamb: "Lamb",
    };
    const ALLERGEN_LABELS = {
    gluten: "Gluten",
    milk: "Milk",
    egg: "Egg",
    soy: "Soy",
    peanut: "Peanut",
    "tree-nut": "Tree Nut",
    sesame: "Sesame",
    fish: "Fish",
    sulphites: "Sulphites",
    };

    let activeAllergenFilters = new Set();
    let advancedSearchInitialized = false;
    let activeQuickFilter = null;
    let activeDietFilters = new Set();

    async function initAdvancedSearch() {
    advancedSearchInitialized = true;
    await Promise.all([populateSearchRestaurants(), populateSearchCategories(), populateDietFilters()]);
    populateAllergenFilters();
    attachAdvancedSearchListeners();
    runSearch();
    }

    function populateAllergenFilters() {
        allergenFilterGroup.innerHTML = "";
        Object.entries(ALLERGEN_LABELS).forEach(([key, label]) => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "quick-filter-btn";
            btn.dataset.allergen = key;
            btn.textContent = label;
            allergenFilterGroup.appendChild(btn);
        });
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
        let debounceHandle = null;
        searchInput.addEventListener("input", () => {
            clearTimeout(debounceHandle);
            debounceHandle = setTimeout(runSearch, 300);
        });

        [searchRestaurantSelect, searchCategorySelect, sortSelect].forEach((el) =>
            el.addEventListener("change", runSearch)
        );

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
            activeQuickFilter = null;
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

        allergenFilterGroup.addEventListener("click", (event) => {
        const btn = event.target.closest(".quick-filter-btn");
        if (!btn) return;
        const key = btn.dataset.allergen;
        if (activeAllergenFilters.has(key)) {
            activeAllergenFilters.delete(key);
            btn.classList.remove("is-active");
        } else {
            activeAllergenFilters.add(key);
            btn.classList.add("is-active");
        }
        runSearch();
    });

    strictAllergensToggle.addEventListener("change", runSearch);

        clearFiltersBtn.addEventListener("click", () => {
            searchInput.value = "";
            searchRestaurantSelect.value = "all";
            searchCategorySelect.value = "all";
            [
            minCalories, maxCalories, minProtein, maxProtein, minCarbs, maxCarbs, minFat, maxFat,
            targetCalories, targetProtein, targetCarbs, targetFat,
            ].forEach((el) => (el.value = ""));
            sortSelect.value = "relevance";
            activeQuickFilter = null;
            activeDietFilters.clear();
            activeAllergenFilters.clear();
            allergenFilterGroup.querySelectorAll(".quick-filter-btn").forEach((b) => b.classList.remove("is-active"));
            quickFilterGroup.querySelectorAll(".quick-filter-btn").forEach((b) => b.classList.remove("is-active"));
            dietFilterGroup.querySelectorAll(".quick-filter-btn").forEach((b) => b.classList.remove("is-active"));
            strictAllergensToggle.checked = false;
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
        if (activeAllergenFilters.size > 0) params.set("exclude_allergens", Array.from(activeAllergenFilters).join(","));
        if (strictAllergensToggle.checked) params.set("strict_allergens", "true");
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
            renderEmptyState(searchResultsEmpty, {
            title: "No foods found",
            message: "Try changing your search or filters.",
            showClear: true,
            onClear: () => clearFiltersBtn.click(),
            });
            return;
        }

        searchResultsCount.textContent = `Showing ${data.returned} of ${data.count} result${data.count === 1 ? "" : "s"}`;

        if (data.warnings && data.warnings.length > 0) {
            searchResultsWarning.textContent = data.warnings.join(" ");
            searchResultsWarning.hidden = false;
        } else {
            searchResultsWarning.hidden = true;
        }

        searchResultsGrid.innerHTML = "";
        results.forEach((item) => {
            searchResultsGrid.appendChild(buildSearchCard(item));
        });

        setSearchState("content");
    }

    function buildSearchCard(item) {
    const card = document.createElement("article");
    card.className = "result-card";

    const { scale, position } = getImagePresentation(item);
    const styleString = `--img-scale: ${scale}; --img-pos: ${position};`;

    const imageMarkup = item.image
        ? `<div class="food-card-image-container" style="${styleString}">
            <img class="food-card-image" src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'food-card-placeholder\\'>No image available</div>'">
        </div>`
        : `<div class="food-card-image-container">
            <div class="food-card-placeholder">No image available</div>
        </div>`;

    const scoreBadge = item.macro_match_score !== undefined
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
    if (state === "loading") {
        searchResultsLoading.innerHTML = buildSkeletonGrid(6);
    }
    }


    /* =========================================================
    BUILD MY MEAL
    Flow: Choose Restaurant -> Choose Meal Type -> Generate Meal.
    Every request is scoped to exactly one restaurant (the existing
    `restaurant` property on each menu item is the only source of truth —
    see validateMealRestaurant below) and one Meal Type. There are no
    Calorie/Protein targets or a Category filter here anymore; the server
    picks a fitting combination based on how each meal type is defined.
    ========================================================= */

    const buildMealForm = document.getElementById("build-meal-form");
    const buildMealRestaurantSelect = document.getElementById("build-meal-restaurant");
    const buildMealTypeSelect = document.getElementById("build-meal-type");
    const buildMealSubmitBtn = document.getElementById("build-meal-submit-btn");

    const buildMealEmpty = document.getElementById("build-meal-empty");
    const buildMealLoading = document.getElementById("build-meal-loading");
    const buildMealError = document.getElementById("build-meal-error");
    const buildMealContent = document.getElementById("build-meal-content");
    const buildMealTargetSummary = document.getElementById("build-meal-target-summary");
    const buildMealGrid = document.getElementById("build-meal-grid");

    let buildMealInitialized = false;

    // The restaurant currently selected for the meal builder. This is the
    // single source of truth for which restaurant's items are allowed —
    // every item returned by the server is checked against it before it
    // is ever shown or added to a meal.
    let buildMealSelectedRestaurant = "";

    // Recently generated combinations, kept only for this browser session
    // and scoped per restaurant + meal type, so regenerating tends to
    // avoid repeating "same main + same side + same drink" while still
    // respecting the selected restaurant and meal type.
    const RECENT_COMBOS_LIMIT = 8;
    const recentCombosByKey = new Map();

    function recentComboKey(restaurant, mealType) {
    return `${restaurant}::${mealType}`;
    }

    function rememberCombo(restaurant, mealType, itemIds) {
    const key = recentComboKey(restaurant, mealType);
    const list = recentCombosByKey.get(key) || [];
    list.push(itemIds);
    while (list.length > RECENT_COMBOS_LIMIT) list.shift();
    recentCombosByKey.set(key, list);
    }

    function recentCombosFor(restaurant, mealType) {
    return recentCombosByKey.get(recentComboKey(restaurant, mealType)) || [];
    }

    async function initBuildMeal() {
    buildMealInitialized = true;
    await populateBuildMealRestaurants();
    buildMealForm.addEventListener("submit", handleBuildMealSubmit);
    buildMealRestaurantSelect.addEventListener("change", handleBuildMealRestaurantChange);
    buildMealTypeSelect.addEventListener("change", handleBuildMealTypeChange);
    }

    async function populateBuildMealRestaurants() {
    try {
        const res = await fetch(`${API_BASE}/restaurants`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const restaurants = await res.json();

        buildMealRestaurantSelect.innerHTML = "";

        if (restaurants.length === 0) {
        buildMealRestaurantSelect.innerHTML = `<option value="" disabled selected>No restaurants available</option>`;
        return;
        }

        const placeholder = document.createElement("option");
        placeholder.value = "";
        placeholder.disabled = true;
        placeholder.selected = true;
        placeholder.textContent = "Select a restaurant…";
        buildMealRestaurantSelect.appendChild(placeholder);

        // Restaurants come straight from the existing menu data (via the
        // /api/restaurants endpoint, which derives its list from the same
        // menu.json items) — no separate, hard-coded restaurant list.
        restaurants.forEach((name) => {
        const opt = document.createElement("option");
        opt.value = name;
        opt.textContent = name;
        buildMealRestaurantSelect.appendChild(opt);
        });
    } catch (err) {
        buildMealRestaurantSelect.innerHTML = `<option value="" disabled selected>Couldn't load restaurants</option>`;
        console.error("Failed to load restaurants for Build My Meal:", err);
    }
    }

    // ---------------------------------------------------------
    // Changing the restaurant always resets the current meal
    // selection/results, then — if a meal type was already chosen —
    // immediately regenerates using only the newly selected
    // restaurant's items.
    // ---------------------------------------------------------
    function handleBuildMealRestaurantChange() {
    const value = buildMealRestaurantSelect.value;
    buildMealSelectedRestaurant = value && value !== "all" ? value : "";

    // Clear/reset any previously generated meal — never leave results on
    // screen that could reflect a different restaurant.
    buildMealGrid.innerHTML = "";
    buildMealTargetSummary.innerHTML = "";

    if (!buildMealSelectedRestaurant) {
        buildMealTypeSelect.disabled = true;
        buildMealSubmitBtn.disabled = true;
        setBuildMealState("empty");
        buildMealEmpty.innerHTML = "Choose a restaurant to start building your meal.";
        return;
    }

    buildMealTypeSelect.disabled = false;
    buildMealSubmitBtn.disabled = false;

    if (buildMealTypeSelect.value) {
        // A meal type is already chosen — recalculate right away so the
        // displayed results update immediately for the new restaurant.
        generateBuildMeal();
    } else {
        setBuildMealState("empty");
        buildMealEmpty.innerHTML = "Choose a meal type, then tap Generate Meal.";
    }
    }

    function handleBuildMealTypeChange() {
    // A different meal type means the previous result no longer applies —
    // clear it and wait for the user to generate again.
    buildMealGrid.innerHTML = "";
    buildMealTargetSummary.innerHTML = "";
    setBuildMealState("empty");
    buildMealEmpty.innerHTML = "Tap Generate Meal to build your meal.";
    }

    function resetBuildMealForm() {
    if (buildMealRestaurantSelect.querySelector('option[value=""]')) {
        buildMealRestaurantSelect.value = "";
    }
    buildMealTypeSelect.value = "high_protein";
    buildMealTypeSelect.disabled = true;
    buildMealSelectedRestaurant = "";
    buildMealSubmitBtn.disabled = true;
    buildMealGrid.innerHTML = "";
    buildMealTargetSummary.innerHTML = "";
    setBuildMealState("empty");
    buildMealEmpty.innerHTML = "Choose a restaurant to start building your meal.";
    }

    function handleBuildMealSubmit(event) {
    event.preventDefault();
    generateBuildMeal();
    }

    function generateBuildMeal() {
    // A restaurant must be selected before a meal can be generated — this
    // is enforced here regardless of what the select element currently
    // shows, so the meal builder can never run against "all" restaurants.
    if (!buildMealSelectedRestaurant) {
        setBuildMealState("error");
        buildMealError.textContent = "Choose a restaurant before building your meal.";
        return;
    }

    const mealType = buildMealTypeSelect.value;
    if (!mealType) {
        setBuildMealState("error");
        buildMealError.textContent = "Choose a meal type before generating a meal.";
        return;
    }

    fetchBuildMeal({
        restaurant: buildMealSelectedRestaurant,
        meal_type: mealType,
        exclude: recentCombosFor(buildMealSelectedRestaurant, mealType),
    });
    }

    async function fetchBuildMeal(payload) {
    // Defense in depth: never let a request reach the server without a
    // specific, non-"all" restaurant attached to it.
    if (!payload.restaurant || payload.restaurant.toLowerCase() === "all") {
        setBuildMealState("error");
        buildMealError.textContent = "Choose a restaurant before building your meal.";
        return;
    }

    setBuildMealState("loading");
    buildMealSubmitBtn.disabled = true;

    try {
        const res = await fetch(`${API_BASE}/build-meal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        });

        if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
        }

        const data = await res.json();
        renderBuildMealResult(data);
    } catch (err) {
        console.error("Build My Meal request failed:", err);
        buildMealError.textContent = "Couldn't reach the server. Is the Flask backend running?";
        setBuildMealState("error");
    } finally {
        buildMealSubmitBtn.disabled = false;
    }
    }

    // The `restaurant` property on each menu item is the source of truth.
    // Even if the underlying data or state changed unexpectedly, this
    // rejects any item that doesn't belong to the currently selected
    // restaurant before it could ever be displayed or added to the meal.
    // Restaurant is never inferred from name/category/image/id.
    function validateMealRestaurant(meal, restaurant) {
    if (!meal || !Array.isArray(meal.items) || meal.items.length === 0) return false;
    return meal.items.every((item) => item.restaurant === restaurant);
    }

    function renderBuildMealResult(data) {
    const { restaurant, meal_type: mealType, meal_type_label: mealTypeLabel, was_surprise: wasSurprise, meal } = data;

    if (!meal || !validateMealRestaurant(meal, restaurant)) {
        setBuildMealState("empty");
        renderEmptyState(buildMealEmpty, {
        title: "No meal combination found",
        message: "Try a different meal type for this restaurant.",
        showClear: true,
        onClear: resetBuildMealForm,
        });
        return;
    }

    // Keep this combination in the session's recent history so the next
    // "Generate Meal" click for this restaurant + meal type tends to
    // avoid repeating it.
    rememberCombo(restaurant, mealType, meal.items.map((item) => item.id));

    buildMealTargetSummary.innerHTML = `
        <span class="target-chip">${escapeHtml(restaurant)}</span>
        <span class="target-chip">Meal Type: ${escapeHtml(mealTypeLabel)}</span>
        ${wasSurprise ? '<span class="target-chip">Surprise Me</span>' : ""}
    `;

    buildMealGrid.innerHTML = "";
    buildMealGrid.appendChild(buildMealCard(meal));

    setBuildMealState("content");
    }

    function buildMealCard(meal) {
    const card = document.createElement("article");
    card.className = "meal-card";

    const itemsMarkup = meal.items
        .map((item) => {
        const thumb = item.image
            ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.parentElement.innerHTML=''">`
            : "";
        return `
            <div class="meal-item-row">
            <div class="meal-item-thumb">${thumb}</div>
            <span class="meal-item-name">${escapeHtml(item.name)}</span>
            </div>
        `;
        })
        .join("");

    const carbs = meal.totals.carbs_g != null ? `${meal.totals.carbs_g}g carbs` : "";
    const fat = meal.totals.fat_g != null ? `${meal.totals.fat_g}g fat` : "";

    card.innerHTML = `
        <div class="meal-card-header">
        <span class="meal-name">${escapeHtml(meal.name)}</span>
        </div>
        <div class="meal-item-list">${itemsMarkup}</div>
        <div class="meal-macro-row">
        <span><strong>${meal.totals.calories}</strong> kcal</span>
        <span><strong>${meal.totals.protein_g}g</strong> protein</span>
        ${carbs ? `<span><strong>${carbs}</strong></span>` : ""}
        ${fat ? `<span><strong>${fat}</strong></span>` : ""}
        </div>
    `;
    return card;
    }

    function setBuildMealState(state) {
    buildMealEmpty.hidden = state !== "empty";
    buildMealLoading.hidden = state !== "loading";
    buildMealError.hidden = state !== "error";
    buildMealContent.hidden = state !== "content";
    if (state === "loading") {
        buildMealLoading.innerHTML = buildSkeletonGrid(1);
    }
    }