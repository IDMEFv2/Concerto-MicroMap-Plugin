const monitoredElements = new Map();
const connectedElementsMap = new Map();
const alertTooltipDataByObjectId = new Map();
const trackedTooltipState = { element: null, objectId: null };
let selectedMonitoredObjectId = null;
var loadedSvg = "";
const DEFAULT_PLAN_NAME = "First Floor";
const navigationContext = {
    has_reference: false,
    asset_ref: "",
    ref_type: "",
    source: "",
    svg_name: ""
};
const MICRO_MAP_DOC_EVENT_NS = ".microMap";
const MICRO_MAP_LAST_ASSET_KEY = "micro_map_last_asset";
let selectedManageSvgName = "";
let selectedManageSvgText = "";
let selectedMicroRuleObjectId = null;
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

async function loadNavigationContext() {
    try {
        const response = await $.ajax({
            url: "/micro_map/get_micro_navigation_context",
            type: "GET",
            dataType: "json"
        });

        if (response && typeof response === "object") {
            console.log(response)
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
    console.log("Micro map navigation context:", window.microMapNavigationContext);
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
}

function setAssetSelectorVisible(isVisible) {
    const overlay = document.getElementById("asset-selector-overlay");
    if (overlay) overlay.classList.toggle("is-hidden", !isVisible);
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
        option.textContent = name;
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
    clearCurrentPlanView();
    await initializeMapForCurrentAsset();
    await refreshAlertsFromMacroMapFallback();

    const assetSwitcher = document.getElementById("asset-switch-select");
    if (assetSwitcher) {
        assetSwitcher.value = selectedAsset;
    }
}

async function initializeMapForCurrentAsset(preferredPlanName = null) {
    const preferred = String(preferredPlanName || "").trim();
    await getPlansList(preferred || null);

    const initialPlanName = preferred || getSelectedPlanName() || String(navigationContext.svg_name || "").trim();
    if (initialPlanName) {
        await loadFloorPlanToDb(initialPlanName);
        return;
    }

    clearCurrentPlanView();
}

async function initializeListeners() {
    const navCtx = await loadNavigationContext();
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

    safeAddEventListener("asset-selector-load", "click", async function () {
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

        setAssetSelectorVisible(false);
        setMainUiVisible(true);
        await initializeMapForCurrentAsset();
        await refreshAlertsFromMacroMapFallback();
    });

    microBindRulesEditor("#micro-rules-grid-container");

    // PRIORITY: Direct navigation from Macro with context – handle immediately
    // before any other AJAX calls that might interfere on first visit.
    if (navCtx && navCtx.has_reference && navCtx.asset_ref) {
        setMainUiVisible(true);
        setAssetSelectorVisible(false);
        saveLastSelectedAsset(navCtx.asset_ref);

        const targetPlan = String(navCtx.svg_name || "").trim();
        if (targetPlan) {
            await loadFloorPlanToDb(targetPlan);
            await getPlansList(targetPlan);
        } else {
            await getPlansList(null);
            const firstPlan = getSelectedPlanName();
            if (firstPlan) {
                await loadFloorPlanToDb(firstPlan);
            }
        }

        try {
            const names = await fetchMacroMapEntityNames();
            populateAssetSwitcher(names);
        } catch (_) {
            populateAssetSwitcher([]);
        }
        return;
    }

    setMainUiVisible(false);
    setAssetSelectorVisible(false);

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

        if (availableEntityNames.length > 0) {
            setAssetSelectorMessage("Select an asset from Macro Map to continue.");
        } else {
            setAssetSelectorMessage("No assets found in Macro Map. Load assets there first.");
        }
    } catch (error) {
        console.error("Failed to load assets from Macro Map:", error);
        populateAssetSelector([]);
        populateAssetSwitcher([]);
        setAssetSelectorMessage("Cannot load assets from Macro Map right now.");
    }

    setAssetSelectorVisible(true);
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

async function refreshAlertsForCurrentMap() {
    const assetRef = ensureCurrentAssetRef();
    if (!assetRef) {
        return;
    }

    const dates = await getDates();
    if (!dates) {
        return;
    }

    try {
        const response = await $.ajax({
            url: "/micro_map/get_micro_alerts_bulk_for_asset",
            type: "POST",
            dataType: "json",
            data: {
                asset_ref: assetRef,
                ref_type: getCurrentRefType(),
                start_date: dates.start_date,
                end_date: dates.end_date,
            }
        });

        if (response && response.status === "success") {
            applyAggregatedAlertsToMonitoredElements(response.data || []);
            return;
        }

        applyAggregatedAlertsToMonitoredElements([]);
    } catch (error) {
        console.log("Error in bulk alert load:", error);
        applyAggregatedAlertsToMonitoredElements([]);
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
        select.append(`<option value="${value}">${value}</option>`);
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
}

async function getPlansList(selectedPlan = null) {
    const assetRef = ensureCurrentAssetRef();
    if (!assetRef) {
        renderPlansList([]);
        return;
    }

    await $.ajax({
        url: "/micro_map/get_micro_plans_list",
        type: "POST",
        data: {
            asset_ref: assetRef
        },
        dataType: "json",
        success: function (response) {
            renderPlansList(response);

            const preferredPlan = (selectedPlan && String(selectedPlan).trim()) ? String(selectedPlan).trim() : getSelectedPlanName();
            if (preferredPlan) {
                $("#floor-plan-select").val(preferredPlan);
                $("#manage-delete-plan-dropdown").val(preferredPlan);
            }

            console.log(response)
        }
    });
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
        data: body,
        success: function (response) {
            console.log(response);
        }
    });

    navigationContext.svg_name = nameToSave;
    window.microMapNavigationContext = { ...navigationContext };
    await getPlansList(nameToSave);
}

async function loadFloorPlanToDb(planName = null) {
    const assetRef = ensureCurrentAssetRef();
    if (!assetRef) {
        return;
    }

    const nameToLoad = (planName && String(planName).trim()) ? String(planName).trim() : getSelectedPlanName();
    if (!nameToLoad) {
        console.warn("Missing SVG name to load.");
        return;
    }

    const body = {
        asset_ref: assetRef,
        svg_name: nameToLoad,
    }

    navigationContext.svg_name = nameToLoad;
    window.microMapNavigationContext = { ...navigationContext };

    await $.ajax({
        url: "/micro_map/load_micro_floor_plan",
        type: "POST",
        data: body,
        dataType: "json",
        success: async function (response) {
            if (!response || !response.svg_content) {
                console.warn("Plan not found or missing SVG content.");
                return;
            }
            $("#floor-plan-select").val(nameToLoad);
            $("#manage-delete-plan-dropdown").val(nameToLoad);
            processSvgFromDb(response.svg_content, response.object_rules || {})
            await refreshAlertsForCurrentMap();
        }
    });
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

    await getPlansList(null);

    const nextPlan = getSelectedPlanName();
    if (nextPlan) {
        $("#manage-delete-plan-dropdown").val(nextPlan);
        await loadFloorPlanToDb(nextPlan);
        return;
    }

    clearCurrentPlanView();
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

        const target = obj.getAttribute("target") || null;
        const connection = obj.getAttribute("connection") || null;
        const type = obj.getAttribute("type") || null;

        const visualGroup = svgElement.querySelector(`[data-cell-id="${objectId}"]`);
        if (!visualGroup) return;

        const shapes = Array.from(visualGroup.querySelectorAll("rect, path, polygon, circle, ellipse"));

        if (!(target || connection)) {
            return;
        }

        const entry = {
            objectId,
            shapes,
            type,
            label: target || connection || objectId,
            lastSeverityCount: createEmptySeverityCount(),
            lastAlertRows: []
        };

        if (target) {
            entry.target = target;
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
            entry.connection = connection;
            if (!connectedElementsMap.has(connection)) {
                connectedElementsMap.set(connection, []);
            }
            connectedElementsMap.get(connection).push(objectId);
        }

        monitoredElements.set(objectId, entry);
    });

    const container = document.getElementById("svg-container");
    container.innerHTML = "";
    container.appendChild(svgElement);
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
