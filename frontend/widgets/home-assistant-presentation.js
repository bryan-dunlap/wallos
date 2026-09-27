const HOME_ASSISTANT_BINARY_STATE_LABELS = Object.freeze({
    door: { on: "Open", off: "Closed" },
    window: { on: "Open", off: "Closed" },
    garage_door: { on: "Open", off: "Closed" },
    opening: { on: "Open", off: "Closed" },
    motion: { on: "Detected", off: "Clear" },
    occupancy: { on: "Occupied", off: "Clear" },
    presence: { on: "Present", off: "Away" },
    connectivity: { on: "Connected", off: "Disconnected" }
});

function projectHomeAssistantPresentation(payload = {}) {
    const status = typeof payload.status === "string"
        ? payload.status
        : "unavailable";

    return {
        status,
        stale: status === "available" && payload.stale === true,
        updatedAt: typeof payload.updatedAt === "string"
            ? payload.updatedAt
            : null,
        selectedCount: Number.isInteger(payload.selectedCount)
            ? payload.selectedCount
            : 0,
        rows: status === "available" && Array.isArray(payload.entities)
            ? payload.entities.map(projectHomeAssistantEntity)
            : []
    };
}

function projectHomeAssistantEntity(entity = {}) {
    const semantic = resolveHomeAssistantSemantic(entity);
    return {
        name: resolveHomeAssistantPresentationName(entity),
        value: formatHomeAssistantState(entity),
        semantic,
        glyph: HOME_ASSISTANT_SEMANTIC_GLYPHS[semantic] || "·",
        tone: resolveHomeAssistantStateTone(entity, semantic),
        valueKind: isHomeAssistantNumericTelemetry(entity)
            ? "numeric"
            : "state"
    };
}

const HOME_ASSISTANT_SEMANTIC_GLYPHS = Object.freeze({
    door: "▯",
    lock: "▣",
    light: "✦",
    switch: "⏻",
    temperature: "°",
    humidity: "%",
    motion: "◉",
    occupancy: "◎",
    battery: "▰",
    generic: "·"
});

function resolveHomeAssistantSemantic(entity = {}) {
    const deviceClass = normalizeState(entity.deviceClass);
    const icon = normalizeState(entity.icon).replace(/^mdi:/, "");
    const domain = normalizeState(entity.domain);
    const unit = String(entity.unit || "").trim().toLowerCase();

    if (["door", "window", "garage_door", "opening"].includes(deviceClass) ||
        ["door-open", "door-closed", "window-open", "window-closed", "garage"].includes(icon)) return "door";
    if (domain === "lock" || ["lock", "lock-open", "lock-outline"].includes(icon)) return "lock";
    if (domain === "light" || ["lightbulb", "lightbulb-outline"].includes(icon)) return "light";
    if (domain === "switch" || icon === "toggle-switch") return "switch";
    if (deviceClass === "temperature" || icon === "thermometer" ||
        ["°c", "°f"].includes(unit)) return "temperature";
    if (deviceClass === "humidity" || icon === "water-percent") return "humidity";
    if (deviceClass === "motion" || icon === "motion-sensor") return "motion";
    if (["occupancy", "presence"].includes(deviceClass) || icon === "account-check") return "occupancy";
    if (deviceClass === "battery" || icon === "battery") return "battery";
    return "generic";
}

function resolveHomeAssistantStateTone(entity = {}, semantic = "generic") {
    const state = normalizeState(entity.state);
    if (entity.availability !== "available" ||
        ["unknown", "unavailable", ""].includes(state)) return "muted";
    if (["door", "lock", "motion", "occupancy"].includes(semantic)) {
        const attention = semantic === "lock"
            ? ["unlocked", "unlocking", "jammed", "open"].includes(state)
            : state === "on" || ["open", "detected", "occupied", "present"].includes(state);
        return attention ? "attention" : "secure";
    }
    if (["light", "switch"].includes(semantic)) {
        return state === "on" ? "active" : "inactive";
    }
    return "neutral";
}

function isHomeAssistantNumericTelemetry(entity = {}) {
    return entity.availability === "available" &&
        Number.isFinite(Number(entity.state)) &&
        typeof entity.unit === "string" && entity.unit.trim() !== "";
}

function formatHomeAssistantState(entity = {}) {
    const state = normalizeState(entity.state);

    if (entity.availability === "missing") return "Missing";
    if (entity.availability === "unavailable" || state === "unavailable") {
        return "Unavailable";
    }
    if (entity.availability === "unknown" || state === "unknown" || !state) {
        return "Unknown";
    }

    if (["light", "switch"].includes(entity.domain)) {
        if (state === "on") return "On";
        if (state === "off") return "Off";
    }

    if (entity.domain === "binary_sensor") {
        const labels = HOME_ASSISTANT_BINARY_STATE_LABELS[
            entity.deviceClass
        ];

        if (labels?.[state]) return labels[state];
    }

    const label = humanizeHomeAssistantState(state);
    const unit = typeof entity.unit === "string"
        ? entity.unit.trim()
        : "";

    return unit ? `${label} ${unit}` : label;
}

function resolveHomeAssistantPresentationName(entity = {}) {
    const alias = typeof entity.mosaicDisplayName === "string"
        ? entity.mosaicDisplayName.trim()
        : "";
    const homeAssistantName = typeof entity.displayName === "string"
        ? entity.displayName
        : "";

    return alias || homeAssistantName || "Home status";
}

function humanizeHomeAssistantState(value) {
    return String(value || "")
        .replace(/[_-]+/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .replace(/\b\w/g, (character) => character.toUpperCase());
}

function normalizeState(value) {
    return typeof value === "string" ? value.trim().toLowerCase() : "";
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        formatHomeAssistantState,
        humanizeHomeAssistantState,
        isHomeAssistantNumericTelemetry,
        projectHomeAssistantEntity,
        projectHomeAssistantPresentation,
        resolveHomeAssistantSemantic,
        resolveHomeAssistantStateTone,
        resolveHomeAssistantPresentationName
    };
}
