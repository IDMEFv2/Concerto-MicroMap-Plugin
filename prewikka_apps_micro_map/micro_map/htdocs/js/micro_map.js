const monitoredElements = new Map();
const connectedElementsMap = new Map();
const alertTooltipDataByObjectId = new Map();
const trackedTooltipState = { element: null, objectId: null };
let selectedMonitoredObjectId = null;
let isMicroRefreshInProgress = false;
var loadedSvg = "";
const navigationContext = {
    has_reference: false,
    asset_ref: "",
    ref_type: "",
    source: "",
    svg_name: ""
};
const MICRO_MAP_DOC_EVENT_NS = ".microMap";
const MICRO_MAP_LAST_ASSET_KEY = "micro_map_last_asset";
const MICRO_DEFAULT_FLOOR_PRESET = "office_sample.drawio.svg";
let microFloorPlanPresetInitPromise = null;
let selectedManageSvgName = "";
let selectedManageSvgText = "";
let selectedMicroRuleObjectId = null;
let microMapLoadingDepth = 0;
const MICRO_DEFAULT_COLOR = "#5cb85c";
const DEFAULT_COLOR_RULES = [
    {
        ruleType: "percentage",
        metric: "high",
        operator: ">=",
        value: 70,
        color: "#FE0000"
    },
    {
        ruleType: "percentage",
        metric: "medium",
        operator: ">=",
        value: 50,
        color: "#f0ad4e"
    },
    {
        ruleType: "percentage",
        metric: "low",
        operator: ">=",
        value: 0,
        color: "#5cb85c"
    }
];

const MICRO_DETECTION_ICON_LIBRARY = {
    human: {
        viewBox: "0 0 24 24",
        path: "M20.822 18.096c-3.439-.794-6.64-1.49-5.09-4.418 4.72-8.912 1.251-13.678-3.732-13.678-5.082 0-8.464 4.949-3.732 13.678 1.597 2.945-1.725 3.641-5.09 4.418-3.073.71-3.188 2.236-3.178 4.904l.004 1h23.99l.004-.969c.012-2.688-.092-4.222-3.176-4.935z"
    },

    fallback: {
        viewBox: "0 0 24 24",
        path: "M6.4 4.9 L12 10.5 L17.6 4.9 L19.1 6.4 L13.5 12 L19.1 17.6 L17.6 19.1 L12 13.5 L6.4 19.1 L4.9 17.6 L10.5 12 L4.9 6.4 Z"
    }
};

async function loadNavigationContext() {
    try {
        const response = await $.ajax({
            url: "/micro_map/get_micro_navigation_context",
            type: "GET",
            dataType: "json"
        });

        if (response && typeof response === "object") {
            navigationContext.has_reference = !!response.has_reference;
            navigationContext.asset_ref = String(response.asset_ref || "").trim();
            navigationContext.ref_type = String(response.ref_type || "").trim();
            navigationContext.source = String(response.source || "").trim();
            navigationContext.svg_name = String(response.svg_name || "").trim();
        }
    } catch (_error) {
        navigationContext.has_reference = false;
        navigationContext.asset_ref = "";
        navigationContext.ref_type = "";
        navigationContext.source = "";
        navigationContext.svg_name = "";
    }

    window.microMapNavigationContext = { ...navigationContext };
    return { ...navigationContext };
}

function getCurrentAssetRef() {
    return String(navigationContext.asset_ref || "").trim();
}

function getCurrentRefType() {
    return String(navigationContext.ref_type || "entity_name").trim() || "entity_name";
}

function ensureCurrentAssetRef(options = {}) {
    const warn = options.warn !== false;
    const assetRef = getCurrentAssetRef();
    if (!assetRef && warn) {
        console.warn("No current asset reference available for micro map operations.");
        return "";
    }
    return assetRef;
}

function saveLastSelectedAsset(assetRef) {
    const normalized = String(assetRef || "").trim();
    if (!normalized) return;

    localStorage.setItem(MICRO_MAP_LAST_ASSET_KEY, JSON.stringify({ asset_ref: normalized }));
}

function loadLastSelectedAsset() {
    const localData = localStorage.getItem(MICRO_MAP_LAST_ASSET_KEY);
    if (!localData) return "";

    try {
        const parsed = JSON.parse(localData);
        if (typeof parsed === "string") {
            return String(parsed || "").trim();
        }

        if (parsed && typeof parsed === "object") {
            return String(parsed.asset_ref || "").trim();
        }
    } catch (error) {
        console.error("Error parsing LocalStorage", error);
    }

    return "";
}

function setMainUiVisible(isVisible) {
    const mainMap = document.getElementById("main-map");
    const sidebar = document.getElementById("sidebar");
    const sidebarToggle = document.getElementById("sidebar-toggle");

    if (mainMap) mainMap.classList.toggle("is-hidden", !isVisible);
    if (sidebar) {
        sidebar.classList.toggle("is-hidden", !isVisible);
        if (isVisible) {
            sidebar.classList.add("drawer-closed");
        }
    }
    if (sidebarToggle) sidebarToggle.classList.toggle("is-hidden", !isVisible);
    syncMicroMapEmptyState();
}

function setSidebarDrawerClosed(isClosed) {
    const sidebar = document.getElementById("sidebar");
    if (!sidebar) return;

    sidebar.classList.toggle("drawer-closed", !!isClosed);
}

function syncMicroMapEmptyState() {
    const emptyState = document.getElementById("micro-map-empty-state");
    const mainMap = document.getElementById("main-map");
    const overlay = document.getElementById("asset-selector-overlay");

    if (!emptyState || !mainMap) return;

    const mainUiVisible = !mainMap.classList.contains("is-hidden");
    // The selector overlay only exists in the DOM when it is actually shown.
    const overlayVisible = !!overlay;
    const loadingInProgress = microMapLoadingDepth > 0;
    const hasSvgLoaded = !!loadedSvg;
    const shouldShow = mainUiVisible && !overlayVisible && !loadingInProgress && !hasSvgLoaded;

    emptyState.classList.toggle("is-hidden", !shouldShow);
}

function buildAssetSelectorOverlay() {
    const overlay = document.createElement("div");
    overlay.id = "asset-selector-overlay";
    overlay.innerHTML = `
        <div id="asset-selector-card" class="crud-modal-border">
            <div class="custom-modal-header bg-primary">
                <h3>Select an Asset</h3>
            </div>
            <div class="custom-modal-body">
                <p id="asset-selector-message">Choose an asset from Macro Map to open Micro Map.</p>
                <select id="asset-selector-dropdown" class="modal-input"></select>
                <div class="flex w-100 justify-end">
                    <button id="asset-selector-load" class="btn btn-primary" type="button">Open selected asset</button>
                </div>
            </div>
        </div>
    `;
    return overlay;
}

function getAssetSelectorParent() {
    const mainMap = document.getElementById("main-map");
    if (mainMap && mainMap.parentElement) return mainMap.parentElement;
    return document.body;
}

// Removes the selector card from the DOM entirely. While absent it can never
// flash, not even during get_micro_plans_list / load_micro_floor_plan calls.
function removeAssetSelector() {
    const overlay = document.getElementById("asset-selector-overlay");
    if (overlay && overlay.parentElement) {
        overlay.parentElement.removeChild(overlay);
    }
    syncMicroMapEmptyState();
}

function beginMicroMapLoading() {
    microMapLoadingDepth += 1;
    // While loading, the selector card must not be present at all.
    removeAssetSelector();
    syncMicroMapEmptyState();
}

function endMicroMapLoading() {
    microMapLoadingDepth = Math.max(0, microMapLoadingDepth - 1);
    syncMicroMapEmptyState();
}

// Creates and injects the selector card. Call this ONLY after all loading
// calls have completed and we are sure that no asset/plan will be loaded.
function showAssetSelector(entityNames, message) {
    removeAssetSelector();

    const overlay = buildAssetSelectorOverlay();
    getAssetSelectorParent().appendChild(overlay);

    const loadBtn = overlay.querySelector("#asset-selector-load");
    if (loadBtn) {
        loadBtn.addEventListener("click", onAssetSelectorLoadClick);
    }

    populateAssetSelector(entityNames);
    if (message) {
        setAssetSelectorMessage(message);
    }

    syncMicroMapEmptyState();
}

async function onAssetSelectorLoadClick() {
    const dropdown = document.getElementById("asset-selector-dropdown");
    const selectedAsset = dropdown ? String(dropdown.value || "").trim() : "";
    if (!selectedAsset) {
        setAssetSelectorMessage("No asset selected. Choose one from the list.");
        return;
    }

    navigationContext.has_reference = true;
    navigationContext.asset_ref = selectedAsset;
    navigationContext.ref_type = "entity_name";
    navigationContext.source = "micro_map_selector";
    navigationContext.svg_name = "";
    window.microMapNavigationContext = { ...navigationContext };
    saveLastSelectedAsset(selectedAsset);

    const sidebarAssetDropdown = document.getElementById("asset-switch-select");
    if (sidebarAssetDropdown) {
        sidebarAssetDropdown.value = selectedAsset;
    }

    // Tear the card down before loading so it cannot linger during the calls.
    removeAssetSelector();
    setMainUiVisible(true);
    await initializeMapForCurrentAsset();
    await refreshAlertsFromMacroMapFallback();
}

function setAssetSelectorMessage(message) {
    const messageNode = document.getElementById("asset-selector-message");
    if (messageNode) {
        messageNode.textContent = message;
    }
}

function syncMicroMapContainerOffset() {
    const form = document.querySelector('#main.content.prewikka-resources-container form[action="/micro_map"]');
    if (!form || !window.getComputedStyle) return;

    const style = window.getComputedStyle(form);
    const padLeft = Number.parseFloat(style.paddingLeft || "0") || 0;
    form.style.setProperty("--micro-map-container-pad-left", `${padLeft}px`);
}

function extractEntityNamesFromMacroState(response) {
    const rawAssets = [];

    if (response && Array.isArray(response.assets)) {
        rawAssets.push(...response.assets);
    } else if (response && response.assets && Array.isArray(response.assets.assets)) {
        rawAssets.push(...response.assets.assets);
    }

    const names = rawAssets
        .map((asset) => String((asset && asset.entity_name) || "").trim())
        .filter(Boolean);

    return Array.from(new Set(names)).sort((a, b) => a.localeCompare(b));
}

function extractMacroMapAssets(response) {
    const rawAssets = [];

    if (response && Array.isArray(response.assets)) {
        rawAssets.push(...response.assets);
    } else if (response && response.assets && Array.isArray(response.assets.assets)) {
        rawAssets.push(...response.assets.assets);
    }

    return rawAssets.filter((asset) => asset && typeof asset === "object");
}

function normalizeEntityKey(value) {
    return String(value || "").trim().toLowerCase();
}

async function fetchMacroMapEntityNames() {
    const response = await $.ajax({
        url: "/macro_map/load_macro_state",
        type: "GET",
        dataType: "json"
    });

    return extractEntityNamesFromMacroState(response);
}

async function fetchMacroMapState() {
    return $.ajax({
        url: "/macro_map/load_macro_state",
        type: "GET",
        dataType: "json"
    });
}

async function fetchMacroMapAlertsBulk(entityNames, dates) {
    const requestedEntityNames = (Array.isArray(entityNames) ? entityNames : [])
        .map((name) => String(name || "").trim())
        .filter(Boolean);

    if (!requestedEntityNames.length || !dates) {
        return { status: "success", data: {} };
    }

    return $.ajax({
        url: "/macro_map/get_macro_alerts_bulk",
        type: "POST",
        dataType: "json",
        data: {
            entities: JSON.stringify(requestedEntityNames),
            start_date: dates.start_date,
            end_date: dates.end_date,
        }
    });
}

function convertMacroMapAlertsToMicroMapRows(alerts) {
    return (Array.isArray(alerts) ? alerts : []).map((row) => ({
        analyzer: Array.isArray(row) ? row[0] : null,
        priority: Array.isArray(row) ? row[1] : null,
        target_ip: Array.isArray(row) ? row[2] : null,
        description: Array.isArray(row) ? row[3] : null,
        start_time: Array.isArray(row) ? row[4] : null,
        vector_id: Array.isArray(row) ? row[5] : null,
        vector_category: Array.isArray(row) ? row[6] : null,
        vector_geolocation: Array.isArray(row) ? row[7] : null,
    }));
}

