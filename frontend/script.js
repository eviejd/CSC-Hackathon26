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
const allergenFilterGroup = document.getElementById("allergen-filter-group");
const strictAllergensToggle = document.getElementById("strict-allergens-toggle");
const clearFiltersBtn = document.getElementById("clear-filters-btn");

const resultsEmpty = document.getElementById("results-empty");
const resultsLoading = document.getElementById("results-loading");
const resultsError = document.getElementById("results-error");
const resultsContent = document.getElementById("results-content");
const resultsHeading = document.getElementById("results-heading");
const resultsCount = document.getElementById("results-count");
const targetSummary = document.getElementById("target-summary");
const resultsGrid = document.getElementById("results-grid");

const showGraphBtn = document.getElementById("show-graph-btn");
const graphView = document.getElementById("graph-view");
const graphBackBtn = document.getElementById("graph-back-btn");
const graphResetBtn = document.getElementById("graph-reset-btn");
const graphEmpty = document.getElementById("graph-empty");
const graphLoading = document.getElementById("graph-loading");
const graphLegend = document.getElementById("graph-legend");
const graphContainer = document.getElementById("graph-container");

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
let activeAllergenFilters = new Set();

let lastGraphData = null;
let removedNodeIds = new Set();


// ---- Image presentation --------------------------------------------------------

// Keep this object available so existing item-specific image settings
// can be added later without changing the rest of the code.
const ITEM_IMAGE_OVERRIDES = {};

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

    // KFC
    if (restaurant.includes("kfc")) {
        if (category === "burger") {
            return {
                scale: 1.30,
                position: "center 65%",
            };
        }

        if (category === "chicken") {
            return {
                scale: 1.22,
                position: "center 56%",
            };
        }

        return {
            scale: 1.20,
            position: "center 58%",
        };
    }

    // McDonald's
    // The dedicated .mcdonalds-image CSS class handles the crop.
    if (restaurant.includes("mcdonald")) {
        return {
            scale: 1,
            position: "center bottom",
        };
    }

    return {
        scale: 1.16,
        position: "center center",
    };
}


// ---- Shared formatting / small helpers -----------------------------------------

function formatCategory(category) {
    return String(category)
        .split("-")
        .map(
            word =>
                word.charAt(0).toUpperCase() +
                word.slice(1)
        )
        .join(" ");
}

function formatPrice(value) {
    const num = Number(value);

    if (
        value === null ||
        value === undefined ||
        !Number.isFinite(num)
    ) {
        return null;
    }

    return `$${num.toFixed(2)}`;
}

function priceTagMarkup(item) {
    const formatted = formatPrice(item.price);

    return formatted
        ? `<span class="price-tag">${escapeHtml(formatted)}</span>`
        : "";
}

function escapeHtml(str) {
    const div = document.createElement("div");

    div.textContent =
        str === null || str === undefined
            ? ""
            : String(str);

    return div.innerHTML;
}


// ---- Loading / empty states -----------------------------------------------------

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
    return `
        <div class="skeleton-grid">
            ${Array.from(
                { length: count },
                buildSkeletonCard
            ).join("")}
        </div>
    `;
}

function renderEmptyState(container, options) {
    const {
        title,
        message,
        showClear,
        onClear,
    } = options;

    container.innerHTML = `
        <div class="empty-state">
            <p class="empty-state-title">
                ${escapeHtml(title)}
            </p>

            <p class="empty-state-message">
                ${escapeHtml(message)}
            </p>

            ${
                showClear
                    ? `
                        <button
                            type="button"
                            class="clear-btn empty-state-clear"
                        >
                            Clear Filters
                        </button>
                    `
                    : ""
            }
        </div>
    `;

    if (
        showClear &&
        typeof onClear === "function"
    ) {
        const clearButton =
            container.querySelector(
                ".empty-state-clear"
            );

        if (clearButton) {
            clearButton.addEventListener(
                "click",
                onClear
            );
        }
    }
}

function setResultsState(state, skeletonCount) {
    graphView.hidden = true;

    resultsEmpty.hidden =
        state !== "empty";

    resultsLoading.hidden =
        state !== "loading";

    resultsError.hidden =
        state !== "error";

    resultsContent.hidden =
        state !== "content";

    if (state === "loading") {
        resultsLoading.innerHTML =
            buildSkeletonGrid(
                skeletonCount || 6
            );
    }
}


