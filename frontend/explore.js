const API_BASE = "https://macro-aware-picks-backend.onrender.com/api";
// const API_BASE = "http://127.0.0.1:5001/api";

const graphForm = document.getElementById("graph-form");
const graphCalories = document.getElementById("graph-calories");
const graphProtein = document.getElementById("graph-protein");
const graphCategory = document.getElementById("graph-category");
const graphRestaurant = document.getElementById("graph-restaurant");

const graphEmpty = document.getElementById("graph-empty");
const graphLoading = document.getElementById("graph-loading");
const graphLegend = document.getElementById("graph-legend");
const graphContainer = document.getElementById("graph-container");

function setGraphState(state) {
    graphEmpty.hidden = state !== "empty";
    graphLoading.hidden = state !== "loading";
    graphLegend.hidden = state !== "content";
    graphContainer.hidden = state !== "content";
}

async function populateSelect(selectEl, endpoint, allLabel, formatFn) {
    try {
        const res = await fetch(`${API_BASE}/${endpoint}`);
        const items = await res.json();
        selectEl.innerHTML = "";
        const allOpt = document.createElement("option");
        allOpt.value = "all";
        allOpt.textContent = allLabel;
        allOpt.selected = true;
        selectEl.appendChild(allOpt);
        items.forEach(v => {
            const opt = document.createElement("option");
            opt.value = v;
            opt.textContent = formatFn ? formatFn(v) : v;
            selectEl.appendChild(opt);
        });
    } catch (err) {
        console.error(`Failed to load ${endpoint}:`, err);
    }
}