async function refreshAlertsFromMacroMapFallback() {
    const currentAssetRef = ensureCurrentAssetRef({ warn: false });
    if (!currentAssetRef) {
        return false;
    }

    const dates = await getDates();
    if (!dates) {
        return false;
    }

    try {
        const macroState = await fetchMacroMapState();
        const assets = extractMacroMapAssets(macroState);
        const currentAsset = assets.find((asset) => String(asset.entity_name || "").trim() === currentAssetRef);

        if (!currentAsset) {
            applyAggregatedAlertsToMonitoredElements([]);
            return false;
        }

        const entityNames = assets
            .map((asset) => String(asset.entity_name || "").trim())
            .filter(Boolean);

        const response = await fetchMacroMapAlertsBulk(entityNames, dates);
        const groupedData = response && response.data && typeof response.data === "object" ? response.data : {};
        const directAlerts = groupedData[currentAssetRef] || groupedData[currentAsset.entity_name] || null;

        let currentAlerts = directAlerts;
        if (!currentAlerts) {
            const currentKey = normalizeEntityKey(currentAssetRef);
            const matchedKey = Object.keys(groupedData).find((key) => normalizeEntityKey(key) === currentKey);
            currentAlerts = matchedKey ? groupedData[matchedKey] : [];
        }

        applyAggregatedAlertsToMonitoredElements(convertMacroMapAlertsToMicroMapRows(currentAlerts));
        return true;
    } catch (error) {
        console.error("Failed to load fallback alerts from Macro Map bulk endpoint:", error);
        applyAggregatedAlertsToMonitoredElements([]);
        return false;
    }
}

async function navigateToMacroMap() {
    detachMicroMapDocumentHandlers();
    await $.ajax({
        url: "/micro_map/navigate_to_macro_map",
        type: "POST",
        data: {
            source: "micro_map"
        }
    });
}

async function navigateToAlertsTableByTargetIp(targetIp) {
    const normalizedTargetIp = normalizeAlertJoinKey(targetIp);
    if (!normalizedTargetIp) {
        console.warn("No target IP available for alert table navigation.");
        return;
    }

    await $.ajax({
        url: "/micro_map/navigate_to_table_by_target_ip",
        type: "POST",
        data: {
            target_ip: normalizedTargetIp,
        }
    });
}

function hideContextMenu() {
    $("#MicroPopoverOption").hide();
}

function openManageFloorPlansModal() {
    $("#manage-floor-plans-modal").css("display", "flex");
    syncMicroModalMask();
}

function closeManageFloorPlansModal() {
    $("#manage-floor-plans-modal").css("display", "none");
    syncMicroModalMask();
}

function openMicroRulesModal(objectId) {
    const entry = monitoredElements.get(objectId);
    if (!entry) {
        console.warn("No monitored entry found for rules modal:", objectId);
        return;
    }

    selectedMicroRuleObjectId = objectId;
    selectedMonitoredObjectId = objectId;
    $("#MicroPopoverOption").attr("data-selected-object-id", objectId);
    $("#micro-rules-modal-subtitle").text(`Object: ${entry.label || entry.target || objectId}`);
    microRenderRulesGrid(document.querySelector("#micro-rules-grid-container"), entry);
    $("#micro-rules-modal").css("display", "flex");
    syncMicroModalMask();
}

function closeMicroRulesModal() {
    $("#micro-rules-modal").css("display", "none");
    selectedMicroRuleObjectId = null;
    syncMicroModalMask();
}

function syncMicroModalMask() {
    const shouldShow = $("#manage-floor-plans-modal").is(":visible") || $("#micro-rules-modal").is(":visible");
    $("#micro-modal-mask").css("display", shouldShow ? "flex" : "none");
}

function detachMicroMapDocumentHandlers() {
    $(document).off(`click${MICRO_MAP_DOC_EVENT_NS}`);
}

function showContextMenuAtPosition(x, y) {
    const menu = $("#MicroPopoverOption");
    const popover = $("#MicroPopoverOption .popover");

    menu.css({ visibility: "hidden", display: "block" });

    let left = x - (popover.outerWidth() / 2);
    let top = y + 8;

    popover.find(".dropdown-submenu").removeClass("pull-left");
    popover.removeClass("bottom top left right menu-left");

    if (left < 0) {
        left = 8;
        popover.addClass("right");
    } else if (left + popover.outerWidth() > window.innerWidth) {
        left = Math.max(8, window.innerWidth - popover.outerWidth() - 8);
        popover.addClass("left");
    }

    if (top + popover.outerHeight() > window.innerHeight && y - popover.outerHeight() > 0) {
        top = y - popover.outerHeight() - 8;
        popover.addClass("top");
    } else {
        popover.addClass("bottom");
    }

    menu.css({ top, left, visibility: "visible" });
}