// ---- API select population ------------------------------------------------------

async function populateSelectOptions(
    selectEl,
    endpoint,
    allLabel
) {
    try {
        const res = await fetch(
            `${API_BASE}/${endpoint}`
        );

        if (!res.ok) {
            throw new Error(
                `Server returned ${res.status}`
            );
        }

        const items = await res.json();

        selectEl.innerHTML = "";

        if (!Array.isArray(items) || items.length === 0) {
            selectEl.innerHTML =
                `
                <option
                    value=""
                    disabled
                    selected
                >
                    No options available
                </option>
                `;

            return;
        }

        const allOption =
            document.createElement("option");

        allOption.value = "all";
        allOption.textContent = allLabel;
        allOption.selected = true;

        selectEl.appendChild(allOption);

        items.forEach(value => {
            const opt =
                document.createElement("option");

            opt.value = value;

            opt.textContent =
                endpoint === "categories"
                    ? formatCategory(value)
                    : value;

            selectEl.appendChild(opt);
        });
    } catch (err) {
        selectEl.innerHTML =
            `
            <option
                value=""
                disabled
                selected
            >
                Couldn't load options
            </option>
            `;

        console.error(
            `Failed to load ${endpoint}:`,
            err
        );
    }
}

async function populateDietFilters() {
    try {
        const res = await fetch(
            `${API_BASE}/tags`
        );

        if (!res.ok) {
            throw new Error(
                `Server returned ${res.status}`
            );
        }

        const data = await res.json();

        const available =
            data.dietary_filters || [];

        if (available.length === 0) {
            dietFilterGroup.innerHTML =
                `
                <span class="hint-text">
                    No dietary tags available in this menu data.
                </span>
                `;

            return;
        }

        dietFilterGroup.innerHTML = "";

        available.forEach(key => {
            const btn =
                document.createElement("button");

            btn.type = "button";
            btn.className =
                "quick-filter-btn";

            btn.dataset.diet = key;

            btn.textContent =
                DIET_FILTER_LABELS[key] ||
                formatCategory(key);

            dietFilterGroup.appendChild(btn);
        });
    } catch (err) {
        console.error(
            "Failed to load dietary filters:",
            err
        );

        dietFilterGroup.innerHTML =
            `
            <span class="hint-text">
                Couldn't load dietary filters.
            </span>
            `;
    }
}

async function populateAllergenFilters() {
    try {
        const res = await fetch(`${API_BASE}/allergens`);
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const allergens = await res.json();

        if (allergens.length === 0) {
            allergenFilterGroup.innerHTML = `<span class="hint-text">No allergen data available.</span>`;
            return;
        }

        allergenFilterGroup.innerHTML = "";
        allergens.forEach(code => {
            const btn = document.createElement("button");
            btn.type = "button";
            btn.className = "quick-filter-btn";
            btn.dataset.allergen = code;
            btn.textContent = formatCategory(code); // reuses your existing "gluten" -> "Gluten" helper
            allergenFilterGroup.appendChild(btn);
        });
    } catch (err) {
        console.error("Failed to load allergens:", err);
        allergenFilterGroup.innerHTML = `<span class="hint-text">Couldn't load allergen filters.</span>`;
    }
}


// ---- Filter control listeners --------------------------------------------------

