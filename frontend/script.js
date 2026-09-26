const API_BASE = "https://macro-aware-picks-backend.onrender.com/api";

    // ---- Shared element references -------------------------------------------------

    const matchForm = document.getElementById("match-form");
    const caloriesInput = document.getElementById("calories");
    const proteinInput = document.getElementById("protein");
    const restaurantSelect = document.getElementById("restaurant");
    const categorySelect = document.getElementById("category-select");
    const submitBtn = document.getElementById("submit-btn");

    const searchInput = document.getElementById("search-input");
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
    const targetCarbs = document.getElementById("target-carbs");
    const targetFat = document.getElementById("target-fat");
    const quickFilterGroup = document.getElementById("quick-filter-group");
    const dietFilterGroup = document.getElementById("diet-filter-group");
    const sortSelect = document.getElementById("sort-select");
    const sortRow = document.getElementById("sort-row");
    const clearFiltersBtn = document.getElementById("clear-filters-btn");

    const modeGroup = document.getElementById("match-mode-group");
    const modeSingleBtn = document.getElementById("mode-single-btn");
    const modeMealBtn = document.getElementById("mode-meal-btn");

    const resultsEmpty = document.getElementById("results-empty");
    const resultsLoading = document.getElementById("results-loading");
    const resultsError = document.getElementById("results-error");
    const resultsContent = document.getElementById("results-content");
    const resultsHeading = document.getElementById("results-heading");
    const resultsCount = document.getElementById("results-count");
    const targetSummary = document.getElementById("target-summary");
    const resultsGrid = document.getElementById("results-grid");
    const mealResultsGrid = document.getElementById("meal-results-grid");

    const DIET_FILTER_LABELS = {
    vegetarian: "Vegetarian",
    spicy: "Spicy",
    chicken: "Chicken",
    beef: "Beef",
    pork: "Pork",
    lamb: "Lamb",
    };

    let currentMode = "single"; // "single" | "meal"
    let activeQuickFilter = null;
    let activeDietFilters = new Set();

    // ---- Image presentation (unchanged) ----------------------------------------------

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

    // ---- Shared formatting / small helpers (unchanged) --------------------------------

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

    function setResultsState(state, skeletonCount) {
    resultsEmpty.hidden = state !== "empty";
    resultsLoading.hidden = state !== "loading";
    resultsError.hidden = state !== "error";
    resultsContent.hidden = state !== "content";
    if (state === "loading") {
        resultsLoading.innerHTML = buildSkeletonGrid(skeletonCount || 6);
    }
    }

    // ---- Reusable "populate a <select> from an API endpoint" (used by both restaurant
    // and category dropdowns; previously duplicated three times across the old
    // Macro Match / Advanced Search / Build My Meal tabs) --------------------------------

    async function populateSelectOptions(selectEl, endpoint, allLabel) {
    try {
        const res = await fetch(`${API_BASE}/${endpoint}`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const items = await res.json();

        selectEl.innerHTML = "";
        if (items.length === 0) {
        selectEl.innerHTML = `<option value="" disabled selected>No options available</option>`;
        return;
        }

        const allOption = document.createElement("option");
        allOption.value = "all";
        allOption.textContent = allLabel;
        allOption.selected = true;
        selectEl.appendChild(allOption);

        items.forEach((value) => {
        const opt = document.createElement("option");
        opt.value = value;
        opt.textContent = endpoint === "categories" ? formatCategory(value) : value;
        selectEl.appendChild(opt);
        });
    } catch (err) {
        selectEl.innerHTML = `<option value="" disabled selected>Couldn't load options</option>`;
        console.error(`Failed to load ${endpoint}:`, err);
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

    // ---- Mode toggle: single-item Macro Match vs Build a Meal --------------------------

    function setMode(mode) {
    currentMode = mode;
    modeSingleBtn.classList.toggle("is-active", mode === "single");
    modeMealBtn.classList.toggle("is-active", mode === "meal");
    // .search-footer-row sets its own `display: flex` in style.css, which (being an
    // author-stylesheet class rule) wins over the `hidden` attribute's UA-stylesheet
    // `display: none`, so toggling `.hidden` alone would not actually hide this row.
    // Setting inline `style.display` takes precedence over both and reliably hides it.
    sortRow.style.display = mode === "meal" ? "none" : "";
    submitBtn.textContent = mode === "meal" ? "Build my meal" : "Find my match";
    }

    modeSingleBtn.addEventListener("click", () => setMode("single"));
    modeMealBtn.addEventListener("click", () => setMode("meal"));

    // ---- Filter control listeners (Advanced Search controls just update state;
    // fetching happens on form submit via the Find My Match / Build My Meal button) -----

    function attachFilterListeners() {
    quickFilterGroup.addEventListener("click", (event) => {
        const btn = event.target.closest(".quick-filter-btn");
        if (!btn) return;
        const isAlreadyActive = btn.classList.contains("is-active");
        quickFilterGroup.querySelectorAll(".quick-filter-btn").forEach((b) => b.classList.remove("is-active"));
        activeQuickFilter = isAlreadyActive ? null : btn.dataset.quick;
        if (!isAlreadyActive) btn.classList.add("is-active");
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
    });

    sortSelect.addEventListener("change", () => {
        // Re-run automatically if results are already on screen, so re-sorting
        // doesn't require a full resubmit.
        if (currentMode === "single" && !resultsContent.hidden) {
        runSingleSearch();
        }
    });

    clearFiltersBtn.addEventListener("click", () => {
        searchInput.value = "";
        if (restaurantSelect.querySelector('option[value="all"]')) restaurantSelect.value = "all";
        if (categorySelect.querySelector('option[value="all"]')) categorySelect.value = "all";
        [
        minCalories, maxCalories, minProtein, maxProtein, minCarbs, maxCarbs, minFat, maxFat,
        minPrice, maxPrice, targetCarbs, targetFat,
        ].forEach((el) => (el.value = ""));
        sortSelect.value = "macro_match";
        activeQuickFilter = null;
        activeDietFilters.clear();
        quickFilterGroup.querySelectorAll(".quick-filter-btn").forEach((b) => b.classList.remove("is-active"));
        dietFilterGroup.querySelectorAll(".quick-filter-btn").forEach((b) => b.classList.remove("is-active"));
    });
    }

    // ---- Single-item search (Macro Match + Advanced Search merged; calls /api/search,
    // using the top-level Calories/Protein fields as target_calories/target_protein) -----

    function buildSearchParams() {
    const params = new URLSearchParams();

    if (searchInput.value.trim()) params.set("search", searchInput.value.trim());
    if (restaurantSelect.value && restaurantSelect.value !== "all") {
        params.set("restaurant", restaurantSelect.value);
    }
    if (categorySelect.value && categorySelect.value !== "all") {
        params.set("category", categorySelect.value);
    }

    if (caloriesInput.value !== "") params.set("target_calories", caloriesInput.value);
    if (proteinInput.value !== "") params.set("target_protein", proteinInput.value);

    const numericFields = [
        ["min_calories", minCalories], ["max_calories", maxCalories],
        ["min_protein", minProtein], ["max_protein", maxProtein],
        ["min_carbs", minCarbs], ["max_carbs", maxCarbs],
        ["min_fat", minFat], ["max_fat", maxFat],
        ["min_price", minPrice], ["max_price", maxPrice],
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

    async function runSingleSearch() {
    setResultsState("loading", 6);
    submitBtn.disabled = true;
    const params = buildSearchParams();

    try {
        const res = await fetch(`${API_BASE}/search?${params.toString()}`);
        if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error || `Server returned ${res.status}`);
        }
        const data = await res.json();
        renderSingleResults(data);
    } catch (err) {
        console.error("Search request failed:", err);
        resultsError.textContent = "Couldn't reach the server. Is the Flask backend running?";
        setResultsState("error");
    } finally {
        submitBtn.disabled = false;
    }
    }

    function renderSingleResults(data) {
    const results = data.results || [];

    if (results.length === 0) {
        setResultsState("empty");
        renderEmptyState(resultsEmpty, {
        title: "No matches found",
        message: "Try adjusting your calorie, protein, or other filters.",
        showClear: true,
        onClear: () => {
            clearFiltersBtn.click();
            runSingleSearch();
        },
        });
        return;
    }

    resultsHeading.textContent = "Options mapped to your goals";

    const chips = [];
    if (caloriesInput.value !== "") chips.push(`<span class="target-chip">${escapeHtml(caloriesInput.value)} kcal</span>`);
    if (proteinInput.value !== "") chips.push(`<span class="target-chip">${escapeHtml(proteinInput.value)}g protein</span>`);
    targetSummary.innerHTML = chips.join("");

    resultsCount.hidden = false;
    resultsCount.textContent = `Showing ${data.returned} of ${data.count} result${data.count === 1 ? "" : "s"}`;

    // .results-grid / .meal-results-grid also set their own `display` in style.css,
    // so (as with sort-row above) we toggle inline style.display, not `.hidden`.
    resultsGrid.style.display = "";
    mealResultsGrid.style.display = "none";
    resultsGrid.innerHTML = "";
    results.forEach((item) => resultsGrid.appendChild(buildResultCard(item)));

    setResultsState("content");
    }

    function buildResultCard(item) {
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

    // ---- Build a Meal (unchanged logic, calls /api/build-meal; reuses the shared
    // restaurant/category selects and reuses the Max price field as the budget cap) -----

    function validateMealRestaurant(meal, restaurant) {
    if (!meal || !Array.isArray(meal.items) || meal.items.length === 0) return false;
    if (!restaurant || restaurant.toLowerCase() === "all") return true;
    return meal.items.every((item) => item.restaurant === restaurant);
    }

    async function runBuildMeal() {
    const calories = Number(caloriesInput.value);
    const protein = Number(proteinInput.value);
    const restaurant = restaurantSelect.value || "all";
    const category = categorySelect.value || "all";

    if (Number.isNaN(calories) || Number.isNaN(protein) || calories <= 0 || protein <= 0) {
        setResultsState("error");
        resultsError.textContent = "Enter valid calorie and protein numbers.";
        return;
    }

    let maxBudget = null;
    if (maxPrice.value.trim() !== "") {
        const parsedBudget = Number(maxPrice.value);
        if (Number.isNaN(parsedBudget) || parsedBudget <= 0) {
        setResultsState("error");
        resultsError.textContent = "Max price must be a number greater than zero to use it as a meal budget.";
        return;
        }
        maxBudget = parsedBudget;
    }

    const payload = { restaurant, calories, protein, category, max_price: maxBudget };

    setResultsState("loading", 1);
    submitBtn.disabled = true;

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
        resultsError.textContent = "Couldn't reach the server. Is the Flask backend running?";
        setResultsState("error");
    } finally {
        submitBtn.disabled = false;
    }
    }

    function renderBuildMealResult(data, payload) {
    const meals = data.meals || [];
    const validMeals = meals.filter((meal) => validateMealRestaurant(meal, payload.restaurant));

    if (validMeals.length === 0) {
        setResultsState("empty");
        renderEmptyState(resultsEmpty, {
        title: "No meal combination found",
        message: payload.max_price
            ? "Try raising your budget (Max price), or adjusting your calorie/protein targets."
            : "Try adjusting your calorie, protein, restaurant, or category filters.",
        showClear: true,
        onClear: () => {
            clearFiltersBtn.click();
            setResultsState("empty");
            renderEmptyState(resultsEmpty, {
            title: "Set your targets",
            message: "Enter your targets and pick a restaurant to build your meal.",
            showClear: false,
            });
        },
        });
        return;
    }

    resultsHeading.textContent = "Meal combinations";
    resultsCount.hidden = true;

    const restaurantLabel = payload.restaurant && payload.restaurant.toLowerCase() !== "all"
        ? payload.restaurant
        : "All restaurants";

    targetSummary.innerHTML = `
        <span class="target-chip">${escapeHtml(restaurantLabel)}</span>
        <span class="target-chip">${payload.calories} kcal</span>
        <span class="target-chip">${payload.protein}g protein</span>
        ${payload.max_price ? `<span class="target-chip">Budget: ${escapeHtml(formatPrice(payload.max_price))}</span>` : ""}
    `;

    resultsGrid.style.display = "none";
    mealResultsGrid.style.display = "";
    mealResultsGrid.innerHTML = "";
    validMeals.forEach((meal) => mealResultsGrid.appendChild(buildMealCard(meal)));

    setResultsState("content");
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

    // ---- Form submit: routes to the right flow based on the Mode toggle ----------------

    matchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    if (currentMode === "meal") {
        runBuildMeal();
        return;
    }

    const calories = Number(caloriesInput.value);
    const protein = Number(proteinInput.value);
    if (Number.isNaN(calories) || Number.isNaN(protein) || calories < 0 || protein < 0) {
        setResultsState("error");
        resultsError.textContent = "Enter valid calorie and protein numbers.";
        return;
    }

    runSingleSearch();
    });

    // ---- Init ---------------------------------------------------------------------------

    async function init() {
    setResultsState("empty");
    await Promise.all([
        populateSelectOptions(restaurantSelect, "restaurants", "All restaurants"),
        populateSelectOptions(categorySelect, "categories", "All"),
        populateDietFilters(),
    ]);
    attachFilterListeners();
    }

    init();