function microGenerateId() {
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, c => {
        const r = Math.random() * 16 | 0;
        const v = c === "x" ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

function microCreateDefaultRules() {
    return DEFAULT_COLOR_RULES.map((rule) => ({
        ...rule,
        ruleId: microGenerateId()
    }));
}

function microNormalizeRules(rules) {
    const sourceRules = Array.isArray(rules) ? rules : [];
    if (!sourceRules.length) {
        return microCreateDefaultRules();
    }

    return sourceRules
        .filter((rule) => rule && typeof rule === "object" && rule.ruleType)
        .map((rule) => ({
            ...rule,
            ruleId: String(rule.ruleId || microGenerateId())
        }));
}

function microGetSelectedObjectId() {
    return String(
        selectedMicroRuleObjectId ||
        selectedMonitoredObjectId ||
        $("#MicroPopoverOption").attr("data-selected-object-id") ||
        document.querySelector("#micro-rules-grid-container")?.dataset.objectId ||
        ""
    ).trim();
}

function microBuildObjectRulesPayload() {
    const objectRules = {};
    monitoredElements.forEach((entry, objectId) => {
        if (Array.isArray(entry.rules) && entry.rules.length > 0) {
            objectRules[objectId] = entry.rules;
        }
    });
    return objectRules;
}

function microRenderRuleContentCell(rule) {
    const colorOptions = `
        <option value="#FE0000" ${rule.color === "#FE0000" ? "selected" : ""}>Red</option>
        <option value="#f0ad4e" ${rule.color === "#f0ad4e" ? "selected" : ""}>Yellow</option>
        <option value="#5cb85c" ${rule.color === "#5cb85c" ? "selected" : ""}>Green</option>
    `;

    if (rule.ruleType === "percentage") {
        return `
            <div class="rule-content" data-rule-id="${rule.ruleId}">
                <span>When</span>
                <select class="rule-input modal-input" data-field="metric">
                    <option value="high" ${rule.metric === "high" ? "selected" : ""}>High</option>
                    <option value="medium" ${rule.metric === "medium" ? "selected" : ""}>Medium</option>
                    <option value="low" ${rule.metric === "low" ? "selected" : ""}>Low</option>
                </select>
                <span>priority alerts are</span>
                <select class="rule-input modal-input" data-field="operator">
                    <option value=">" ${rule.operator === ">" ? "selected" : ""}>&gt;</option>
                    <option value="<" ${rule.operator === "<" ? "selected" : ""}>&lt;</option>
                    <option value=">=" ${rule.operator === ">=" ? "selected" : ""}>&gt;=</option>
                    <option value="<=" ${rule.operator === "<=" ? "selected" : ""}>&lt;=</option>
                    <option value="==" ${rule.operator === "==" ? "selected" : ""}>=</option>
                </select>
                <input type="number" class="rule-input modal-input" data-field="value" min="0" max="100" step="1" value="${Number.isFinite(Number(rule.value)) ? Number(rule.value) : ""}">
                <span>% turn</span>
                <select class="rule-input modal-input" data-field="color">
                    ${colorOptions}
                </select>
            </div>
        `;
    }

    if (rule.ruleType === "regex") {
        return `
            <div class="rule-content" data-rule-id="${rule.ruleId}">
                <span>Turn</span>
                <select class="rule-input modal-input" data-field="color">
                    ${colorOptions}
                </select>
                <span>when the word</span>
                <input type="text" class="rule-input modal-input" data-field="pattern" value="${String(rule.pattern || "")}">
                <span>is found in an alert description</span>
            </div>
        `;
    }

    return `
        <div class="rule-content" data-rule-id="${rule.ruleId}">
            <span>Unsupported rule type: ${String(rule.ruleType || "unknown")}</span>
        </div>
    `;
}

function microRenderRulesGrid(containerEl, entry) {
    if (!containerEl || !entry) return;

    const rules = Array.isArray(entry.rules) ? entry.rules : [];
    containerEl.innerHTML = "";

    rules.forEach((rule, idx) => {
        containerEl.insertAdjacentHTML("beforeend", `
            <div class="rules-grid">
                <div class="rule-index">#${idx + 1}</div>
                ${microRenderRuleContentCell(rule)}
                <div class="rule-delete" data-rule-id="${rule.ruleId}">✕</div>
            </div>
        `);
    });

    containerEl.dataset.objectId = entry.objectId || "";
}

function microComputePercentages(severityCount) {
    const high = Number(severityCount.High || 0);
    const medium = Number(severityCount.Medium || 0);
    const low = Number(severityCount.Low || 0);
    const sum = high + medium + low;

    if (sum <= 0) {
        return { sum: 0, high: 0, medium: 0, low: 0 };
    }

    return {
        sum,
        high: (high / sum) * 100,
        medium: (medium / sum) * 100,
        low: (low / sum) * 100,
    };
}

function microEvaluatePercentageRule(rule, severityCount) {
    const percentages = microComputePercentages(severityCount);
    const metric = String(rule.metric || "").toLowerCase();
    const metricValue = percentages[metric];
    const threshold = Number(rule.value);

    if (!Number.isFinite(metricValue) || !Number.isFinite(threshold)) {
        return false;
    }

    switch (rule.operator) {
        case ">=": return metricValue >= threshold;
        case ">": return metricValue > threshold;
        case "<=": return metricValue <= threshold;
        case "<": return metricValue < threshold;
        case "==": return metricValue === threshold;
        default: return false;
    }
}

function microEscapeRegexLiteral(text) {
    return String(text || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function microCompileContainsRegex(userText) {
    const raw = String(userText || "").trim();
    if (!raw) return null;
    return new RegExp(microEscapeRegexLiteral(raw), "i");
}

function microEvaluateRegexRule(rule, alertRows) {
    const patternRaw = String(rule.pattern || "").trim();
    if (!patternRaw) return false;

    const haystack = (Array.isArray(alertRows) ? alertRows : [])
        .map((row) => String((row && row.description) || ""))
        .join("\n");
    if (!haystack) return false;

    try {
        return new RegExp(patternRaw, "i").test(haystack);
    } catch (_error) {
        const fallbackRegex = microCompileContainsRegex(patternRaw);
        return !!(fallbackRegex && fallbackRegex.test(haystack));
    }
}

function microResolveColorByRules(entry, severityCount, alertRows) {
    const rules = Array.isArray(entry?.rules) ? entry.rules : [];

    for (const rule of rules) {
        if (!rule || !rule.ruleType) continue;

        let matched = false;
        if (rule.ruleType === "percentage") {
            matched = microEvaluatePercentageRule(rule, severityCount);
        } else if (rule.ruleType === "regex") {
            matched = microEvaluateRegexRule(rule, alertRows);
        }

        if (matched) {
            return rule.color || MICRO_DEFAULT_COLOR;
        }
    }

    return MICRO_DEFAULT_COLOR;
}

async function microSaveRulesForObject(objectId) {
    const entry = monitoredElements.get(objectId);
    const assetRef = ensureCurrentAssetRef({ warn: false });
    const svgName = getSelectedPlanName();
    if (!entry || !assetRef || !svgName) {
        return;
    }

    try {
        await $.ajax({
            url: "/micro_map/save_micro_object_rules",
            type: "POST",
            dataType: "json",
            data: {
                asset_ref: assetRef,
                svg_name: svgName,
                object_id: objectId,
                rules: JSON.stringify(entry.rules || [])
            }
        });
    } catch (error) {
        console.error("Failed to save micro object rules:", error);
    }
}

async function microRefreshMonitoredObjectColor(objectId) {
    const entry = monitoredElements.get(objectId);
    if (!entry) return;

    const severityCount = entry.lastSeverityCount || createEmptySeverityCount();
    const alertRows = Array.isArray(entry.lastAlertRows) ? entry.lastAlertRows : [];
    updateColor(objectId, microResolveColorByRules(entry, severityCount, alertRows));
    await microSaveRulesForObject(objectId);
}

function microAddRuleToSelectedObject() {
    const objectId = microGetSelectedObjectId();
    if (!objectId) {
        console.warn("No monitored object selected for rule insertion.");
        return;
    }

    const entry = monitoredElements.get(objectId);
    if (!entry) {
        console.warn("No monitored entry found for rule insertion:", objectId);
        return;
    }

    const ruleType = $("#micro-type-dropdown").val();
    const position = parseInt($("#micro-position-input").val(), 10) || 1;

    let newRule = {
        ruleId: microGenerateId(),
        ruleType,
    };

    if (ruleType === "percentage") {
        newRule = {
            ...newRule,
            metric: "high",
            operator: ">=",
            value: 50,
            color: "#FE0000"
        };
    } else if (ruleType === "regex") {
        newRule = {
            ...newRule,
            pattern: "",
            color: "#FE0000"
        };
    }

    if (!Array.isArray(entry.rules)) {
        entry.rules = microCreateDefaultRules();
    }

    const insertPos = Math.max(0, Math.min(position - 1, entry.rules.length));
    entry.rules.splice(insertPos, 0, newRule);
    microRenderRulesGrid(document.querySelector("#micro-rules-grid-container"), entry);
    microRefreshMonitoredObjectColor(objectId);
}

function microBindRulesEditor(containerSelector) {
    const containerEl = document.querySelector(containerSelector);
    if (!containerEl) return;

    containerEl.addEventListener("change", async (event) => {
        const target = event.target;
        if (!target.classList.contains("rule-input")) return;

        const objectId = String(containerEl.dataset.objectId || "").trim();
        const entry = monitoredElements.get(objectId);
        if (!entry) return;

        const ruleId = target.closest(".rule-content")?.dataset.ruleId;
        if (!ruleId) return;

        const rule = (entry.rules || []).find((item) => item.ruleId === ruleId);
        if (!rule) return;

        const field = target.dataset.field;
        let value = target.value;
        if (field === "value") {
            value = Number(value);
        }

        rule[field] = value;
        await microRefreshMonitoredObjectColor(objectId);
    });

    containerEl.addEventListener("click", async (event) => {
        const deleteButton = event.target.closest(".rule-delete");
        if (!deleteButton) return;

        const objectId = String(containerEl.dataset.objectId || "").trim();
        const entry = monitoredElements.get(objectId);
        if (!entry) return;

        const ruleId = deleteButton.dataset.ruleId;
        entry.rules = (entry.rules || []).filter((rule) => rule.ruleId !== ruleId);
        microRenderRulesGrid(containerEl, entry);
        await microRefreshMonitoredObjectColor(objectId);
    });
}

function normalizeAssetNames(entityNames) {
    return Array.from(new Set((Array.isArray(entityNames) ? entityNames : [])
        .map((name) => String(name || "").trim())
        .filter(Boolean)));
}

function populateAssetDropdown(dropdownId, buttonId, entityNames, options = {}) {
    const dropdown = document.getElementById(dropdownId);
    const actionBtn = document.getElementById(buttonId);
    if (!dropdown || !actionBtn) return;

    const includeCurrentAsset = options.includeCurrentAsset === true;
    const selectCurrentAsset = options.selectCurrentAsset === true;
    const currentAsset = getCurrentAssetRef();

    const names = normalizeAssetNames(entityNames);
    if (includeCurrentAsset && currentAsset && !names.includes(currentAsset)) {
        names.unshift(currentAsset);
    }

    dropdown.innerHTML = "";
    names.forEach((name) => {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = microTruncateLabel(name, 28);
        option.title = name;
        dropdown.appendChild(option);
    });

    if (selectCurrentAsset && currentAsset) {
        dropdown.value = currentAsset;
    }

    const hasOptions = dropdown.options.length > 0;
    dropdown.disabled = !hasOptions;
    actionBtn.disabled = !hasOptions;
}

function populateAssetSelector(entityNames) {
    populateAssetDropdown("asset-selector-dropdown", "asset-selector-load", entityNames);
}

function populateAssetSwitcher(entityNames) {
    populateAssetDropdown("asset-switch-select", "load-asset-button", entityNames, {
        includeCurrentAsset: true,
        selectCurrentAsset: true,
    });
}

async function switchToAsset(assetRef, source = "micro_map_switcher") {
    const selectedAsset = String(assetRef || "").trim();
    if (!selectedAsset) {
        console.warn("No asset selected for switch operation.");
        return;
    }

    if (selectedAsset === getCurrentAssetRef()) {
        return;
    }

    navigationContext.has_reference = true;
    navigationContext.asset_ref = selectedAsset;
    navigationContext.ref_type = "entity_name";
    navigationContext.source = source;
    navigationContext.svg_name = "";
    window.microMapNavigationContext = { ...navigationContext };

    saveLastSelectedAsset(selectedAsset);
    beginMicroMapLoading();
    try {
        clearCurrentPlanView();
        await initializeMapForCurrentAsset();
        await refreshAlertsFromMacroMapFallback();
    } finally {
        endMicroMapLoading();
    }

    const assetSwitcher = document.getElementById("asset-switch-select");
    if (assetSwitcher) {
        assetSwitcher.value = selectedAsset;
    }
}

async function initializeMapForCurrentAsset(preferredPlanName = null) {
    beginMicroMapLoading();
    try {
        const preferred = String(preferredPlanName || "").trim();
        const plans = await getPlansList(preferred || null);
        const planNames = Array.isArray(plans) ? plans : [];

        let initialPlanName = "";
        if (preferred && planNames.includes(preferred)) {
            initialPlanName = preferred;
        } else {
            const selectedPlanName = getSelectedPlanName();
            if (selectedPlanName && planNames.includes(selectedPlanName)) {
                initialPlanName = selectedPlanName;
            } else if (planNames.length > 0) {
                initialPlanName = planNames[0];
            }
        }

        if (initialPlanName) {
            const didLoad = await loadFloorPlanToDb(initialPlanName);
            if (didLoad) {
                setSidebarDrawerClosed(true);
                return;
            }
        }

        clearCurrentPlanView();

        // When there is no floor plan for the selected asset, keep the menu open to guide the user.
        setSidebarDrawerClosed(false);
    } finally {
        endMicroMapLoading();
    }
}

async function initializeFloorPlanPresetButtons() {
    if (microFloorPlanPresetInitPromise) {
        return microFloorPlanPresetInitPromise;
    }

    const containers = $("#manage-sample-presets");
    if (!containers.length) return;

    const container = containers.first();
    if (containers.length > 1) {
        // If stale DOM copies exist, render only in the first container.
        containers.slice(1).empty();
    }

    microFloorPlanPresetInitPromise = (async function () {
        container.empty();

        try {
            const response = await $.ajax({
                url: "/micro_map/list_floor_plan_presets",
                method: "GET",
                dataType: "json"
            });

            const presets = Array.isArray(response?.presets) ? response.presets : [];
            if (presets.length === 0) {
                container.append($("<span>", { text: "No sample presets available" }));
                return;
            }

            const seen = new Set();
            presets.forEach((preset) => {
                const filename = String(preset?.filename || "").trim();
                const displayName = String(preset?.display_name || filename).trim();
                const dedupeKey = `${displayName.toLowerCase()}::${filename.toLowerCase()}`;
                if (!filename || seen.has(dedupeKey)) return;
                seen.add(dedupeKey);

                const button = $("<button>", {
                    type: "button",
                    class: "btn btn-primary",
                    text: displayName,
                    "data-preset-key": dedupeKey
                });

                button.on("click", async function () {
                    await applyFloorPlanPresetToMissingAssets(filename);
                });

                container.append(button);
            });
        } catch (error) {
            console.error("Failed to load floor plan presets", error);
            container.append($("<span>", { text: "Failed to load presets" }));
        }
    })();

    try {
        await microFloorPlanPresetInitPromise;
    } finally {
        microFloorPlanPresetInitPromise = null;
    }
}

async function applyFloorPlanPresetToMissingAssets(filename = MICRO_DEFAULT_FLOOR_PRESET) {
    const presetFilename = String(filename || "").trim();
    if (!presetFilename) {
        console.warn("Missing sample preset filename.");
        return;
    }

    let assets = [];
    try {
        const macroState = await fetchMacroMapState();
        assets = extractMacroMapAssets(macroState)
            .map((asset) => String(asset.entity_name || "").trim())
            .filter(Boolean);
    } catch (error) {
        console.error("Failed to retrieve assets from Macro Map state", error);
        return;
    }

    const currentAsset = ensureCurrentAssetRef({ warn: false });
    if (currentAsset && !assets.includes(currentAsset)) {
        assets.push(currentAsset);
    }

    const uniqueAssets = Array.from(new Set(assets));
    if (!uniqueAssets.length) {
        console.warn("No assets available to apply the sample floor plan.");
        return;
    }

    try {
        const response = await $.ajax({
            url: "/micro_map/apply_floor_plan_preset_to_missing",
            method: "POST",
            dataType: "json",
            data: {
                filename: presetFilename,
                asset_refs: JSON.stringify(uniqueAssets)
            }
        });

        const savedPlanName = String(response?.svg_name || "").trim();
        const availablePlans = currentAsset ? await getPlansList(savedPlanName || null) : [];

        if (currentAsset) {
            const planToLoad = (savedPlanName && availablePlans.includes(savedPlanName))
                ? savedPlanName
                : (availablePlans[0] || "");

            if (planToLoad) {
                const loaded = await loadFloorPlanToDb(planToLoad);
                if (loaded) {
                    setSidebarDrawerClosed(true);
                    return;
                }
            }

            clearCurrentPlanView();
            setSidebarDrawerClosed(false);
            await refreshAlertsForCurrentMap();
        }
    } catch (error) {
        console.error("Failed to apply sample floor plan", error);
    }
}

async function initializeListeners() {
    // The selector card does not exist in the DOM by default. Make sure any
    // stale instance from a previous render is gone before we start.
    removeAssetSelector();

    const navCtx = await loadNavigationContext();
    await initializeFloorPlanPresetButtons();

    const safeAddEventListener = (id, eventName, handler) => {
        const el = document.getElementById(id);
        if (!el) {
            console.warn(`[initializeListeners] Missing element #${id}, skipping ${eventName} listener.`);
            return;
        }
        el.addEventListener(eventName, handler);
    };
    // syncMicroMapContainerOffset();
    // window.addEventListener("resize", syncMicroMapContainerOffset);

    safeAddEventListener("load-plan-button", "click", function () {
        loadFloorPlanToDb()
    });

    safeAddEventListener("refresh-data-micro", "click", async function () {
        await refreshMicroData();
    });

    safeAddEventListener("manage-floor-plans", "click", async function () {
        await getPlansList(getSelectedPlanName() || null);
        openManageFloorPlansModal();
    });

    safeAddEventListener("close-manage-floor-plans-modal", "click", function () {
        closeManageFloorPlansModal();
    });

    safeAddEventListener("close-micro-rules-modal", "click", function () {
        closeMicroRulesModal();
    });

    safeAddEventListener("micro-modal-mask", "click", function () {
        closeManageFloorPlansModal();
        closeMicroRulesModal();
    });

    safeAddEventListener("micro-add-rule-button", "click", function () {
        $("#micro-add-rule-button").css("display", "none");
        $("#micro-insert-rules-div").css("display", "flex");
    });

    safeAddEventListener("micro-cancel-rules-button", "click", function () {
        $("#micro-add-rule-button").css("display", "flex");
        $("#micro-insert-rules-div").css("display", "none");
    });

    safeAddEventListener("micro-insert-rules-button", "click", function () {
        microAddRuleToSelectedObject();
        $("#micro-add-rule-button").css("display", "flex");
        $("#micro-insert-rules-div").css("display", "none");
    });

    safeAddEventListener("download-svg-guide", "click", function (e) {
        e.preventDefault();
        e.stopPropagation();
        e.stopImmediatePropagation();

        $.ajax({
            url: "/micro_map/download_svg_guide",
            method: "POST",
            dataType: "json",
            data: {}
        }).done(function (res) {
            if (!res || res.status !== "success") { console.error("Download failed"); return; }
            downloadBase64File(res.filename, res.content_type, res.data_base64);
        }).fail(function (xhr) {
            console.error(xhr.status, xhr.responseText);
            console.error("Download failed");
        });

        return false;
    });

    safeAddEventListener("manage-select-svg-button", "click", function () {
        const fileInput = document.getElementById("manage-svg-file-input");
        if (fileInput) fileInput.click();
    });

    safeAddEventListener("manage-clear-svg-button", "click", function () {
        selectedManageSvgName = "";
        selectedManageSvgText = "";
        $("#manage-svg-filename").val("");
        $("#manage-svg-file-input").val("");
    });

    safeAddEventListener("manage-svg-file-input", "change", function (event) {
        const file = event.target.files && event.target.files[0];
        if (!file) return;

        const isSvg = (file.type && file.type.includes("svg")) || (file.name || "").toLowerCase().endsWith(".svg");
        if (!isSvg) {
            console.warn("Please select an SVG file.");
            selectedManageSvgName = "";
            selectedManageSvgText = "";
            $("#manage-svg-filename").val("");
            $("#manage-svg-file-input").val("");
            return;
        }

        selectedManageSvgName = String(file.name || "").trim();
        $("#manage-svg-filename").val(selectedManageSvgName);

        const reader = new FileReader();
        reader.onload = function (e) {
            selectedManageSvgText = String((e && e.target && e.target.result) || "");
        };
        reader.onerror = function () {
            selectedManageSvgName = "";
            selectedManageSvgText = "";
            $("#manage-svg-filename").val("");
            $("#manage-svg-file-input").val("");
            console.warn("Failed to read SVG file.");
        };

        reader.readAsText(file);
    });

    safeAddEventListener("manage-upload-save-button", "click", async function () {
        await uploadAndSaveFloorPlanFromModal();
    });

    safeAddEventListener("manage-delete-plan-button", "click", async function () {
        const selectedPlan = String($("#manage-delete-plan-dropdown").val() || "").trim();
        await deleteSelectedPlanFromDb(selectedPlan);
    });

    safeAddEventListener("manage-reset-plugin-button", "click", async function () {
        await resetMicroPluginState();
    });

    detachMicroMapDocumentHandlers();
    $(document).on(`click${MICRO_MAP_DOC_EVENT_NS}`, function (event) {
        // If micro map DOM is not present anymore, do not touch shared popovers.
        if (!document.getElementById("main-map") || !document.getElementById("svg-container")) {
            return;
        }

        const target = event.target;
        if ($(target).closest("#MicroPopoverOption").length === 0) {
            hideContextMenu();
        }
    });

    $("#alerts_table_by_target_ip").on("click", async function (event) {
        event.preventDefault();
        event.stopPropagation();

        const objectId = selectedMonitoredObjectId || $("#MicroPopoverOption").attr("data-selected-object-id");
        if (!objectId) {
            console.warn("No selected monitored object for context menu action.");
            return;
        }

        const entry = monitoredElements.get(objectId);
        if (!entry) {
            console.warn("No monitored entry found for context menu action:", objectId);
            return;
        }

        await navigateToAlertsTableByTargetIp(entry.target);
        hideContextMenu();
    });

    $("#micro_edit_rules").on("click", function (event) {
        event.preventDefault();
        event.stopPropagation();

        const objectId = microGetSelectedObjectId();
        if (!objectId) {
            console.warn("No selected monitored object for rule editing.");
            return;
        }

        openMicroRulesModal(objectId);
        hideContextMenu();
    });

    safeAddEventListener("return-to-map", "click", async function () {
        await navigateToMacroMap();
    });

    safeAddEventListener("sidebar-toggle", "click", function () {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;
        sidebar.classList.toggle("drawer-closed");
    });

    safeAddEventListener("sidebar-close", "click", function () {
        const sidebar = document.getElementById("sidebar");
        if (!sidebar) return;
        sidebar.classList.add("drawer-closed");
    });

    safeAddEventListener("floor-plan-select", "change", function () {});

    safeAddEventListener("load-asset-button", "click", async function () {
        const dropdown = document.getElementById("asset-switch-select");
        const selectedAsset = dropdown ? String(dropdown.value || "").trim() : "";
        await switchToAsset(selectedAsset, "micro_map_sidebar");
    });

    safeAddEventListener("blink-connected-random", "click", blinkRandomConnectedElement);

    safeAddEventListener("blink-random", "click", blinkRandomElement);

    microBindRulesEditor("#micro-rules-grid-container");

    // PRIORITY: Direct navigation from Macro with context – handle immediately
    // before any other AJAX calls that might interfere on first visit.
    if (navCtx && navCtx.has_reference && navCtx.asset_ref) {
        setMainUiVisible(true);
        saveLastSelectedAsset(navCtx.asset_ref);

        const targetPlan = String(navCtx.svg_name || "").trim();
        await initializeMapForCurrentAsset(targetPlan || null);

        try {
            const names = await fetchMacroMapEntityNames();
            populateAssetSwitcher(names);
        } catch (_) {
            populateAssetSwitcher([]);
        }
        return;
    }

    setMainUiVisible(false);
    removeAssetSelector();

    let availableEntityNames = [];
    try {
        availableEntityNames = await fetchMacroMapEntityNames();
    } catch (error) {
        console.error("Failed to load assets from Macro Map:", error);
        availableEntityNames = [];
    }

    populateAssetSelector(availableEntityNames);
    populateAssetSwitcher(availableEntityNames);

    const initialAssetRef = ensureCurrentAssetRef({ warn: false });
    if (initialAssetRef) {
        saveLastSelectedAsset(initialAssetRef);
        populateAssetSwitcher(availableEntityNames);
        setMainUiVisible(true);
        await initializeMapForCurrentAsset(String(navCtx.svg_name || "").trim());
        return;
    }

    let selectorEntities = availableEntityNames;
    let selectorMessage = "";
    try {
        const savedAssetRef = loadLastSelectedAsset();
        if (savedAssetRef && availableEntityNames.includes(savedAssetRef)) {
            navigationContext.has_reference = true;
            navigationContext.asset_ref = savedAssetRef;
            navigationContext.ref_type = "entity_name";
            navigationContext.source = "micro_map_local_storage";
            navigationContext.svg_name = "";
            window.microMapNavigationContext = { ...navigationContext };

            populateAssetSwitcher(availableEntityNames);
            setMainUiVisible(true);
            await initializeMapForCurrentAsset();
            await refreshAlertsFromMacroMapFallback();
            return;
        }

        selectorMessage = availableEntityNames.length > 0
            ? "Select an asset from Macro Map to continue."
            : "No assets have been loaded on the macro map yet. Please upload some assets before trying again.";
    } catch (error) {
        console.error("Failed to load assets from Macro Map:", error);
        populateAssetSwitcher([]);
        selectorEntities = [];
        selectorMessage = "Cannot load assets from Macro Map right now.";
    }

    setMainUiVisible(false);
    showAssetSelector(selectorEntities, selectorMessage);
}

function ensureTrackedTooltipElement() {
    if (trackedTooltipState.element) return trackedTooltipState.element;

    const tooltip = document.createElement("div");
    tooltip.className = "micro-map-tooltip";
    tooltip.style.display = "none";
    document.body.appendChild(tooltip);

    trackedTooltipState.element = tooltip;
    return tooltip;
}

function setTooltipPlacementClass(tooltip, placement) {
    const classes = [
        "micro-map-tooltip-placement-top",
        "micro-map-tooltip-placement-right",
        "micro-map-tooltip-placement-bottom",
        "micro-map-tooltip-placement-left",
    ];

    classes.forEach((c) => tooltip.classList.remove(c));
    tooltip.classList.add(`micro-map-tooltip-placement-${placement}`);
}

function getDefaultTooltipAlertData() {
    return { target_ip: "", a_high: 0, a_medium: 0, a_low: 0, a_info: 0 };
}

function setTrackedTooltipContent(objectId, tooltipData) {
    if (!tooltipData || typeof tooltipData !== "object") {
        alertTooltipDataByObjectId.delete(objectId);
        return;
    }

    const previous = alertTooltipDataByObjectId.get(objectId) || getDefaultTooltipAlertData();
    const nextTargetIp = String(tooltipData.target_ip || "").trim() || previous.target_ip || "";

    const parsed = {
        target_ip: nextTargetIp,
        a_high: Number.isFinite(Number(tooltipData.a_high)) ? Number(tooltipData.a_high) : 0,
        a_medium: Number.isFinite(Number(tooltipData.a_medium)) ? Number(tooltipData.a_medium) : 0,
        a_low: Number.isFinite(Number(tooltipData.a_low)) ? Number(tooltipData.a_low) : 0,
        a_info: Number.isFinite(Number(tooltipData.a_info)) ? Number(tooltipData.a_info) : 0,
    };

    alertTooltipDataByObjectId.set(objectId, parsed);
}

function getAlertsHtmlForTooltip(entity) {
    const colors = {
        high: "#FE0000",
        medium: "#f0ad4e",
        low: "#5cb85c",
        info: "#5bc0de"
    };

    return `
    <div style="font-size: 12px; line-height: 1.25; color: #444; text-align: center;">
        <strong>IP:</strong> ${entity.target_ip || "-"}
    </div>
    <div style="margin-top: 10px; border-top: 1px solid #ccc; padding-top: 8px; display: flex; gap: 4px; justify-content: center;">
        <div style="background:${colors.high}; color:white; padding:2px 6px; border-radius:3px; font-weight:bold;" title="High">${entity.a_high || 0}</div>
        <div style="background:${colors.medium}; color:white; padding:2px 6px; border-radius:3px; font-weight:bold;" title="Medium">${entity.a_medium || 0}</div>
        <div style="background:${colors.low}; color:white; padding:2px 6px; border-radius:3px; font-weight:bold;" title="Low">${entity.a_low || 0}</div>
        <div style="background:${colors.info}; color:white; padding:2px 6px; border-radius:3px; font-weight:bold;" title="Info">${entity.a_info || 0}</div>
    </div>`;
}

function renderTrackedTooltip(objectId) {
    const tooltip = ensureTrackedTooltipElement();
    const alertData = alertTooltipDataByObjectId.get(objectId) || getDefaultTooltipAlertData();
    const tooltipHtml = `
      <div style="text-align: center; min-width: 120px; padding: 2px;">
        ${getAlertsHtmlForTooltip(alertData)}
      </div>
      <div class="micro-map-tooltip-arrow"></div>
    `;
    tooltip.innerHTML = tooltipHtml;
}

function positionTrackedTooltipForShape(shape) {
    const tooltip = ensureTrackedTooltipElement();
    if (!shape || typeof shape.getBoundingClientRect !== "function") return;

    const container = document.getElementById("svg-container");
    if (!container || typeof container.getBoundingClientRect !== "function") return;

    const viewportMargin = 12;
    const tooltipGap = 10;
    const shapeRect = shape.getBoundingClientRect();
    const containerRect = container.getBoundingClientRect();

    const centerX = shapeRect.left + (shapeRect.width / 2);
    const centerY = shapeRect.top + (shapeRect.height / 2);

    const tooltipRect = tooltip.getBoundingClientRect();
    const tooltipWidth = tooltipRect.width;
    const tooltipHeight = tooltipRect.height;

    const horizontalRoom = Math.max(120, containerRect.width - (viewportMargin * 2));
    tooltip.style.maxWidth = `${Math.floor(horizontalRoom)}px`;

    const availableTop = shapeRect.top - containerRect.top;
    const availableBottom = containerRect.bottom - shapeRect.bottom;
    const availableLeft = shapeRect.left - containerRect.left;
    const availableRight = containerRect.right - shapeRect.right;

    let placement = "top";

    if (availableTop >= tooltipHeight + tooltipGap + viewportMargin) {
        placement = "top";
    } else if (availableBottom >= tooltipHeight + tooltipGap + viewportMargin) {
        placement = "bottom";
    } else if (availableRight >= tooltipWidth + tooltipGap + viewportMargin) {
        placement = "right";
    } else if (availableLeft >= tooltipWidth + tooltipGap + viewportMargin) {
        placement = "left";
    } else {
        const verticalBest = Math.max(availableTop, availableBottom);
        const horizontalBest = Math.max(availableLeft, availableRight);
        if (horizontalBest > verticalBest) {
            placement = availableRight >= availableLeft ? "right" : "left";
        } else {
            placement = availableBottom >= availableTop ? "bottom" : "top";
        }
    }

    let left = 0;
    let top = 0;

    if (placement === "top") {
        left = centerX - (tooltipWidth / 2);
        top = shapeRect.top - tooltipHeight - tooltipGap;
    } else if (placement === "bottom") {
        left = centerX - (tooltipWidth / 2);
        top = shapeRect.bottom + tooltipGap;
    } else if (placement === "right") {
        left = shapeRect.right + tooltipGap;
        top = centerY - (tooltipHeight / 2);
    } else {
        left = shapeRect.left - tooltipWidth - tooltipGap;
        top = centerY - (tooltipHeight / 2);
    }

    left = Math.max(
        containerRect.left + viewportMargin,
        Math.min(left, containerRect.right - tooltipWidth - viewportMargin)
    );
    top = Math.max(
        containerRect.top + viewportMargin,
        Math.min(top, containerRect.bottom - tooltipHeight - viewportMargin)
    );

    tooltip.style.left = `${Math.round(left)}px`;
    tooltip.style.top = `${Math.round(top)}px`;
    setTooltipPlacementClass(tooltip, placement);
}

function showTrackedTooltip(anchorElement, objectId) {
    renderTrackedTooltip(objectId);

    const tooltip = ensureTrackedTooltipElement();
    tooltip.style.display = "block";
    trackedTooltipState.objectId = objectId;
    positionTrackedTooltipForShape(anchorElement);
}

function hideTrackedTooltip() {
    if (!trackedTooltipState.element) return;
    trackedTooltipState.element.style.display = "none";
    trackedTooltipState.objectId = null;
}

function registerTrackedElementTooltip(objectId, anchorElement) {
    if (!anchorElement) return;

    anchorElement.addEventListener("mouseover", (event) => {
        const fromElement = event.relatedTarget;
        if (fromElement && anchorElement.contains(fromElement)) return;
        showTrackedTooltip(anchorElement, objectId);
    });

    anchorElement.addEventListener("mousemove", () => {
        if (trackedTooltipState.objectId !== objectId) return;
        positionTrackedTooltipForShape(anchorElement);
    });

    anchorElement.addEventListener("mouseout", (event) => {
        const toElement = event.relatedTarget;
        if (toElement && anchorElement.contains(toElement)) return;
        hideTrackedTooltip();
    });

    anchorElement.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();

        selectedMonitoredObjectId = objectId;
        $("#MicroPopoverOption").attr("data-selected-object-id", objectId);
        showContextMenuAtPosition(event.clientX, event.clientY);
    });

    anchorElement.addEventListener("contextmenu", (event) => {
        event.preventDefault();
        event.stopPropagation();

        selectedMonitoredObjectId = objectId;
        $("#MicroPopoverOption").attr("data-selected-object-id", objectId);
        showContextMenuAtPosition(event.clientX, event.clientY);
    });
}

function computeSeverityPercentages(severityCount) {
    const high = Number(severityCount.High || 0);
    const medium = Number(severityCount.Medium || 0);
    const low = Number(severityCount.Low || 0);
    const sum = high + medium + low;

    if (sum <= 0) {
        return { sum: 0, high: 0, medium: 0, low: 0 };
    }

    return {
        sum,
        high: (high / sum) * 100,
        medium: (medium / sum) * 100,
        low: (low / sum) * 100,
    };
}

function evaluateDefaultColorRule(rule, percentages) {
    if (!rule || rule.ruleType !== "percentage") return false;

    const metric = (rule.metric || "").toLowerCase();
    const metricValue = percentages[metric];
    const threshold = Number(rule.value);

    if (!Number.isFinite(metricValue) || !Number.isFinite(threshold)) {
        return false;
    }

    switch (rule.operator) {
        case ">=": return metricValue >= threshold;
        case ">": return metricValue > threshold;
        case "<=": return metricValue <= threshold;
        case "<": return metricValue < threshold;
        case "==": return metricValue === threshold;
        default: return false;
    }
}

function resolveDefaultColorFromRules(severityCount) {
    const percentages = computeSeverityPercentages(severityCount);

    for (const rule of DEFAULT_COLOR_RULES) {
        if (evaluateDefaultColorRule(rule, percentages)) {
            return rule.color;
        }
    }

    return "#5cb85c";
}

function updateColor(id, newColor) {
    const data = monitoredElements.get(id);
    if (!data) {
        console.warn(`No element found for ID: ${id}`);
        return;
    }

    const { shapes } = data;

    shapes.forEach(shape => {
        applySmartColorToShape(shape, newColor);
    });
}

function normalizePaintValue(value) {
    return String(value || "").trim().toLowerCase();
}

function isPaintNoneOrTransparent(value) {
    const paint = normalizePaintValue(value);
    if (!paint) return true;
    return paint === "none" || paint === "transparent" || paint === "rgba(0,0,0,0)";
}

function isWhiteLikePaint(value) {
    const paint = normalizePaintValue(value);
    if (!paint) return false;

    if (paint.includes("#fff") || paint.includes("#ffffff") || paint.includes("rgb(255")) {
        return true;
    }

    return paint.includes("#fafafa") || paint.includes("rgb(250") || paint.includes("rgb(249");
}

function readStylePaint(shape, prop) {
    const style = shape.getAttribute("style") || "";
    const regex = new RegExp(`${prop}\\s*:\\s*([^;!]+)`, "i");
    const match = style.match(regex);
    return match ? match[1].trim() : "";
}

function getShapePaint(shape, prop) {
    const fromStyle = readStylePaint(shape, prop);
    if (fromStyle) return fromStyle;
    return String(shape.getAttribute(prop) || "").trim();
}

function setShapePaint(shape, prop, value) {
    const currentStyle = shape.getAttribute("style") || "";
    const cleanedStyle = currentStyle
        .replace(new RegExp(`${prop}\\s*:\\s*[^;]+;?`, "gi"), "")
        .trim();
    const nextStyle = `${cleanedStyle}; ${prop}: ${value} !important;`;
    shape.setAttribute("style", nextStyle);
}

function applySmartColorToShape(shape, newColor) {
    const strokePaint = getShapePaint(shape, "stroke");
    const fillPaint = getShapePaint(shape, "fill");

    const hasStroke = !isPaintNoneOrTransparent(strokePaint);
    const hasFill = !isPaintNoneOrTransparent(fillPaint);

    // Skip helper hitboxes and purely invisible geometry.
    if (!hasStroke && !hasFill) {
        return;
    }

    if (hasStroke) {
        setShapePaint(shape, "stroke", newColor);
        return;
    }

    if (hasFill && !isWhiteLikePaint(fillPaint)) {
        setShapePaint(shape, "fill", newColor);
        return;
    }

    // Last fallback for fill-only white shapes.
    if (hasFill) {
        setShapePaint(shape, "fill", newColor);
    }
}

function extractComparableIp(value) {
    if (value == null) return "";

    if (Array.isArray(value)) {
        for (const item of value) {
            const extracted = extractComparableIp(item);
            if (extracted) return extracted;
        }
        return "";
    }

    const text = String(value || "").trim();
    if (!text) return "";

    const ipv4Match = text.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/);
    if (ipv4Match) return ipv4Match[0];

    const ipv6Match = text.match(/\b(?:[a-f0-9]{1,4}:){2,}[a-f0-9:]{1,4}\b/i);
    if (ipv6Match) return ipv6Match[0].toLowerCase();

    return text;
}

function normalizeAlertJoinKey(value) {
    return extractComparableIp(value);
}

function normalizeMicroMatchKey(value) {
    const key = normalizeAlertJoinKey(value);
    return String(key || "").trim().toLowerCase();
}

function microGetObjectAttr(obj, name) {
    return String(obj.getAttribute(name) || "").trim();
}

function microPickFirstNonEmpty(values) {
    for (const value of values) {
        const normalized = String(value || "").trim();
        if (normalized) return normalized;
    }
    return "";
}

function microGetAlertCameraCandidateKeys(row) {
    if (!row || typeof row !== "object") return [];

    const rawKeys = [
        row.sensor_ip,
        row.target_ip,

        row.sensor_hostname,
        row.sensor_name,
        row.sensor_id,

        row.analyzer_ip,
        row.analyzer_hostname,
        row.analyzer_name,
        row.analyzer,

        row.target_hostname,
        row.target_id,

        row.source_ip,
        row.source_hostname,
        row.source_id,
    ];

    return Array.from(new Set(
        rawKeys
            .map(normalizeMicroMatchKey)
            .filter(Boolean)
    ));
}

function microGetCameraCandidateKeys(entry) {
    if (!entry || typeof entry !== "object") return [];

    const rawKeys = [
        entry.sensor_ip,
        entry.target,

        entry.sensor_hostname,
        entry.sensor_name,
        entry.sensor_id,

        entry.analyzer_ip,
        entry.analyzer_hostname,
        entry.analyzer_name,

        entry.location,
        entry.sensor_location,
    ];

    return Array.from(new Set(
        rawKeys
            .map(normalizeMicroMatchKey)
            .filter(Boolean)
    ));
}

function microIsCameraEntry(entry) {
    if (!entry || typeof entry !== "object") return false;

    return (
        String(entry.type || "").toLowerCase() === "camera" ||
        !!entry.sensor_ip ||
        !!entry.sensor_name ||
        !!entry.sensor_hostname ||
        (!!entry.target && String(entry.type || "").toLowerCase() !== "beam")
    );
}

function microFindCameraForAlert(row) {
    const alertKeys = microGetAlertCameraCandidateKeys(row);
    if (!alertKeys.length) return null;

    for (const [objectId, entry] of monitoredElements.entries()) {
        if (!microIsCameraEntry(entry)) continue;

        const cameraKeys = microGetCameraCandidateKeys(entry);
        const matchedKey = alertKeys.find((key) => cameraKeys.includes(key));

        if (matchedKey) {
            return {
                objectId,
                entry,
                matchedKey,
                alertKeys,
                cameraKeys
            };
        }
    }

    return {
        objectId: null,
        entry: null,
        matchedKey: "",
        alertKeys,
        cameraKeys: []
    };
}

function microFindBeamForCamera(cameraEntry) {
    if (!cameraEntry || !cameraEntry.connection) return null;

    const connectedIds = connectedElementsMap.get(cameraEntry.connection) || [];
    const beamId = connectedIds.find((id) => {
        const entry = monitoredElements.get(id);
        return String(entry?.type || "").toLowerCase() === "beam";
    });

    if (!beamId) {
        return {
            objectId: null,
            entry: null,
            connectedIds
        };
    }

    return {
        objectId: beamId,
        entry: monitoredElements.get(beamId),
        connectedIds
    };
}

function microDebugResolveDetectionMarkers(alertRows) {
    const rows = Array.isArray(alertRows) ? alertRows : [];

    const results = rows.map((row, index) => {
        const cameraMatch = microFindCameraForAlert(row);
        const beamMatch = cameraMatch?.entry ? microFindBeamForCamera(cameraMatch.entry) : null;

        return {
            index,
            alert: {
                target_ip: row?.target_ip || null,
                sensor_ip: row?.sensor_ip || null,
                sensor_name: row?.sensor_name || null,
                sensor_hostname: row?.sensor_hostname || null,
                source_category: row?.source_category || null,
                source_location: row?.source_location || null,
                source_geolocation: row?.source_geolocation || null
            },
            camera: cameraMatch?.entry ? {
                objectId: cameraMatch.objectId,
                matchedKey: cameraMatch.matchedKey,
                target: cameraMatch.entry.target || null,
                type: cameraMatch.entry.type || null,
                connection: cameraMatch.entry.connection || null,
                sensor_ip: cameraMatch.entry.sensor_ip || null,
                sensor_name: cameraMatch.entry.sensor_name || null,
                sensor_hostname: cameraMatch.entry.sensor_hostname || null,
                sensor_location: cameraMatch.entry.sensor_location || null,
                sensor_geolocation: cameraMatch.entry.sensor_geolocation || null
            } : null,
            beam: beamMatch?.entry ? {
                objectId: beamMatch.objectId,
                type: beamMatch.entry.type || null,
                connection: beamMatch.entry.connection || null,
                beam_id: beamMatch.entry.beam_id || null,
                location: beamMatch.entry.location || null,
                fallback_position: beamMatch.entry.fallback_position || null,
                marker_x_ratio: beamMatch.entry.marker_x_ratio || null,
                marker_y_ratio: beamMatch.entry.marker_y_ratio || null,
                azimuth_deg: beamMatch.entry.azimuth_deg || null,
                horizontal_fov_deg: beamMatch.entry.horizontal_fov_deg || null,
                vertical_fov_deg: beamMatch.entry.vertical_fov_deg || null,
                range_m: beamMatch.entry.range_m || null
            } : null,
            debug: {
                alertKeys: cameraMatch?.alertKeys || [],
                cameraKeys: cameraMatch?.cameraKeys || [],
                connectedIds: beamMatch?.connectedIds || []
            }
        };
    });

    console.log("[Micro Map] detection resolver results", results);
    return results;
}

function microEnsureDetectionOverlay(svgElement) {
    const ns = "http://www.w3.org/2000/svg";
    let overlay = svgElement.querySelector("#micro-detection-overlay");

    if (!overlay) {
        overlay = document.createElementNS(ns, "g");
        overlay.setAttribute("id", "micro-detection-overlay");
        overlay.setAttribute("class", "micro-detection-overlay");
        svgElement.appendChild(overlay);
    }

    return overlay;
}

function microClearDetectionMarkers() {
    const container = document.getElementById("svg-container");
    const svgElement = container ? container.querySelector("svg") : null;
    const overlay = svgElement ? svgElement.querySelector("#micro-detection-overlay") : null;

    if (overlay) {
        overlay.innerHTML = "";
    }
}

function microParseRatio(value, fallback = 0.5) {
    const parsed = Number.parseFloat(value);
    if (!Number.isFinite(parsed)) return fallback;
    return Math.max(0, Math.min(1, parsed));
}

function microGetSvgPointFromClientPoint(svgElement, clientX, clientY) {
    if (!svgElement || typeof svgElement.createSVGPoint !== "function") {
        return { x: clientX, y: clientY };
    }

    const point = svgElement.createSVGPoint();
    point.x = clientX;
    point.y = clientY;

    const ctm = svgElement.getScreenCTM();
    if (!ctm) {
        return { x: clientX, y: clientY };
    }

    return point.matrixTransform(ctm.inverse());
}

function microGetBeamMarkerPosition(svgElement, beamEntry) {
    if (!svgElement || !beamEntry || !beamEntry.visualGroup) {
        return null;
    }

    const bbox = beamEntry.visualGroup.getBoundingClientRect();
    if (!bbox || bbox.width <= 0 || bbox.height <= 0) {
        return null;
    }

    const xRatio = microParseRatio(beamEntry.marker_x_ratio, 0.5);
    const yRatio = microParseRatio(beamEntry.marker_y_ratio, 0.5);

    const clientX = bbox.left + (bbox.width * xRatio);
    const clientY = bbox.top + (bbox.height * yRatio);

    return microGetSvgPointFromClientPoint(svgElement, clientX, clientY);
}

function microClampNumber(value, min, max) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed)) return min;
    return Math.max(min, Math.min(max, parsed));
}

