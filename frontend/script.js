const API_BASE = "https://macro-aware-picks-backend.onrender.com/api";

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

    let selectedCategory = "all";

    const ITEM_IMAGE_OVERRIDES = {
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
    if (item.image_scale || item.image_position) {
        return {
        scale: item.image_scale || 1.15,
        position: item.image_position || "center center",
        };
    }

    if (ITEM_IMAGE_OVERRIDES[item.id]) {
        return ITEM_IMAGE_OVERRIDES[item.id];
    }

    const category = (item.category || "").toLowerCase();
    const restaurant = (item.restaurant || "").toLowerCase();

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

    return { scale: 1.16, position: "center center" };
    }

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

    categoryGroup.addEventListener("click", (event) => {
    const btn = event.target.closest(".category-btn");
    if (!btn) return;

    categoryGroup.querySelectorAll(".category-btn").forEach((b) => b.classList.remove("is-active"));
    btn.classList.add("is-active");

    selectedCategory = btn.dataset.category;
    categoryInput.value = selectedCategory;
    });

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
        ${priceTagMarkup(item)}
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


    function formatPrice(value) {
    const num = Number(value);
    if (value === null || value === undefined || !Number.isFinite(num)) return null;
    return `$${num.toFixed(2)}`;
    }

    function priceTagMarkup(item) {
    const formatted = formatPrice(item.price);
    return formatted ? `<span class="price-tag">${escapeHtml(formatted)}</span>` : "";
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

    loadRestaurants();

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
    const minPrice = document.getElementById("min-price");
    const maxPrice = document.getElementById("max-price");
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

    const DIET_FILTER_LABELS = {
    vegetarian: "Vegetarian",
    spicy: "Spicy",
    chicken: "Chicken",
    beef: "Beef",
    pork: "Pork",
    lamb: "Lamb",
    };

    let advancedSearchInitialized = false;
    let activeQuickFilter = null;
    let activeDietFilters = new Set();

    async function initAdvancedSearch() {
    advancedSearchInitialized = true;
    await Promise.all([populateSearchRestaurants(), populateSearchCategories(), populateDietFilters()]);
    attachAdvancedSearchListeners();
    runSearch();
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
        minCarbs, maxCarbs, minFat, maxFat, minPrice, maxPrice,
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

    clearFiltersBtn.addEventListener("click", () => {
        searchInput.value = "";
        searchRestaurantSelect.value = "all";
        searchCategorySelect.value = "all";
        [
        minCalories, maxCalories, minProtein, maxProtein, minCarbs, maxCarbs, minFat, maxFat,
        minPrice, maxPrice, targetCalories, targetProtein, targetCarbs, targetFat,
        ].forEach((el) => (el.value = ""));
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
        ["min_price", minPrice], ["max_price", maxPrice],
        ["target_calories", targetCalories], ["target_protein", targetProtein],
        ["target_carbs", targetCarbs], ["target_fat", targetFat],
    ];
    numericFields.forEach(([key, el]) => {
        if (el.value !== "") params.set(key, el.value);
    });

    if (activeQuickFilter) params.set("quick", activeQuickFilter);
    if (activeDietFilters.size > 0) params.set("diet", Array.from(activeDietFilters).join(","));
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
        ${priceTagMarkup(item)}
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


    const buildMealForm = document.getElementById("build-meal-form");
    const buildMealRestaurantSelect = document.getElementById("build-meal-restaurant");
    const buildMealCaloriesInput = document.getElementById("build-meal-calories");
    const buildMealProteinInput = document.getElementById("build-meal-protein");
    const buildMealCategorySelect = document.getElementById("build-meal-category");
    const buildMealBudgetInput = document.getElementById("build-meal-budget");
    const buildMealSubmitBtn = document.getElementById("build-meal-submit-btn");

    const buildMealEmpty = document.getElementById("build-meal-empty");
    const buildMealLoading = document.getElementById("build-meal-loading");
    const buildMealError = document.getElementById("build-meal-error");
    const buildMealContent = document.getElementById("build-meal-content");
    const buildMealTargetSummary = document.getElementById("build-meal-target-summary");
    const buildMealGrid = document.getElementById("build-meal-grid");

    let buildMealInitialized = false;

    async function initBuildMeal() {
    buildMealInitialized = true;
    await Promise.all([populateBuildMealRestaurants(), populateBuildMealCategories()]);
    buildMealForm.addEventListener("submit", handleBuildMealSubmit);
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

        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = "All restaurants";
        allOption.selected = true;
        buildMealRestaurantSelect.appendChild(allOption);

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

    async function populateBuildMealCategories() {
    try {
        const res = await fetch(`${API_BASE}/categories`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const categories = await res.json();
        categories.forEach((cat) => {
        const opt = document.createElement("option");
        opt.value = cat;
        opt.textContent = formatCategory(cat);
        buildMealCategorySelect.appendChild(opt);
        });
    } catch (err) {
        console.error("Failed to load categories for Build My Meal:", err);
    }
    }

    function handleBuildMealSubmit(event) {
    event.preventDefault();

    const calories = Number(buildMealCaloriesInput.value);
    const protein = Number(buildMealProteinInput.value);
    const restaurant = buildMealRestaurantSelect.value || "all";
    const category = buildMealCategorySelect.value || "all";

    if (Number.isNaN(calories) || Number.isNaN(protein) || calories <= 0 || protein <= 0) {
        setBuildMealState("error");
        buildMealError.textContent = "Enter valid calorie and protein numbers.";
        return;
    }

    let maxPrice = null;
    if (buildMealBudgetInput.value.trim() !== "") {
        const parsedBudget = Number(buildMealBudgetInput.value);
        if (Number.isNaN(parsedBudget) || parsedBudget <= 0) {
        setBuildMealState("error");
        buildMealError.textContent = "Max budget must be a number greater than zero.";
        return;
        }
        maxPrice = parsedBudget;
    }

    fetchBuildMeal({ restaurant, calories, protein, category, max_price: maxPrice });
    }

    async function fetchBuildMeal(payload) {
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
        renderBuildMealResult(data, payload);
    } catch (err) {
        console.error("Build My Meal request failed:", err);
        buildMealError.textContent = "Couldn't reach the server. Is the Flask backend running?";
        setBuildMealState("error");
    } finally {
        buildMealSubmitBtn.disabled = false;
    }
    }

    function validateMealRestaurant(meal, restaurant) {
    if (!meal || !Array.isArray(meal.items) || meal.items.length === 0) return false;
    if (!restaurant || restaurant.toLowerCase() === "all") return true;
    return meal.items.every((item) => item.restaurant === restaurant);
    }

    function renderBuildMealResult(data, payload) {
    const meals = data.meals || [];
    const validMeals = meals.filter((meal) => validateMealRestaurant(meal, payload.restaurant));

    if (validMeals.length === 0) {
        setBuildMealState("empty");
        renderEmptyState(buildMealEmpty, {
        title: "No meal combination found",
        message: payload.max_price
            ? "Try raising your budget, or adjusting your calorie/protein targets."
            : "Try adjusting your calorie, protein, restaurant, or category filters.",
        showClear: true,
        onClear: resetBuildMealForm,
        });
        return;
    }

    const restaurantLabel = payload.restaurant && payload.restaurant.toLowerCase() !== "all"
        ? payload.restaurant
        : "All restaurants";

    buildMealTargetSummary.innerHTML = `
        <span class="target-chip">${escapeHtml(restaurantLabel)}</span>
        <span class="target-chip">${payload.calories} kcal</span>
        <span class="target-chip">${payload.protein}g protein</span>
        ${payload.max_price ? `<span class="target-chip">Budget: ${escapeHtml(formatPrice(payload.max_price))}</span>` : ""}
    `;

    buildMealGrid.innerHTML = "";
    validMeals.forEach((meal) => buildMealGrid.appendChild(buildMealCard(meal)));

    setBuildMealState("content");
    }

    function buildMealCard(meal) {
    const card = document.createElement("article");
    card.className = "meal-card" + (meal.is_best ? " is-best" : "");

    const itemsMarkup = meal.items
        .map((item) => {
        const thumb = item.image
            ? `<img src="${escapeHtml(item.image)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.parentElement.innerHTML=''">`
            : "";
        const price = formatPrice(item.price);
        return `
            <div class="meal-item-row">
            <div class="meal-item-thumb">${thumb}</div>
            <span class="meal-item-name">${escapeHtml(item.name)}</span>
            ${price ? `<span class="meal-item-price">${escapeHtml(price)}</span>` : ""}
            </div>
        `;
        })
        .join("");

    const carbs = meal.totals.carbs_g != null ? `${meal.totals.carbs_g}g carbs` : "";
    const fat = meal.totals.fat_g != null ? `${meal.totals.fat_g}g fat` : "";
    const totalPrice = formatPrice(meal.totals.price);

    card.innerHTML = `
        <div class="meal-card-header">
        <span class="meal-name">${escapeHtml(meal.name)}</span>
        ${meal.is_best ? '<span class="best-tag">Best match</span>' : ""}
        </div>
        <div class="meal-item-list">${itemsMarkup}</div>
        <div class="meal-macro-row">
        <span><strong>${meal.totals.calories}</strong> kcal</span>
        <span><strong>${meal.totals.protein_g}g</strong> protein</span>
        ${carbs ? `<span><strong>${carbs}</strong></span>` : ""}
        ${fat ? `<span><strong>${fat}</strong></span>` : ""}
        ${totalPrice ? `<span><strong>${totalPrice}</strong> total</span>` : ""}
        </div>
    `;
    return card;
    }

    function resetBuildMealForm() {
    buildMealCaloriesInput.value = "";
    buildMealProteinInput.value = "";
    buildMealBudgetInput.value = "";
    if (buildMealRestaurantSelect.querySelector('option[value="all"]')) {
        buildMealRestaurantSelect.value = "all";
    }
    if (buildMealCategorySelect.querySelector('option[value="all"]')) {
        buildMealCategorySelect.value = "all";
    }
    buildMealGrid.innerHTML = "";
    buildMealTargetSummary.innerHTML = "";
    setBuildMealState("empty");
    buildMealEmpty.innerHTML = "Enter your targets and pick a restaurant to build your meal.";
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