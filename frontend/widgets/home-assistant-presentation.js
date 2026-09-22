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
    return {
        name: resolveHomeAssistantPresentationName(entity),
        value: formatHomeAssistantState(entity)
    };
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
        projectHomeAssistantEntity,
        projectHomeAssistantPresentation,
        resolveHomeAssistantPresentationName
    };
}