function microDegToRad(value) {
    return Number(value) * Math.PI / 180;
}

function microRadToDeg(value) {
    return Number(value) * 180 / Math.PI;
}

function microNormalizeAngleDeltaDeg(value) {
    let angle = Number(value);
    if (!Number.isFinite(angle)) return null;

    while (angle > 180) angle -= 360;
    while (angle < -180) angle += 360;

    return angle;
}

function microParseGeoLocation(value) {
    if (value == null) return null;

    if (Array.isArray(value)) {
        for (const item of value) {
            const parsed = microParseGeoLocation(item);
            if (parsed) return parsed;
        }
        return null;
    }

    if (typeof value === "object") {
        const lat = Number(value.lat ?? value.latitude ?? value.Latitude);
        const lon = Number(value.lon ?? value.lng ?? value.longitude ?? value.Longitude);
        const alt = Number(value.alt ?? value.altitude ?? value.Altitude ?? 0);

        if (Number.isFinite(lat) && Number.isFinite(lon)) {
            return { lat, lon, alt: Number.isFinite(alt) ? alt : 0 };
        }

        return null;
    }

    const text = String(value || "").trim();
    if (!text) return null;

    const numbers = text.match(/-?\d+(?:\.\d+)?/g);
    if (!numbers || numbers.length < 2) return null;

    const lat = Number(numbers[0]);
    const lon = Number(numbers[1]);
    const alt = numbers.length >= 3 ? Number(numbers[2]) : 0;

    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;

    return {
        lat,
        lon,
        alt: Number.isFinite(alt) ? alt : 0
    };
}