function attachFilterListeners() {

    // Budget and Advanced Search max price
    // represent the same value.
    budgetInput.addEventListener(
        "input",
        () => {
            maxPrice.value =
                budgetInput.value;
        }
    );

    maxPrice.addEventListener(
        "input",
        () => {
            budgetInput.value =
                maxPrice.value;
        }
    );


    // Quick filters
    quickFilterGroup.addEventListener(
        "click",
        event => {
            const btn =
                event.target.closest(
                    ".quick-filter-btn"
                );

            if (!btn) return;

            const isAlreadyActive =
                btn.classList.contains(
                    "is-active"
                );

            quickFilterGroup
                .querySelectorAll(
                    ".quick-filter-btn"
                )
                .forEach(b =>
                    b.classList.remove(
                        "is-active"
                    )
                );

            activeQuickFilter =
                isAlreadyActive
                    ? null
                    : btn.dataset.quick;

            if (!isAlreadyActive) {
                btn.classList.add(
                    "is-active"
                );
            }
        }
    );


    // Dietary filters
    dietFilterGroup.addEventListener(
        "click",
        event => {
            const btn =
                event.target.closest(
                    ".quick-filter-btn"
                );

            if (!btn) return;

            const key = btn.dataset.diet;

            if (activeDietFilters.has(key)) {
                activeDietFilters.delete(
                    key
                );

                btn.classList.remove(
                    "is-active"
                );
            } else {
                activeDietFilters.add(
                    key
                );

                btn.classList.add(
                    "is-active"
                );
            }
        }
    );

    allergenFilterGroup.addEventListener("click", event => {
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
    });


    // Clear filters
    clearFiltersBtn.addEventListener(
        "click",
        () => {
            searchInput.value = "";

            if (
                restaurantSelect.querySelector(
                    'option[value="all"]'
                )
            ) {
                restaurantSelect.value =
                    "all";
            }

            if (
                categorySelect.querySelector(
                    'option[value="all"]'
                )
            ) {
                categorySelect.value =
                    "all";
            }

            [
                minCalories,
                maxCalories,
                minProtein,
                maxProtein,
                minCarbs,
                maxCarbs,
                minFat,
                maxFat,
                minPrice,
                maxPrice,
                budgetInput,
                targetCarbs,
                targetFat,
            ].forEach(el => {
                el.value = "";
            });

            activeQuickFilter = null;

            activeDietFilters.clear();

            quickFilterGroup
                .querySelectorAll(
                    ".quick-filter-btn"
                )
                .forEach(b =>
                    b.classList.remove(
                        "is-active"
                    )
                );

            dietFilterGroup
                .querySelectorAll(
                    ".quick-filter-btn"
                )
                .forEach(b =>
                    b.classList.remove(
                        "is-active"
                    )
                );

            activeAllergenFilters.clear();
            strictAllergensToggle.checked = false;
            allergenFilterGroup
                .querySelectorAll(
                    ".quick-filter-btn"
                )
                .forEach(b => 
                    b.classList.remove(
                        "is-active"
                    )
                );
        }
    );
}


// ---- Search --------------------------------------------------------------------

function buildSearchParams() {
    const params =
        new URLSearchParams();

    if (searchInput.value.trim()) {
        params.set(
            "search",
            searchInput.value.trim()
        );
    }

    if (
        restaurantSelect.value &&
        restaurantSelect.value !== "all"
    ) {
        params.set(
            "restaurant",
            restaurantSelect.value
        );
    }

    if (
        categorySelect.value &&
        categorySelect.value !== "all"
    ) {
        params.set(
            "category",
            categorySelect.value
        );
    }

    if (caloriesInput.value !== "") {
        params.set(
            "target_calories",
            caloriesInput.value
        );
    }

    if (proteinInput.value !== "") {
        params.set(
            "target_protein",
            proteinInput.value
        );
    }

    const numericFields = [
        ["min_calories", minCalories],
        ["max_calories", maxCalories],

        ["min_protein", minProtein],
        ["max_protein", maxProtein],

        ["min_carbs", minCarbs],
        ["max_carbs", maxCarbs],

        ["min_fat", minFat],
        ["max_fat", maxFat],

        ["min_price", minPrice],
        ["max_price", maxPrice],

        ["target_carbs", targetCarbs],
        ["target_fat", targetFat],
    ];

    numericFields.forEach(
        ([key, el]) => {
            if (el.value !== "") {
                params.set(
                    key,
                    el.value
                );
            }
        }
    );

    if (activeQuickFilter) {
        params.set(
            "quick",
            activeQuickFilter
        );
    }

    if (activeDietFilters.size > 0) {
        params.set(
            "diet",
            Array.from(
                activeDietFilters
            ).join(",")
        );
    }

    if (activeAllergenFilters.size > 0) {
        params.set("exclude_allergens", Array.from(activeAllergenFilters).join(","));
    }
    if (strictAllergensToggle.checked) {
        params.set("strict_allergens", "true");
    }

    // No sort parameter is sent.
    // The backend handles the result ordering.
    return params;
}


// ---- Search request ------------------------------------------------------------