function formatCategory(c) {
    return String(c).split("-").map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

// red at target, fading to transparent the further off — brand primary color
function fillColor(pct) {
    return `rgba(110, 40, 34, ${Math.max(0.05, pct / 100)})`;
}
function outlineColor(pct) {
    return `rgba(179, 68, 47, ${Math.max(0.15, pct / 100)})`;
}

const graphResetBtn = document.getElementById("graph-reset-btn");

let lastGraphData = null;
let removedNodeIds = new Set();

async function drawGraph() {
    setGraphState("loading");

    const params = new URLSearchParams();
    if (graphCalories.value !== "") params.set("target_calories", graphCalories.value);
    if (graphProtein.value !== "") params.set("target_protein", graphProtein.value);
    if (graphCategory.value !== "all") params.set("category", graphCategory.value);
    if (graphRestaurant.value !== "all") params.set("restaurant", graphRestaurant.value);

    let data;
    try {
        const res = await fetch(`${API_BASE}/graph?${params.toString()}`);
        data = await res.json();
    } catch (err) {
        console.error("Graph request failed:", err);
        setGraphState("empty");
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

function renderGraph() {
    const data = lastGraphData;
    const activeCategory = graphCategory.value;
    const NODE_RADIUS = 40;

    graphContainer.innerHTML = "";
    const width = graphContainer.clientWidth || 800;
    const height = 800;

    const svg = d3.select("#graph-container")
        .append("svg")
        .attr("width", width)
        .attr("height", height);

    const zoomLayer = svg.append("g");
    const zoom = d3.zoom()
        .scaleExtent([0.3, 4])
        .on("zoom", event => zoomLayer.attr("transform", event.transform));
    svg.call(zoom);

    const defs = svg.append("defs");

    // nodes the user hasn't removed
    const nodes = data.nodes
        .filter(d => !removedNodeIds.has(d.id))
        .map(d => ({ ...d }));
    const visibleIds = new Set(nodes.map(n => n.id));

    const EDGE_MIN_PCT = 55;
    const links = data.edges
        .filter(d => visibleIds.has(d.source) && visibleIds.has(d.target)) // drop edges to removed nodes
        .map(d => {
            const meaningfulTags = activeCategory !== "all"
                ? d.shared_tags.filter(t => t !== activeCategory)
                : d.shared_tags;
            return { ...d, meaningfulTags };
        })
        .filter(d => d.meaningfulTags.length > 0)
        .filter(d => Math.max(d.source_match_pct, d.target_match_pct) >= EDGE_MIN_PCT);

    links.forEach((link, i) => {
        const gradId = `edge-grad-${i}`;
        link.gradientId = gradId;
        const grad = defs.append("linearGradient")
            .attr("id", gradId)
            .attr("gradientUnits", "userSpaceOnUse");
        grad.append("stop").attr("offset", "0%")
            .attr("stop-color", `rgba(161,140,112,${Math.max(0.1, link.source_match_pct / 100)})`);
        grad.append("stop").attr("offset", "100%")
            .attr("stop-color", `rgba(161,140,112,${Math.max(0.1, link.target_match_pct / 100)})`);
    });

    const simulation = d3.forceSimulation(nodes)
        .force("link", d3.forceLink(links).id(d => d.id).distance(220).strength(0.15))
        .force("charge", d3.forceManyBody().strength(-450))
        .force("center", d3.forceCenter(width / 2, height / 2))
        .force("collide", d3.forceCollide(NODE_RADIUS + 12));

    const link = zoomLayer.append("g")
        .selectAll("line")
        .data(links)
        .join("line")
        .attr("stroke", d => `url(#${d.gradientId})`)
        .attr("stroke-width", 1.5);

    const node = zoomLayer.append("g")
        .selectAll("g")
        .data(nodes)
        .join("g")
        .style("cursor", "pointer")
        .call(d3.drag()
            .clickDistance(4) // small jitter still counts as a click, not a drag
            .on("start", (event, d) => {
                if (!event.active) simulation.alphaTarget(0.3).restart();
                d.fx = d.x; d.fy = d.y;
            })
            .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
            .on("end", (event, d) => {
                if (!event.active) simulation.alphaTarget(0);
                d.fx = null; d.fy = null;
            }))
        .on("click", (event, d) => {
            removedNodeIds.add(d.id);
            renderGraph(); // re-render from the same cached data, no new fetch
        });

    defs.selectAll("clipPath")
        .data(nodes)
        .join("clipPath")
        .attr("id", d => `clip-${d.id}`)
        .append("circle")
        .attr("r", NODE_RADIUS - 3);

    node.append("circle")
        .attr("r", NODE_RADIUS + 3)
        .attr("fill", "none")
        .attr("stroke", "#000")
        .attr("stroke-width", 1);

    node.append("circle")
        .attr("r", NODE_RADIUS + 1)
        .attr("fill", "none")
        .attr("stroke", d => outlineColor(d.protein_pct))
        .attr("stroke-width", 5);

    node.append("circle")
        .attr("r", NODE_RADIUS - 3)
        .attr("fill", d => fillColor(d.cal_pct));

    node.filter(d => d.image)
        .append("image")
        .attr("href", d => d.image)
        .attr("xlink:href", d => d.image)
        .attr("x", -NODE_RADIUS + 3)
        .attr("y", -NODE_RADIUS + 3)
        .attr("width", (NODE_RADIUS - 3) * 2)
        .attr("height", (NODE_RADIUS - 3) * 2)
        .attr("clip-path", d => `url(#clip-${d.id})`)
        .attr("preserveAspectRatio", "xMidYMid slice")
        .attr("opacity", 0.85);

    node.each(function (d) {
        const words = d.name.split(" ");
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
        const shown = lines.slice(0, 2);

        const text = d3.select(this).append("text")
            .attr("text-anchor", "middle")
            .attr("font-size", "10px")
            .attr("fill", "var(--color-ink)")
            .attr("pointer-events", "none");

        const lineHeight = 11;
        const startY = NODE_RADIUS + 16;
        shown.forEach((line, i) => {
            text.append("tspan")
                .attr("x", 0)
                .attr("y", startY + i * lineHeight)
                .text(line);
        });
    });

    node.append("title")
        .text(d => `${d.name}\n${d.calories ?? "?"} kcal, ${d.protein_g ?? "?"}g protein`);

    simulation.on("tick", () => {
        link
            .attr("x1", d => d.source.x).attr("y1", d => d.source.y)
            .attr("x2", d => d.target.x).attr("y2", d => d.target.y);
        node.attr("transform", d => `translate(${d.x},${d.y})`);
    });

    setGraphState("content");
}

graphForm.addEventListener("submit", e => {
    e.preventDefault();
    drawGraph();
});

graphResetBtn.addEventListener("click", () => {
    removedNodeIds = new Set();
    if (lastGraphData) renderGraph();
});

async function init() {
    await Promise.all([
        populateSelect(graphCategory, "categories", "All", formatCategory),
        populateSelect(graphRestaurant, "restaurants", "All restaurants"),
    ]);
}

init();