function microDistanceMeters(from, to) {
    if (!from || !to) return null;

    const earthRadiusMeters = 6371000;
    const lat1 = microDegToRad(from.lat);
    const lat2 = microDegToRad(to.lat);
    const dLat = microDegToRad(to.lat - from.lat);
    const dLon = microDegToRad(to.lon - from.lon);

    const a =
        Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1) * Math.cos(lat2) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return earthRadiusMeters * c;
}

function microBearingDeg(from, to) {
    if (!from || !to) return null;

    const lat1 = microDegToRad(from.lat);
    const lat2 = microDegToRad(to.lat);
    const dLon = microDegToRad(to.lon - from.lon);

    const y = Math.sin(dLon) * Math.cos(lat2);
    const x =
        Math.cos(lat1) * Math.sin(lat2) -
        Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLon);

    const bearing = (microRadToDeg(Math.atan2(y, x)) + 360) % 360;
    return bearing;
}

function microParseCaptureZone(value) {
    if (!value) return null;

    if (Array.isArray(value)) {
        for (const item of value) {
            const parsed = microParseCaptureZone(item);
            if (parsed) return parsed;
        }
        return null;
    }

    if (typeof value === "object") {
        return value;
    }

    const text = String(value || "").trim();
    if (!text) return null;

    try {
        const parsed = JSON.parse(text);
        return microParseCaptureZone(parsed);
    } catch (_error) {
        return null;
    }
}