async function runMacroMatch() {
    setResultsState(
        "loading",
        6
    );

    submitBtn.disabled = true;

    const params =
        buildSearchParams();

    const url =
        `${API_BASE}/search?${params.toString()}`;

    // Log the exact request so we can diagnose
    // any frontend/backend communication issue.
    console.log(
        "Searching:",
        url
    );

    try {
        const res = await fetch(url);

        // Read the response as text first.
        // This lets us see the actual backend response
        // even if it isn't valid JSON.
        const responseText =
            await res.text();

        console.log(
            "API response:",
            res.status,
            responseText
        );

        if (!res.ok) {
            let errorMessage =
                `HTTP ${res.status}`;

            try {
                const body =
                    JSON.parse(
                        responseText
                    );

                if (body.error) {
                    errorMessage =
                        body.error;
                } else if (body.message) {
                    errorMessage =
                        body.message;
                }
            } catch {
                // Response wasn't JSON.
                // Keep the HTTP status and include
                // the response text below.
            }

            if (responseText) {
                errorMessage +=
                    ` — ${responseText}`;
            }

            throw new Error(
                errorMessage
            );
        }

        let data;

        try {
            data =
                JSON.parse(
                    responseText
                );
        } catch (parseError) {
            console.error(
                "Failed to parse API response as JSON:",
                parseError
            );

            throw new Error(
                `The server returned an invalid JSON response: ${responseText}`
            );
        }

        renderResults(data);

    } catch (err) {
        console.error(
            "Search request failed:",
            err
        );

        // IMPORTANT:
        // Don't hide the actual error behind the old
        // "server isn't running" message.
        resultsError.textContent =
            `Request failed: ${
                err.message || err
            }`;

        setResultsState("error");

    } finally {
        submitBtn.disabled = false;
    }
}


// ---- Results rendering ---------------------------------------------------------

function renderResults(data) {
    const results =
        data.results || [];

    if (results.length === 0) {
        setResultsState("empty");

        renderEmptyState(
            resultsEmpty,
            {
                title: "No matches found",

                message:
                    "Try adjusting your calorie, protein, or other filters.",

                showClear: true,

                onClear: () => {
                    clearFiltersBtn.click();
                    runMacroMatch();
                },
            }
        );

        return;
    }

    resultsHeading.textContent =
        "Best picks for your goals";

    const chips = [];

    if (caloriesInput.value !== "") {
        chips.push(
            `
            <span class="target-chip">
                ${escapeHtml(
                    caloriesInput.value
                )} kcal
            </span>
            `
        );
    }

    if (proteinInput.value !== "") {
        chips.push(
            `
            <span class="target-chip">
                ${escapeHtml(
                    proteinInput.value
                )}g protein
            </span>
            `
        );
    }

    targetSummary.innerHTML =
        chips.join("");

    resultsCount.hidden = false;

    resultsCount.textContent =
        `Showing ${data.returned} of ${data.count} result${
            data.count === 1
                ? ""
                : "s"
        }`;

    resultsGrid.style.display = "";

    resultsGrid.innerHTML = "";

    results.forEach(result => {
        const card =
            result.result_type === "bundle"
                ? buildBundleCard(result)
                : buildResultCard(result);

        resultsGrid.appendChild(card);
    });

    setResultsState("content");
}


// ---- Individual result card ----------------------------------------------------

function buildResultCard(item) {
    const card =
        document.createElement("article");

    card.className =
        "result-card";

    const {
        scale,
        position,
    } = getImagePresentation(item);

    const styleString =
        `--img-scale: ${scale}; --img-pos: ${position};`;

    const isMcDonalds =
        item.restaurant &&
        item.restaurant
            .toLowerCase()
            .replace(/[^a-z]/g, "") ===
        "mcdonalds";


    const imageMarkup = item.image
        ? `
            <div
                class="food-card-image-container"
                style="${styleString}"
            >
                <img
                    class="food-card-image${
                        isMcDonalds
                            ? " mcdonalds-image"
                            : ""
                    }"
                    src="${escapeHtml(
                        item.image
                    )}"
                    alt="${escapeHtml(
                        item.name
                    )}"
                    loading="lazy"
                    onerror="this.parentElement.innerHTML='<div class=\\'food-card-placeholder\\'>No image available</div>'"
                >
            </div>
        `
        : `
            <div class="food-card-image-container">
                <div class="food-card-placeholder">
                    No image available
                </div>
            </div>
        `;


    const scoreBadge =
        item.macro_match_score !==
        undefined
            ? `
                <span class="match-badge">
                    ${item.macro_match_score}% match
                </span>
              `
            : "";


    const calories =
        item.calories != null
            ? `${item.calories} kcal`
            : "—";

    const protein =
        item.protein_g != null
            ? `${item.protein_g}g`
            : "—";

    const carbs =
        item.carbs_g != null
            ? `${item.carbs_g}g`
            : "—";

    const fat =
        item.fat_g != null
            ? `${item.fat_g}g`
            : "—";


    const efficiency =
        item.protein_per_100_cal != null
            ? `
                <p class="remaining">
                    ${item.protein_per_100_cal}g protein per 100 kcal
                </p>
              `
            : "";


    card.innerHTML = `
        ${priceTagMarkup(item)}

        ${imageMarkup}

        <div class="result-card-header">
            <span class="result-name">
                ${escapeHtml(
                    item.name
                )}
            </span>

            ${scoreBadge}
        </div>

        <p class="result-restaurant">
            ${escapeHtml(
                item.restaurant
            )}
        </p>

        <dl class="macro-list">
            <span>Calories</span>
            <strong>${calories}</strong>

            <span>Protein</span>
            <strong>${protein}</strong>

            <span>Carbs</span>
            <strong>${carbs}</strong>

            <span>Fat</span>
            <strong>${fat}</strong>
        </dl>

        ${efficiency}
    `;

    return card;
}


