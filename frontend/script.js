const API_BASE = "https://macro-aware-picks-backend.onrender.com/api";

    // ---- Shared element references -------------------------------------------------

    const matchForm = document.getElementById("match-form");
    const caloriesInput = document.getElementById("calories");
    const proteinInput = document.getElementById("protein");
    const restaurantSelect = document.getElementById("restaurant");
    const budgetInput = document.getElementById("budget-input");
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
    const clearFiltersBtn = document.getElementById("clear-filters-btn");

    const resultsEmpty = document.getElementById("results-empty");
    const resultsLoading = document.getElementById("results-loading");
    const resultsError = document.getElementById("results-error");
    const resultsContent = document.getElementById("results-content");
    const resultsHeading = document.getElementById("results-heading");
    const resultsCount = document.getElementById("results-count");
    const targetSummary = document.getElementById("target-summary");
    const resultsGrid = document.getElementById("results-grid");

    const DIET_FILTER_LABELS = {
    vegetarian: "Vegetarian",
    spicy: "Spicy",
    chicken: "Chicken",
    beef: "Beef",
    pork: "Pork",
    lamb: "Lamb",
    };

    let activeQuickFilter = null;
    let activeDietFilters = new Set();

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
        return { scale: 1, position: "center bottom" };
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
    // Macro Match / Advanced Search tabs) ----------------------------------------------

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

    // ---- Filter control listeners (Advanced Search controls just update state;
    // fetching happens on form submit via the Find My Match button) --------------------

    function attachFilterListeners() {
    // The top-level Budget field and the Advanced Search "Max price" field both
    // represent the same underlying budget cap, so keep them mirrored.
    budgetInput.addEventListener("input", () => {
        maxPrice.value = budgetInput.value;
    });
    maxPrice.addEventListener("input", () => {
        budgetInput.value = maxPrice.value;
    });

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

    clearFiltersBtn.addEventListener("click", () => {
        searchInput.value = "";
        if (restaurantSelect.querySelector('option[value="all"]')) restaurantSelect.value = "all";
        if (categorySelect.querySelector('option[value="all"]')) categorySelect.value = "all";
        [
        minCalories, maxCalories, minProtein, maxProtein, minCarbs, maxCarbs, minFat, maxFat,
        minPrice, maxPrice, budgetInput, targetCarbs, targetFat,
        ].forEach((el) => (el.value = ""));
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

    // No sort parameter is sent: the backend always ranks by macro match
    // score, highest first, across both individual items and bundles.

    return params;
    }

    async function runMacroMatch() {
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
        renderResults(data);
    } catch (err) {
        console.error("Search request failed:", err);
        resultsError.textContent = "Couldn't reach the server. Is the Flask backend running?";
        setResultsState("error");
    } finally {
        submitBtn.disabled = false;
    }
    }

    function renderResults(data) {
    const results = data.results || [];

    if (results.length === 0) {
        setResultsState("empty");
        renderEmptyState(resultsEmpty, {
        title: "No matches found",
        message: "Try adjusting your calorie, protein, or other filters.",
        showClear: true,
        onClear: () => {
            clearFiltersBtn.click();
            runMacroMatch();
        },
        });
        return;
    }

    resultsHeading.textContent = "Best picks for your goals";

    const chips = [];
    if (caloriesInput.value !== "") chips.push(`<span class="target-chip">${escapeHtml(caloriesInput.value)} kcal</span>`);
    if (proteinInput.value !== "") chips.push(`<span class="target-chip">${escapeHtml(proteinInput.value)}g protein</span>`);
    targetSummary.innerHTML = chips.join("");

    resultsCount.hidden = false;
    resultsCount.textContent = `Showing ${data.returned} of ${data.count} result${data.count === 1 ? "" : "s"}`;

    // .results-grid sets its own `display` in style.css, which (being an author-
    // stylesheet class rule) wins over the `hidden` attribute's UA-stylesheet
    // `display: none`, so we toggle inline style.display, not `.hidden`.
    resultsGrid.style.display = "";
    resultsGrid.innerHTML = "";
    results.forEach((result) => {
        const card = result.result_type === "bundle" ? buildBundleCard(result) : buildResultCard(result);
        resultsGrid.appendChild(card);
    });

    setResultsState("content");
    }

    function buildResultCard(item) {
    const card = document.createElement("article");
    card.className = "result-card";

    const { scale, position } = getImagePresentation(item);
    const styleString = `--img-scale: ${scale}; --img-pos: ${position};`;

    const isMcDonalds =
    item.restaurant &&
    item.restaurant.toLowerCase().replace(/[^a-z]/g, "") === "mcdonalds";

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
    `;
    return card;
    }

    // ---- Meal bundle card: 2-3 item combinations the backend suggests automatically
    // as part of the normal Macro Match response, rendered inline alongside individual
    // item cards in the same results grid. It reuses the normal .result-card structure
    // and styling so it reads as another recommendation from the same ranking system,
    // not a separate feature — the bundle's title is simply its component item names. --

    function buildBundleCard(bundle) {
    const card = document.createElement("article");
    card.className = "result-card";
    card.dataset.resultType = "bundle";

    const bundleItems = bundle.items || [];
    const primaryItem = bundleItems.find((item) => item.image) || bundleItems[0] || {};
    const { scale, position } = getImagePresentation(primaryItem);
    const styleString = `--img-scale: ${scale}; --img-pos: ${position};`;

    const imageMarkup = primaryItem.image
        ? `<div class="food-card-image-container" style="${styleString}">
            <img class="food-card-image" src="${escapeHtml(primaryItem.image)}" alt="${escapeHtml(bundleItems.map((i) => i.name).join(" + "))}" loading="lazy" onerror="this.parentElement.innerHTML='<div class=\\'food-card-placeholder\\'>No image available</div>'">
        </div>`
        : `<div class="food-card-image-container">
            <div class="food-card-placeholder">No image available</div>
        </div>`;

    const bundleName = bundleItems.map((item) => item.name).join(" + ");

    const scoreBadge = bundle.macro_match_score !== undefined
        ? `<span class="match-badge">${bundle.macro_match_score}% match</span>`
        : "";

    const calories = bundle.calories != null ? `${bundle.calories} kcal` : "—";
    const protein = bundle.protein_g != null ? `${bundle.protein_g}g` : "—";
    const carbs = bundle.carbs_g != null ? `${bundle.carbs_g}g` : "—";
    const fat = bundle.fat_g != null ? `${bundle.fat_g}g` : "—";

    card.innerHTML = `
        ${priceTagMarkup(bundle)}
        ${imageMarkup}
        <div class="result-card-header">
        <span class="result-name">${escapeHtml(bundleName)}</span>
        ${scoreBadge}
        </div>
        <p class="result-restaurant">${escapeHtml(bundle.restaurant || "")}</p>
        <dl class="macro-list">
        <span>Calories</span><strong>${calories}</strong>
        <span>Protein</span><strong>${protein}</strong>
        <span>Carbs</span><strong>${carbs}</strong>
        <span>Fat</span><strong>${fat}</strong>
        </dl>
        <span class="category-chip">Suggested bundle</span>
    `;
    return card;
    }

    // ---- Form submit: one Macro Match request; the backend decides whether to mix in
    // any meal bundles alongside individual items -------------------------------------

    matchForm.addEventListener("submit", (event) => {
    event.preventDefault();

    const calories = Number(caloriesInput.value);
    const protein = Number(proteinInput.value);
    if (Number.isNaN(calories) || Number.isNaN(protein) || calories < 0 || protein < 0) {
        setResultsState("error");
        resultsError.textContent = "Enter valid calorie and protein numbers.";
        return;
    }

    runMacroMatch();
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