function microPickNumericField(source, fieldNames) {
    if (!source || typeof source !== "object") return null;

    for (const fieldName of fieldNames) {
        const value = Number(source[fieldName]);
        if (Number.isFinite(value)) {
            return value;
        }
    }

    return null;
}

function microGetCameraCoverageNumber(row, beamEntry, fieldNames, fallback = null) {
    const captureZone = microParseCaptureZone(row?.sensor_capturezone);
    const fromCaptureZone = microPickNumericField(captureZone, fieldNames);

    if (fromCaptureZone !== null) {
        return fromCaptureZone;
    }

    const fromBeam = microPickNumericField(beamEntry, fieldNames);

    if (fromBeam !== null) {
        return fromBeam;
    }

    return fallback;
}

function microGetVisualCenterClient(entry) {
    if (!entry || !entry.visualGroup || typeof entry.visualGroup.getBoundingClientRect !== "function") {
        return null;
    }

    const rect = entry.visualGroup.getBoundingClientRect();
    if (!rect || rect.width <= 0 || rect.height <= 0) {
        return null;
    }

    return {
        x: rect.left + (rect.width / 2),
        y: rect.top + (rect.height / 2),
        rect
    };
}

function microGetBeamCoordinateFrame(cameraEntry, beamEntry) {
    const cameraCenter = microGetVisualCenterClient(cameraEntry);
    const beamCenter = microGetVisualCenterClient(beamEntry);

    if (!cameraCenter || !beamCenter) {
        return null;
    }

    const axisDx = beamCenter.x - cameraCenter.x;
    const axisDy = beamCenter.y - cameraCenter.y;
    const axisLength = Math.sqrt((axisDx * axisDx) + (axisDy * axisDy));

    if (!Number.isFinite(axisLength) || axisLength <= 0) {
        return null;
    }

    const axisX = axisDx / axisLength;
    const axisY = axisDy / axisLength;

    // Right side relative to the camera direction, in screen coordinates.
    const rightX = -axisY;
    const rightY = axisX;

    const rect = beamCenter.rect;
    const corners = [
        { x: rect.left, y: rect.top },
        { x: rect.right, y: rect.top },
        { x: rect.right, y: rect.bottom },
        { x: rect.left, y: rect.bottom }
    ];

    const projections = corners.map((corner) => {
        const dx = corner.x - cameraCenter.x;
        const dy = corner.y - cameraCenter.y;

        return {
            t: (dx * axisX) + (dy * axisY),
            l: (dx * rightX) + (dy * rightY)
        };
    });

    const positiveProjections = projections.filter((item) => item.t > 0);

    if (!positiveProjections.length) {
        return null;
    }

    const nearT = Math.max(0, Math.min(...positiveProjections.map((item) => item.t)));
    const farT = Math.max(...positiveProjections.map((item) => item.t));
    const maxL = Math.max(...positiveProjections.map((item) => Math.abs(item.l)));

    if (!Number.isFinite(farT) || farT <= nearT || !Number.isFinite(maxL) || maxL <= 0) {
        return null;
    }

    return {
        origin: cameraCenter,
        axisX,
        axisY,
        rightX,
        rightY,
        nearT,
        farT,
        maxL
    };
}

function microGetGeoBasedMarkerPosition(svgElement, row, cameraEntry, beamEntry) {
    const sourceGeo = microParseGeoLocation(row?.source_geolocation);
    const sensorGeo =
        microParseGeoLocation(row?.sensor_geolocation) ||
        microParseGeoLocation(cameraEntry?.sensor_geolocation);

    if (!svgElement || !row || !cameraEntry || !beamEntry || !sourceGeo || !sensorGeo) {
        return null;
    }

    const azimuthDeg = microGetCameraCoverageNumber(
        row,
        beamEntry,
        ["azimuth_deg", "azimuth"],
        null
    );

    const horizontalFovDeg = microGetCameraCoverageNumber(
        row,
        beamEntry,
        ["horizontal_fov_deg", "horizontal_fov"],
        null
    );

    const rangeM = microGetCameraCoverageNumber(
        row,
        beamEntry,
        ["range_m", "range"],
        null
    );

    if (
        !Number.isFinite(Number(azimuthDeg)) ||
        !Number.isFinite(Number(horizontalFovDeg)) ||
        !Number.isFinite(Number(rangeM)) ||
        Number(horizontalFovDeg) <= 0 ||
        Number(rangeM) <= 0
    ) {
        return null;
    }

    const distanceM = microDistanceMeters(sensorGeo, sourceGeo);
    const bearingDeg = microBearingDeg(sensorGeo, sourceGeo);

    if (!Number.isFinite(distanceM) || !Number.isFinite(bearingDeg)) {
        return null;
    }

    const angleDeltaDeg = microNormalizeAngleDeltaDeg(bearingDeg - Number(azimuthDeg));
    if (angleDeltaDeg === null) {
        return null;
    }

    const halfFovDeg = Number(horizontalFovDeg) / 2;
    const fovToleranceDeg = 5;

    // If the detected object is clearly outside the camera cone, keep the old fallback.
    if (Math.abs(angleDeltaDeg) > halfFovDeg + fovToleranceDeg) {
        console.warn("[Micro Map] Geo marker outside camera FOV, using fallback", {
            source_geolocation: row?.source_geolocation,
            sensor_geolocation: row?.sensor_geolocation || cameraEntry?.sensor_geolocation,
            azimuthDeg,
            bearingDeg,
            angleDeltaDeg,
            horizontalFovDeg
        });
        return null;
    }

    const frame = microGetBeamCoordinateFrame(cameraEntry, beamEntry);
    if (!frame) {
        return null;
    }

    const distanceRatio = microClampNumber(distanceM / Number(rangeM), 0, 1);
    const angleRatio = microClampNumber(angleDeltaDeg / halfFovDeg, -1, 1);

    const depthT = frame.nearT + ((frame.farT - frame.nearT) * distanceRatio);

    // Width grows with distance from the camera.
    // Keep a small minimum so very near detections remain visible and not glued to the axis.
    const lateralScale = Math.max(0.10, distanceRatio);
    const lateral = angleRatio * frame.maxL * lateralScale;

    const clientX = frame.origin.x + (frame.axisX * depthT) + (frame.rightX * lateral);
    const clientY = frame.origin.y + (frame.axisY * depthT) + (frame.rightY * lateral);

    const point = microGetSvgPointFromClientPoint(svgElement, clientX, clientY);

    point._geoDebug = {
        source_geolocation: row?.source_geolocation || null,
        sensor_geolocation: row?.sensor_geolocation || cameraEntry?.sensor_geolocation || null,
        distanceM,
        bearingDeg,
        azimuthDeg: Number(azimuthDeg),
        angleDeltaDeg,
        horizontalFovDeg: Number(horizontalFovDeg),
        rangeM: Number(rangeM),
        distanceRatio,
        angleRatio
    };

    return point;
}

function microGetMarkerTextForAlert(row) {
    const categories = Array.isArray(row?.source_category)
        ? row.source_category
        : [row?.source_category].filter(Boolean);

    if (categories.includes("Object.LivingBeings.Human")) {
        return "👤";
    }

    return "!";
}

function microAddDetectionMarker(svgElement, overlay, point, row, index) {
    if (!svgElement || !overlay || !point) return;

    const ns = "http://www.w3.org/2000/svg";
    const marker = document.createElementNS(ns, "g");
    marker.setAttribute("class", "micro-detection-marker");
    marker.setAttribute("data-alert-index", String(index));
    marker.setAttribute("transform", `translate(${point.x} ${point.y})`);

    const circle = document.createElementNS(ns, "circle");
    circle.setAttribute("r", "16");
    circle.setAttribute("fill", "#ffffff");
    circle.setAttribute("stroke", "#FE0000");
    circle.setAttribute("stroke-width", "3");

    const iconName = microResolveDetectionIconName(row);
    const icon = microCreateSvgIcon(ns, iconName, {
        size: 22,
        fill: "#FE0000"
    });

    marker.appendChild(circle);
    marker.appendChild(icon);

    const title = document.createElementNS(ns, "title");
    title.textContent = row?.description || "Detection marker";
    marker.appendChild(title);

    overlay.appendChild(marker);
}

function microRenderDetectionMarkers(alertRows) {
    const container = document.getElementById("svg-container");
    const svgElement = container ? container.querySelector("svg") : null;
    if (!svgElement) return;

    const overlay = microEnsureDetectionOverlay(svgElement);
    overlay.innerHTML = "";

    const resolved = microDebugResolveDetectionMarkers(alertRows);
    const placements = [];

    resolved.forEach((result) => {
        if (!result || !result.beam || !result.beam.objectId) return;

        const beamEntry = monitoredElements.get(result.beam.objectId);
        const cameraEntry = result.camera?.objectId
            ? monitoredElements.get(result.camera.objectId)
            : null;

        const row = Array.isArray(alertRows) ? alertRows[result.index] : null;

        const geoPoint = microGetGeoBasedMarkerPosition(
            svgElement,
            row,
            cameraEntry,
            beamEntry
        );

        const fallbackPoint = geoPoint
            ? null
            : microGetBeamMarkerPosition(svgElement, beamEntry);

        const point = geoPoint || fallbackPoint;

        if (!point) {
            console.warn("[Micro Map] Cannot compute detection marker position", result);
            return;
        }

        placements.push({
            index: result.index,
            row,
            result,
            cameraEntry,
            beamEntry,
            point,
            positionSource: geoPoint ? "geolocation" : "beam_ratio",
            geoDebug: geoPoint?._geoDebug || null
        });
    });

    microBuildOffsetMarkerPlacements(placements);

    console.log("[Micro Map] detection marker placements", placements.map((placement) => ({
        index: placement.index,
        icon: microResolveDetectionIconName(placement.row),
        source_category: placement.row?.source_category || null,
        source_geolocation: placement.row?.source_geolocation || null,
        sensor_geolocation: placement.row?.sensor_geolocation || placement.cameraEntry?.sensor_geolocation || null,
        beam_id: placement.beamEntry?.beam_id || null,
        beam_object_id: placement.beamEntry?.objectId || null,
        position_source: placement.positionSource,
        geo_debug: placement.geoDebug,
        originalPoint: placement.originalPoint || placement.point,
        offset: placement.offset || { x: 0, y: 0 },
        finalPoint: placement.point
    })));

    placements.forEach((placement) => {
        microAddDetectionMarker(
            svgElement,
            overlay,
            placement.point,
            placement.row,
            placement.index
        );
    });
}