// ---- Meal bundle card ----------------------------------------------------------

function buildBundleCard(bundle) {
    const card =
        document.createElement("article");

    card.className =
        "result-card";

    card.dataset.resultType =
        "bundle";

    const bundleItems =
        bundle.items || [];

    const restaurantName =
        bundle.restaurant ||
        (bundleItems[0] && bundleItems[0].restaurant) ||
        "";

    const bundleTitle =
        restaurantName
            ? `${restaurantName} Bundle`
            : "Bundle";

    // Instead of one large hero image, show each component item as a
    // compact thumbnail + name row, using the item images already in
    // the menu data (no separate hard-coded bundle image list).
    const itemListMarkup =
        bundleItems.length
            ? `
                <div class="bundle-item-list">
                    ${bundleItems
                        .map(item => {
                            const thumb =
                                item.image
                                    ? `<img src="${escapeHtml(
                                          item.image
                                      )}" alt="${escapeHtml(
                                          item.name
                                      )}" loading="lazy" onerror="this.parentElement.innerHTML=''">`
                                    : "";

                            return `
                                <div class="bundle-item-row">
                                    <div class="bundle-item-thumb">${thumb}</div>
                                    <span class="bundle-item-name">${escapeHtml(
                                        item.name
                                    )}</span>
                                </div>
                            `;
                        })
                        .join("")}
                </div>
              `
            : `
                <div class="food-card-image-container">
                    <div class="food-card-placeholder">
                        No item details available
                    </div>
                </div>
              `;


    const scoreBadge =
        bundle.macro_match_score !==
        undefined
            ? `
                <span class="match-badge">
                    ${bundle.macro_match_score}% match
                </span>
              `
            : "";


    const calories =
        bundle.calories != null
            ? `${bundle.calories} kcal`
            : "—";

    const protein =
        bundle.protein_g != null
            ? `${bundle.protein_g}g`
            : "—";

    const carbs =
        bundle.carbs_g != null
            ? `${bundle.carbs_g}g`
            : "—";

    const fat =
        bundle.fat_g != null
            ? `${bundle.fat_g}g`
            : "—";


    card.innerHTML = `
        ${priceTagMarkup(bundle)}

        ${itemListMarkup}

        <div class="result-card-header">
            <span class="result-name">
                ${escapeHtml(
                    bundleTitle
                )}
            </span>

            ${scoreBadge}
        </div>

        <p class="result-restaurant">
            ${escapeHtml(
                restaurantName
            )}
        </p>

        <dl class="macro-list">
            <span>Calories</span>
            <strong>${calories}</strong>

            <span>Protein</span>
            <strong>${protein}</strong>

            <span>Carbs</span>
            <strong>${carbs}</strong>

            <span>Fat</span>
            <strong>${fat}</strong>
        </dl>

        <span class="category-chip">
            Suggested bundle
        </span>
    `;

    return card;
}


// ---- Graph view (D3) ------------------------------------------------------------
//
// This view shows a deterministic branching hierarchy of the strongest matches
// (>=75%) rather than a force-directed "spider web" of every item. Layout is
// computed with d3.tree() (a pure function of the data — no physics, no
// randomness), so the same matches always land in the same positions.

const GRAPH_MIN_MATCH_PCT = 75;   // hard floor — nothing below this appears at all
const GRAPH_MAX_ROOTS = 5;        // "1-5 main nodes in the centre"
const GRAPH_MAX_CHILDREN = 2;     // keeps branching binary/tidy instead of dense
const GRAPH_MAX_NODES = 30;       // readability cap when there are many 75%+ results
const GRAPH_NODE_SPACING_X = 150;
const GRAPH_LEVEL_SPACING_Y = 150;
const GRAPH_MARGIN = 70;

function setGraphState(state) {
    graphEmpty.hidden = state !== "empty";
    graphLoading.hidden = state !== "loading";
    graphLegend.hidden = state !== "content";
    graphContainer.hidden = state !== "content";
}

// red at target, fading to transparent the further off — brand primary color
function fillColor(pct) {
    return `rgba(110, 40, 34, ${Math.max(0.05, pct / 100)})`;
}

function outlineColor(pct) {
    return `rgba(179, 68, 47, ${Math.max(0.15, pct / 100)})`;
}

async function drawGraph() {
    setGraphState("loading");

    const params = new URLSearchParams();

    if (caloriesInput.value !== "") params.set("target_calories", caloriesInput.value);
    if (proteinInput.value !== "") params.set("target_protein", proteinInput.value);
    if (categorySelect.value && categorySelect.value !== "all") params.set("category", categorySelect.value);
    if (restaurantSelect.value && restaurantSelect.value !== "all") params.set("restaurant", restaurantSelect.value);

    let data;

    try {
        const res = await fetch(`${API_BASE}/graph?${params.toString()}`);
        data = await res.json();
    } catch (err) {
        console.error("Graph request failed:", err);
        setGraphState("empty");
        graphEmpty.textContent = "Couldn't load the graph. Please try again.";
        return;
    }

    if (!data.nodes || data.nodes.length === 0) {
        setGraphState("empty");
        graphEmpty.textContent = "No items match this craving/restaurant combination.";
        return;
    }

    lastGraphData = data;
    removedNodeIds = new Set();
    renderGraph();
}

// A single overall "match %" per item, reused from the two closeness scores the
// backend already computes for every graph node (cal_pct, protein_pct) — no new
// matching/scoring logic, just averaging numbers the API already returns.
function overallMatchPct(d) {
    return Math.round((d.cal_pct + d.protein_pct) / 2);
}

// Turns a flat, match%-sorted list of nodes into a forest of small binary trees:
// the top matches become root/central nodes, and every remaining qualifying node
// is attached as a child of the next available parent (round-robin across trees,
// breadth-first), so higher matches always end up closer to the centre.
function buildMatchHierarchy(sortedNodes) {
    const rootCount = sortedNodes.length <= 3
        ? 1
        : Math.min(GRAPH_MAX_ROOTS, Math.max(1, Math.round(sortedNodes.length / 5)));

    const roots = sortedNodes.slice(0, rootCount).map(d => ({ data: d, children: [] }));
    const rest = sortedNodes.slice(rootCount);

    // Every tree node starts eligible to receive children; as each gets one, it's
    // appended to this same queue so its own children slot in right after it —
    // that's what keeps the branching breadth-first instead of one long chain.
    const frontier = [...roots];
    let cursor = 0;
    for (const item of rest) {
        while (frontier[cursor % frontier.length].children.length >= GRAPH_MAX_CHILDREN) {
            cursor++;
        }
        const parent = frontier[cursor % frontier.length];
        const node = { data: item, children: [] };
        parent.children.push(node);
        frontier.push(node); // eligible for its own children once we reach it
    }

    return roots;
}

function renderGraph() {
    const data = lastGraphData;

    graphContainer.innerHTML = "";
    document.getElementById("graph-cap-note")?.remove();
    const containerWidth = graphContainer.clientWidth || 800;

    // ---- filter -> sort -> cap -> build the hierarchy (steps 1-6 of the spec) ----
    const qualifying = data.nodes
        .filter(d => !removedNodeIds.has(d.id))
        .map(d => ({ ...d, matchPct: overallMatchPct(d) }))
        .filter(d => d.matchPct >= GRAPH_MIN_MATCH_PCT)
        .sort((a, b) => b.matchPct - a.matchPct || a.name.localeCompare(b.name));

    if (qualifying.length === 0) {
        setGraphState("empty");
        graphEmpty.textContent = `No items are a ${GRAPH_MIN_MATCH_PCT}%+ match for this combination yet — try adjusting your targets.`;
        return;
    }

    const shown = qualifying.slice(0, GRAPH_MAX_NODES);
    const roots = buildMatchHierarchy(shown);

    // ---- deterministic tidy-tree layout (no simulation, no randomness) ----
    const virtualRoot = d3.hierarchy({ children: roots }, d => d.children);
    d3.tree().nodeSize([GRAPH_NODE_SPACING_X, GRAPH_LEVEL_SPACING_Y])(virtualRoot);

    const treeNodes = virtualRoot.descendants().filter(d => d.depth > 0);
    const treeLinks = virtualRoot.links().filter(l => l.source.depth > 0);

    const xs = treeNodes.map(d => d.x);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const contentWidth = (maxX - minX) + GRAPH_MARGIN * 2;
    const maxDepth = Math.max(...treeNodes.map(d => d.depth));
    const contentHeight = (maxDepth + 1) * GRAPH_LEVEL_SPACING_Y + GRAPH_MARGIN;

    // shift every node so the whole forest is centred on the container's own
    // width — this is the single source of truth for both the svg size below
    // and every node position, so the two always agree
    const offsetX = containerWidth / 2 - (minX + maxX) / 2;
    const offsetY = GRAPH_MARGIN;
    treeNodes.forEach(d => {
        d.px = d.x + offsetX;
        d.py = d.y + offsetY;
    });

    const svg = d3.select("#graph-container")
        .append("svg")
        .attr("width", containerWidth)
        .attr("height", contentHeight);

    const zoomLayer = svg.append("g");
    const zoom = d3.zoom()
        .scaleExtent([0.3, 4])
        .on("zoom", event => zoomLayer.attr("transform", event.transform));
    svg.call(zoom);

    // if the tree is wider than the visible area, start zoomed out just enough
    // to fit it (around its own centre) so nothing important starts off-screen
    if (contentWidth > containerWidth) {
        const fitScale = Math.max(0.3, containerWidth / contentWidth);
        const cx = containerWidth / 2;
        svg.call(zoom.transform, d3.zoomIdentity
            .translate(cx, 0)
            .scale(fitScale)
            .translate(-cx, 0));
    }

    const defs = svg.append("defs");

    // ---- links: parent -> child only, one line per connection, none crossing ----
    treeLinks.forEach((link, i) => {
        const gradId = `edge-grad-${i}`;
        link.gradientId = gradId;
        const grad = defs.append("linearGradient")
            .attr("id", gradId)
            .attr("gradientUnits", "userSpaceOnUse")
            .attr("x1", link.source.px).attr("y1", link.source.py)
            .attr("x2", link.target.px).attr("y2", link.target.py);
        grad.append("stop").attr("offset", "0%")
            .attr("stop-color", `rgba(161,140,112,${Math.max(0.25, link.source.data.data.matchPct / 100)})`);
        grad.append("stop").attr("offset", "100%")
            .attr("stop-color", `rgba(161,140,112,${Math.max(0.25, link.target.data.data.matchPct / 100)})`);
    });

    zoomLayer.append("g")
        .selectAll("line")
        .data(treeLinks)
        .join("line")
        .attr("x1", d => d.source.px).attr("y1", d => d.source.py)
        .attr("x2", d => d.target.px).attr("y2", d => d.target.py)
        .attr("stroke", d => `url(#${d.gradientId})`)
        .attr("stroke-width", 2);

    // ---- nodes ----
    const node = zoomLayer.append("g")
        .selectAll("g")
        .data(treeNodes)
        .join("g")
        .attr("transform", d => `translate(${d.px},${d.py})`)
        .style("cursor", "pointer")
        .on("click", (event, d) => {
            removedNodeIds.add(d.data.data.id);
            renderGraph(); // rebuild the hierarchy from the remaining matches, no new fetch
        });

    // central (depth 1) nodes are drawn larger and bolder — the visual hierarchy
    // itself communicates "closer to centre = stronger match", not just colour
    const radius = d => d.depth === 1 ? 46 : 34;

    defs.selectAll("clipPath")
        .data(treeNodes)
        .join("clipPath")
        .attr("id", d => `clip-${d.data.data.id}`)
        .append("circle")
        .attr("r", d => radius(d) - 3);

    node.append("circle")
        .attr("r", d => radius(d) + 3)
        .attr("fill", "none")
        .attr("stroke", "#000")
        .attr("stroke-width", d => d.depth === 1 ? 1.5 : 1);

    node.append("circle")
        .attr("r", d => radius(d) + 1)
        .attr("fill", "none")
        .attr("stroke", d => outlineColor(d.data.data.protein_pct))
        .attr("stroke-width", d => d.depth === 1 ? 6 : 4);

    node.append("circle")
        .attr("r", d => radius(d) - 3)
        .attr("fill", d => fillColor(d.data.data.cal_pct));

    node.filter(d => d.data.data.image)
        .append("image")
        .attr("href", d => d.data.data.image)
        .attr("xlink:href", d => d.data.data.image)
        .attr("x", d => -radius(d) + 3)
        .attr("y", d => -radius(d) + 3)
        .attr("width", d => (radius(d) - 3) * 2)
        .attr("height", d => (radius(d) - 3) * 2)
        .attr("clip-path", d => `url(#clip-${d.data.data.id})`)
        .attr("preserveAspectRatio", "xMidYMid slice")
        .attr("opacity", 0.85);

    // match % badge — bold and unmissable, sits right on the node
    node.append("text")
        .attr("text-anchor", "middle")
        .attr("y", d => -radius(d) - 10)
        .attr("font-size", d => d.depth === 1 ? "13px" : "11px")
        .attr("font-weight", "700")
        .attr("fill", "var(--color-primary-dark)")
        .attr("pointer-events", "none")
        .text(d => `${d.data.data.matchPct}% match`);

    node.each(function (d) {
        const item = d.data.data;
        const words = item.name.split(" ");
        const lines = [];
        let current = "";
        words.forEach(w => {
            if ((current + " " + w).trim().length > 14) {
                lines.push(current.trim());
                current = w;
            } else {
                current += " " + w;
            }
        });
        if (current.trim()) lines.push(current.trim());
        const shownLines = lines.slice(0, 2);

        const text = d3.select(this).append("text")
            .attr("text-anchor", "middle")
            .attr("font-size", "10px")
            .attr("fill", "var(--color-ink)")
            .attr("pointer-events", "none");

        const lineHeight = 11;
        const startY = radius(d) + 16;
        shownLines.forEach((line, i) => {
            text.append("tspan")
                .attr("x", 0)
                .attr("y", startY + i * lineHeight)
                .text(line);
        });
    });

    node.append("title")
        .text(d => {
            const item = d.data.data;
            return `${item.name}\n${item.matchPct}% match\n${item.calories ?? "?"} kcal, ${item.protein_g ?? "?"}g protein`;
        });

    setGraphState("content");

    if (qualifying.length > shown.length) {
        const note = document.createElement("p");
        note.id = "graph-cap-note";
        note.className = "hint-text";
        note.textContent = `Showing the top ${shown.length} of ${qualifying.length} matches at ${GRAPH_MIN_MATCH_PCT}%+ to keep this readable.`;
        graphContainer.before(note);
    }
}

