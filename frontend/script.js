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

function formatRemaining(value, label) {
    const over = value < 0;

    return `${Math.abs(value)}${label} ${
        over ? "over" : "remaining"
    }`;
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
    ]);

    attachFilterListeners();
}

init();