function createEmptySeverityCount() {
    return { Low: 0, Medium: 0, High: 0, Info: 0 };
}

function aggregateAlertRowsByTarget(alertRows) {
    const byTarget = new Map();

    (Array.isArray(alertRows) ? alertRows : []).forEach((row) => {
        const target = normalizeAlertJoinKey(
            row && (row.target_ip || row.target || row.ip)
        );
        if (!target) return;

        if (!byTarget.has(target)) {
            byTarget.set(target, []);
        }

        byTarget.get(target).push(row);
    });

    return byTarget;
}

function aggregateSeverityCountByTarget(alertRows) {
    const byTarget = new Map();

    (Array.isArray(alertRows) ? alertRows : []).forEach((row) => {
        const target = normalizeAlertJoinKey(
            row && (row.target_ip || row.target || row.ip)
        );
        const severity = String((row && row.priority) || "").trim();

        if (!target) return;
        if (!["Low", "Medium", "High", "Info"].includes(severity)) return;

        if (!byTarget.has(target)) {
            byTarget.set(target, createEmptySeverityCount());
        }

        const bucket = byTarget.get(target);
        bucket[severity] = (bucket[severity] || 0) + 1;
    });

    return byTarget;
}

function applyAggregatedAlertsToMonitoredElements(alertRows) {
    const byTarget = aggregateSeverityCountByTarget(alertRows);
    const rowsByTarget = aggregateAlertRowsByTarget(alertRows);

    for (const [id, value] of monitoredElements.entries()) {
        const target = normalizeAlertJoinKey(value && value.target);
        const existingTooltipData = alertTooltipDataByObjectId.get(id) || getDefaultTooltipAlertData();
        if (!target) {
            value.lastSeverityCount = createEmptySeverityCount();
            value.lastAlertRows = [];
            setTrackedTooltipContent(id, getDefaultTooltipAlertData());
            continue;
        }

        const severityCount = byTarget.get(target) || createEmptySeverityCount();
        const matchedRows = rowsByTarget.get(target) || [];
        value.lastSeverityCount = { ...severityCount };
        value.lastAlertRows = matchedRows;
        const color = microResolveColorByRules(value, severityCount, matchedRows);

        updateColor(id, color);
        setTrackedTooltipContent(id, {
            target_ip: existingTooltipData.target_ip || target,
            a_high: severityCount.High || 0,
            a_medium: severityCount.Medium || 0,
            a_low: severityCount.Low || 0,
            a_info: severityCount.Info || 0,
        });

        if (trackedTooltipState.objectId === id) {
            renderTrackedTooltip(id);
        }
    }
}

async function refreshMicroData() {
    if (isMicroRefreshInProgress) return;

    isMicroRefreshInProgress = true;
    const btn = document.getElementById("refresh-data-micro");
    const icon = btn && btn.querySelector("i");
    if (icon) {
        icon.classList.add("spin");
    }

    try {
        await refreshAlertsForCurrentMap();
        await refreshAlertsFromMacroMapFallback();
    } finally {
        isMicroRefreshInProgress = false;
        if (icon) {
            icon.classList.remove("spin");
        }
    }
}

async function refreshAlertsForCurrentMap() {
    const assetRef = ensureCurrentAssetRef();
    if (!assetRef) {
        return;
    }

    const dates = await getDates();
    if (!dates) {
        return;
    }

    const requestPayload = {
        asset_ref: assetRef,
        ref_type: getCurrentRefType(),
        start_date: dates.start_date,
        end_date: dates.end_date,
    };

    try {
        const response = await $.ajax({
            url: "/micro_map/get_micro_alerts_bulk_for_asset",
            type: "POST",
            dataType: "json",
            data: requestPayload
        });

        console.log("[Micro Map] get_micro_alerts_bulk_for_asset response", {
            request: requestPayload,
            response: response
        });

        if (response && response.status === "success") {
            const alertRows = response.data || [];

            applyAggregatedAlertsToMonitoredElements(alertRows);
            microRenderDetectionMarkers(alertRows);

            return;
        }

        applyAggregatedAlertsToMonitoredElements([]);
        microClearDetectionMarkers();
    } catch (error) {
        console.log("[Micro Map] Error in bulk alert load:", error);
        applyAggregatedAlertsToMonitoredElements([]);
        microClearDetectionMarkers();
    }
}

async function getDates() {
    var dates = await get_time();
    
    if (!dates.start_date || !dates.end_date) {
      return null;
    }
  
    const startDate = convertToISO(dates.start_date);
    const endDate = convertToISO(dates.end_date);
    return {
      start_date: startDate,
      end_date: endDate
    };
}

function convertToISO(dateStr) {
    var dt = moment.utc(dateStr, "YYYY-MM-DD HH:mm:ssZ");
    return dt.format("YYYY-MM-DD HH:mm:ss.SSSSSS+00:00");
}

async function get_time() {
    var time = await $.ajax({
        url: "/micro_map/get_micro_time",
      type: "GET"
    });
  
    return time;
}

function getSelectedPlanName() {
    const selectedFromDropdown = $("#floor-plan-select").val();
    if (selectedFromDropdown && String(selectedFromDropdown).trim() !== "") {
        return String(selectedFromDropdown).trim();
    }

    return String(navigationContext.svg_name || "").trim();
}

function microTruncateLabel(value, maxLength = 28) {
    const text = String(value || "").trim();
    if (!text) return "";

    const safeMax = Number.isFinite(Number(maxLength)) ? Number(maxLength) : 28;
    if (safeMax <= 3 || text.length <= safeMax) {
        return text;
    }

    return `${text.slice(0, safeMax - 3)}...`;
}

function renderPlansList(plans) {
    const select = $("#floor-plan-select");
    const deleteSelect = $("#manage-delete-plan-dropdown");
    if (!select.length) return;

    select.empty();
    if (deleteSelect.length) deleteSelect.empty();

    (Array.isArray(plans) ? plans : []).forEach((planName) => {
        if (!planName) return;
        const value = String(planName).trim();
        if (!value) return;
        const displayText = microTruncateLabel(value, 28);
        select.append(`<option value="${value}" title="${value}">${displayText}</option>`);
        if (deleteSelect.length) deleteSelect.append(`<option value="${value}">${value}</option>`);
    });

    const hasPlans = !!select.find("option:first").val();
    select.prop("disabled", !hasPlans);
    $("#load-plan-button").prop("disabled", !hasPlans);
    $("#manage-delete-plan-button").prop("disabled", !hasPlans);
}

function clearCurrentPlanView() {
    monitoredElements.clear();
    connectedElementsMap.clear();
    alertTooltipDataByObjectId.clear();
    hideTrackedTooltip();
    loadedSvg = "";

    const container = document.getElementById("svg-container");
    if (container) {
        container.innerHTML = "";
    }

    syncMicroMapEmptyState();
}

async function getPlansList(selectedPlan = null) {
    const assetRef = ensureCurrentAssetRef();
    if (!assetRef) {
        renderPlansList([]);
        return;
    }

    const response = await $.ajax({
        url: "/micro_map/get_micro_plans_list",
        type: "POST",
        data: {
            asset_ref: assetRef
        },
        dataType: "json"
    });

    renderPlansList(response);

    const preferredPlan = (selectedPlan && String(selectedPlan).trim()) ? String(selectedPlan).trim() : getSelectedPlanName();
    if (preferredPlan) {
        $("#floor-plan-select").val(preferredPlan);
        $("#manage-delete-plan-dropdown").val(preferredPlan);
    }

    const normalizedPlans = Array.isArray(response)
        ? response.map((planName) => String(planName || "").trim()).filter(Boolean)
        : [];

    return normalizedPlans;
}

async function saveFloorPlanToDb(planName = null) {
    if (!loadedSvg) {
        console.warn("No SVG loaded to save.");
        return;
    }

    const assetRef = ensureCurrentAssetRef();
    if (!assetRef) {
        return;
    }

    const svgContentStr = new XMLSerializer().serializeToString(loadedSvg);
    const nameToSave = (planName && String(planName).trim()) ? String(planName).trim() : getSelectedPlanName();

    if (!nameToSave) {
        console.warn("Missing SVG name. Provide a name before saving.");
        return;
    }

    const body = {
        asset_ref: assetRef,
        ref_type: getCurrentRefType(),
        svg_name: nameToSave,
        svg_content: svgContentStr,
        object_rules: JSON.stringify(microBuildObjectRulesPayload())
    }

    await $.ajax({
        url: "/micro_map/add_micro_floor_plan",
        type: "POST",
        data: body
    });

    navigationContext.svg_name = nameToSave;
    window.microMapNavigationContext = { ...navigationContext };
    await getPlansList(nameToSave);
}

async function loadFloorPlanToDb(planName = null) {
    const assetRef = ensureCurrentAssetRef();
    if (!assetRef) {
        return false;
    }

    const nameToLoad = (planName && String(planName).trim()) ? String(planName).trim() : getSelectedPlanName();
    if (!nameToLoad) {
        console.warn("Missing SVG name to load.");
        return false;
    }

    const body = {
        asset_ref: assetRef,
        svg_name: nameToLoad,
    }

    navigationContext.svg_name = nameToLoad;
    window.microMapNavigationContext = { ...navigationContext };

    const response = await $.ajax({
        url: "/micro_map/load_micro_floor_plan",
        type: "POST",
        data: body,
        dataType: "json"
    });

    if (!response || !response.svg_content) {
        console.warn("Plan not found or missing SVG content.");
        return false;
    }

    $("#floor-plan-select").val(nameToLoad);
    $("#manage-delete-plan-dropdown").val(nameToLoad);
    processSvgFromDb(response.svg_content, response.object_rules || {});
    await refreshAlertsForCurrentMap();

    return true;
}

async function uploadAndSaveFloorPlanFromModal() {
    const planName = String($("#manage-plan-name").val() || "").trim();
    if (!planName) {
        console.warn("Please provide a floor plan name.");
        return;
    }

    if (!selectedManageSvgText) {
        console.warn("Please select an SVG file first.");
        return;
    }

    processSvg(selectedManageSvgText);
    await refreshAlertsForCurrentMap();
    await saveFloorPlanToDb(planName);

    $("#floor-plan-select").val(planName);
    $("#manage-delete-plan-dropdown").val(planName);
    $("#manage-plan-name").val("");
    $("#manage-svg-filename").val("");
    $("#manage-svg-file-input").val("");
    selectedManageSvgName = "";
    selectedManageSvgText = "";
}

async function deleteSelectedPlanFromDb(planName = null) {
    const assetRef = ensureCurrentAssetRef();
    if (!assetRef) {
        return;
    }

    const nameToDelete = (planName && String(planName).trim()) ? String(planName).trim() : getSelectedPlanName();
    if (!nameToDelete) {
        console.warn("No selected SVG plan to delete.");
        return;
    }

    const response = await $.ajax({
        url: "/micro_map/delete_micro_floor_plan",
        type: "POST",
        dataType: "json",
        data: {
            asset_ref: assetRef,
            svg_name: nameToDelete,
        }
    });

    if (!response || response.status !== "success") {
        console.warn("Selected plan was not deleted.");
        return;
    }

    const remainingPlans = await getPlansList(null);
    const nextPlan = Array.isArray(remainingPlans) && remainingPlans.length > 0 ? remainingPlans[0] : "";

    if (nextPlan) {
        $("#floor-plan-select").val(nextPlan);
        $("#manage-delete-plan-dropdown").val(nextPlan);
        const loaded = await loadFloorPlanToDb(nextPlan);
        if (loaded) {
            setSidebarDrawerClosed(true);
            return;
        }
    }

    navigationContext.svg_name = "";
    window.microMapNavigationContext = { ...navigationContext };
    clearCurrentPlanView();
    setSidebarDrawerClosed(false);
}

async function resetMicroPluginState() {
    const shouldProceed = window.confirm("Are you sure you want to permanently delete all floor plans for all assets? This action cannot be undone.");
    if (!shouldProceed) {
        return;
    }

    const response = await $.ajax({
        url: "/micro_map/reset_micro_state",
        type: "POST",
        dataType: "json"
    });

    if (!response || response.status !== "success") {
        console.warn("Failed to reset micro map plugin state.");
        return;
    }

    navigationContext.svg_name = "";
    window.microMapNavigationContext = { ...navigationContext };

    clearCurrentPlanView();
    await getPlansList(null);
    setSidebarDrawerClosed(false);
    closeManageFloorPlansModal();
}