showGraphBtn.addEventListener("click", () => {
    resultsContent.hidden = true;
    graphView.hidden = false;
    drawGraph();
});

graphBackBtn.addEventListener("click", () => {
    graphView.hidden = true;
    resultsContent.hidden = false;
});

graphResetBtn.addEventListener("click", () => {
    removedNodeIds = new Set();
    if (lastGraphData) renderGraph();
});


// ---- Form submit ---------------------------------------------------------------

matchForm.addEventListener(
    "submit",
    event => {
        event.preventDefault();

        const calories =
            Number(
                caloriesInput.value
            );

        const protein =
            Number(
                proteinInput.value
            );

        if (
            Number.isNaN(calories) ||
            Number.isNaN(protein) ||
            calories < 0 ||
            protein < 0
        ) {
            setResultsState(
                "error"
            );

            resultsError.textContent =
                "Enter valid calorie and protein numbers.";

            return;
        }

        runMacroMatch();
    }
);


// ---- Init ----------------------------------------------------------------------

async function init() {
    setResultsState("empty");

    await Promise.all([
        populateSelectOptions(
            restaurantSelect,
            "restaurants",
            "All restaurants"
        ),

        populateSelectOptions(
            categorySelect,
            "categories",
            "All"
        ),

        populateDietFilters(),
        populateAllergenFilters(),
    ]);

    attachFilterListeners();
}

init();