function processSvgDocument(svgText, objectRulesById = {}) {
    monitoredElements.clear();
    connectedElementsMap.clear();
    alertTooltipDataByObjectId.clear();
    hideTrackedTooltip();

    const parser = new DOMParser();
    const svgDoc = parser.parseFromString(svgText, "image/svg+xml");
    const svgElement = svgDoc.documentElement;
    const rawContent = svgElement.getAttribute("content");
    if (!rawContent) {
        console.error("Missing content attribute.");
        return;
    }

    const decoder = document.createElement("textarea");
    decoder.innerHTML = rawContent;
    const decodedContent = decoder.value;

    const innerDoc = parser.parseFromString(decodedContent, "application/xml");
    const objectElements = innerDoc.querySelectorAll("object[id]");

    loadedSvg = svgElement.cloneNode(true);

    objectElements.forEach(obj => {
        const objectId = obj.getAttribute("id");
        if (!objectId) return;

        const target = microGetObjectAttr(obj, "target");
        const connection = microGetObjectAttr(obj, "connection");
        const type = microGetObjectAttr(obj, "type");

        const visualGroup = svgElement.querySelector(`[data-cell-id="${objectId}"]`);
        if (!visualGroup) return;

        const shapes = Array.from(visualGroup.querySelectorAll("rect, path, polygon, circle, ellipse"));

        if (!(target || connection)) {
            return;
        }

        const entry = {
            objectId,
            shapes,
            visualGroup,
            type: type || null,

            target: target || null,
            connection: connection || null,

            sensor_id: microGetObjectAttr(obj, "sensor_id") || null,
            sensor_ip: microGetObjectAttr(obj, "sensor_ip") || null,
            sensor_name: microGetObjectAttr(obj, "sensor_name") || null,
            sensor_hostname: microGetObjectAttr(obj, "sensor_hostname") || null,
            sensor_location: microGetObjectAttr(obj, "sensor_location") || null,
            sensor_geolocation: microGetObjectAttr(obj, "sensor_geolocation") || null,

            beam_id: microGetObjectAttr(obj, "beam_id") || null,
            location: microGetObjectAttr(obj, "location") || null,
            fallback_position: microGetObjectAttr(obj, "fallback_position") || null,
            marker_x_ratio: microGetObjectAttr(obj, "marker_x_ratio") || null,
            marker_y_ratio: microGetObjectAttr(obj, "marker_y_ratio") || null,
            azimuth_deg: microGetObjectAttr(obj, "azimuth_deg") || null,
            horizontal_fov_deg: microGetObjectAttr(obj, "horizontal_fov_deg") || null,
            vertical_fov_deg: microGetObjectAttr(obj, "vertical_fov_deg") || null,
            range_m: microGetObjectAttr(obj, "range_m") || null,

            label: microPickFirstNonEmpty([
                target,
                microGetObjectAttr(obj, "sensor_name"),
                microGetObjectAttr(obj, "beam_id"),
                connection,
                objectId
            ]),
            lastSeverityCount: createEmptySeverityCount(),
            lastAlertRows: []
        };

        if (target) {
            entry.rules = microNormalizeRules(objectRulesById[objectId]);
            shapes.forEach(shape => {
                applySmartColorToShape(shape, MICRO_DEFAULT_COLOR);
            });
            setTrackedTooltipContent(objectId, {
                ...getDefaultTooltipAlertData(),
                target_ip: normalizeAlertJoinKey(target),
            });
            registerTrackedElementTooltip(objectId, visualGroup);
        }

        if (connection) {
            if (!connectedElementsMap.has(connection)) {
                connectedElementsMap.set(connection, []);
            }
            connectedElementsMap.get(connection).push(objectId);
        }

        monitoredElements.set(objectId, entry);
    });

    console.log("[Micro Map] monitored SVG entries", Array.from(monitoredElements.entries()).map(([objectId, entry]) => ({
        objectId,
        type: entry.type,
        target: entry.target,
        connection: entry.connection,
        sensor_ip: entry.sensor_ip,
        sensor_name: entry.sensor_name,
        sensor_hostname: entry.sensor_hostname,
        sensor_location: entry.sensor_location,
        beam_id: entry.beam_id,
        location: entry.location,
        marker_x_ratio: entry.marker_x_ratio,
        marker_y_ratio: entry.marker_y_ratio
    })));

    console.log("[Micro Map] connected elements", Array.from(connectedElementsMap.entries()));

    const container = document.getElementById("svg-container");
    container.innerHTML = "";
    container.appendChild(svgElement);
    syncMicroMapEmptyState();
}

function processSvg(svgText) {
    processSvgDocument(svgText, {});
}

function processSvgFromDb(svgText, objectRulesById = {}) {
    processSvgDocument(svgText, objectRulesById);
}

function captureShapeOriginalPaint(shape, forceProp = null) {
    const strokePaint = getShapePaint(shape, "stroke");
    const fillPaint = getShapePaint(shape, "fill");
    const hasStroke = !isPaintNoneOrTransparent(strokePaint);
    const hasFill = !isPaintNoneOrTransparent(fillPaint);

    if (!hasStroke && !hasFill) {
        return null; // invisible hitbox, skip
    }

    // If a specific property is forced (e.g. fill for beam elements), honour it
    // as long as the shape actually has that property visible.
    if (forceProp === "fill" && hasFill) {
        return { prop: "fill", value: fillPaint };
    }
    if (forceProp === "stroke" && hasStroke) {
        return { prop: "stroke", value: strokePaint };
    }

    return {
        prop: hasStroke ? "stroke" : "fill",
        value: hasStroke ? strokePaint : fillPaint
    };
}

function restoreShapeOriginalPaint(shape, original) {
    if (!original) return;
    setShapePaint(shape, original.prop, original.value);
}

function blinkElement(id, times = 4, interval = 300, blinkColor = "black", offColor = null, forceProp = null) {
    const data = monitoredElements.get(id);
    if (!data) {
        console.warn(`No element found for ID: ${id}`);
        return;
    }

    const { shapes } = data;

    // Capture original paint per-shape using the same smart logic as coloring.
    // forceProp overrides auto-detection (e.g. "fill" for beam elements).
    const originalPaints = new Map();
    shapes.forEach(shape => {
        const original = captureShapeOriginalPaint(shape, forceProp);
        originalPaints.set(shape, original);
    });

    let count = 0;
    const max = times * 2;

    const blinkInterval = setInterval(() => {
        const isOn = count % 2 === 0;

        shapes.forEach(shape => {
            const original = originalPaints.get(shape);
            if (!original) return; // skip invisible hitboxes

            if (isOn) {
                setShapePaint(shape, original.prop, blinkColor);
            } else {
                const restoreColor = offColor !== null ? offColor : original.value;
                setShapePaint(shape, original.prop, restoreColor);
            }
        });

        count++;
        if (count >= max) {
            clearInterval(blinkInterval);
            // Restore original colors on completion.
            shapes.forEach(shape => {
                restoreShapeOriginalPaint(shape, originalPaints.get(shape));
            });
        }
    }, interval);
}

function blinkRandomElement() {
    const keys = Array.from(monitoredElements.keys());
    if (keys.length === 0) {
        console.warn("No monitored element available.");
        return;
    }

    const randomKey = keys[Math.floor(Math.random() * keys.length)];
    console.log(`Blink on element ID: ${randomKey}`);

    blinkElement(randomKey, 4, 300, "black");
}

function blinkConnectedElement(id, times = 4, interval = 300) {
    // Beam elements are fill-based: blink the fill (center), not the stroke (border).
    blinkElement(id, times, interval, "red", "transparent", "fill");
}

function blinkRandomConnectedElement() {
    const connections = Array.from(connectedElementsMap.entries());

    if (connections.length === 0) {
        console.warn("No connection found.");
        return;
    }

    const [connectionId, ids] = connections[Math.floor(Math.random() * connections.length)];

    if (ids.length < 2) {
        console.warn(`Connection "${connectionId}" has fewer than two elements.`);
        return;
    }

    // Find the element with type 'beam'.
    const beamId = ids.find(id => monitoredElements.get(id)?.type === "beam");

    if (beamId) {
        console.log(`Blinking beam element for connection ${connectionId}: ${beamId}`);
        blinkConnectedElement(beamId, 4, 300);
    } else {
        console.warn(`No "beam" element found in connection ${connectionId}`);
    }
}

function microCreateSvgIcon(ns, iconName, options = {}) {
    const iconSpec = MICRO_DETECTION_ICON_LIBRARY[iconName] || MICRO_DETECTION_ICON_LIBRARY.fallback;
    const viewBox = String(iconSpec.viewBox || "0 0 24 24").trim();
    const pathData = String(iconSpec.path || MICRO_DETECTION_ICON_LIBRARY.fallback.path).trim();

    const [minX, minY, width, height] = viewBox
        .split(/\s+/)
        .map((value) => Number.parseFloat(value));

    const safeWidth = Number.isFinite(width) && width > 0 ? width : 24;
    const safeHeight = Number.isFinite(height) && height > 0 ? height : 24;
    const safeMinX = Number.isFinite(minX) ? minX : 0;
    const safeMinY = Number.isFinite(minY) ? minY : 0;

    const size = Number.isFinite(Number(options.size)) ? Number(options.size) : 22;
    const fill = options.fill || "#FE0000";

    const scale = Math.min(size / safeWidth, size / safeHeight);
    const offsetX = -(safeWidth * scale) / 2 - (safeMinX * scale);
    const offsetY = -(safeHeight * scale) / 2 - (safeMinY * scale);

    const icon = document.createElementNS(ns, "g");
    icon.setAttribute("class", `micro-detection-icon micro-detection-icon-${iconName}`);
    icon.setAttribute("transform", `translate(${offsetX} ${offsetY}) scale(${scale})`);
    icon.setAttribute("fill", fill);

    const path = document.createElementNS(ns, "path");
    path.setAttribute("d", pathData);

    icon.appendChild(path);
    return icon;
}

function microResolveDetectionIconName(row) {
    const categories = Array.isArray(row?.source_category)
        ? row.source_category
        : [row?.source_category].filter(Boolean);

    if (categories.includes("Object.LivingBeings.Human")) {
        return "human";
    }

    return "fallback";
}

function microGetMarkerCollisionKey(point, tolerance = 4) {
    if (!point) return "";

    const safeTolerance = Number.isFinite(Number(tolerance)) && Number(tolerance) > 0
        ? Number(tolerance)
        : 4;

    const x = Math.round(Number(point.x || 0) / safeTolerance) * safeTolerance;
    const y = Math.round(Number(point.y || 0) / safeTolerance) * safeTolerance;

    return `${x}:${y}`;
}

function microGetCollisionOffset(index, total, spacing = 44) {
    if (total <= 1) {
        return { x: 0, y: 0 };
    }

    const safeIndex = Number.isFinite(Number(index)) ? Number(index) : 0;
    const safeTotal = Number.isFinite(Number(total)) && Number(total) > 0 ? Number(total) : 1;
    const safeSpacing = Number.isFinite(Number(spacing)) && Number(spacing) > 0 ? Number(spacing) : 44;

    // Two markers: split them symmetrically around the original point.
    if (safeTotal === 2) {
        return {
            x: safeIndex === 0 ? -(safeSpacing / 2) : (safeSpacing / 2),
            y: 0
        };
    }

    // Three or more: arrange them around the original point.
    const radius = safeTotal <= 4 ? safeSpacing * 0.72 : safeSpacing;
    const angle = (-Math.PI / 2) + ((Math.PI * 2 * safeIndex) / safeTotal);

    return {
        x: Math.cos(angle) * radius,
        y: Math.sin(angle) * radius
    };
}

function microApplyMarkerOffset(point, offset) {
    return {
        x: Number(point.x || 0) + Number(offset.x || 0),
        y: Number(point.y || 0) + Number(offset.y || 0)
    };
}

function microBuildOffsetMarkerPlacements(placements) {
    const groups = new Map();

    placements.forEach((placement) => {
        const key = microGetMarkerCollisionKey(placement.point);
        if (!key) return;

        if (!groups.has(key)) {
            groups.set(key, []);
        }

        groups.get(key).push(placement);
    });

    groups.forEach((group) => {
        group.forEach((placement, index) => {
            const offset = microGetCollisionOffset(index, group.length);
            placement.originalPoint = placement.point;
            placement.offset = offset;
            placement.point = microApplyMarkerOffset(placement.point, offset);
        });
    });

    return placements;
}

function downloadBase64File(filename, contentType, base64Data) {
    const binary = atob(base64Data);
    const len = binary.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = binary.charCodeAt(i);

    const blob = new Blob([bytes], { type: contentType || "application/octet-stream" });

    saveAs(blob, filename || "download");
}