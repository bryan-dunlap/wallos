const NORMAL_WIDGET_PAIR_MODE = "pair";
const NORMAL_WIDGET_EXPANDED_MODE = "expanded";

function composeNormalWidgets(input = {}) {
    const mode = normalizeNormalWidgetMode(input?.mode);
    const enabledIds = normalizeEnabledWidgetIds(
        input?.orderedEnabledWidgetIds
    );
    const widgetCount = enabledIds.length;

    if (widgetCount === 0) {
        return createCompositionResult({
            mode,
            enabledIds,
            visibleIds: [],
            density: null,
            currentIndex: 0,
            nextIndex: 0,
            rotationRequired: false
        });
    }

    if (widgetCount === 1) {
        return createCompositionResult({
            mode,
            enabledIds,
            visibleIds: [enabledIds[0]],
            density: "expanded",
            currentIndex: 0,
            nextIndex: 0,
            rotationRequired: false
        });
    }

    const currentIndex = normalizeCompositionIndex(
        input?.currentIndex,
        widgetCount
    );

    if (mode === NORMAL_WIDGET_EXPANDED_MODE) {
        return createCompositionResult({
            mode,
            enabledIds,
            visibleIds: [enabledIds[currentIndex]],
            density: "expanded",
            currentIndex,
            nextIndex: (currentIndex + 1) % widgetCount,
            rotationRequired: true
        });
    }

    const rotationRequired = widgetCount >= 3;

    return createCompositionResult({
        mode,
        enabledIds,
        visibleIds: [
            enabledIds[currentIndex],
            enabledIds[(currentIndex + 1) % widgetCount]
        ],
        density: "compact",
        currentIndex,
        nextIndex: rotationRequired
            ? (currentIndex + 1) % widgetCount
            : currentIndex,
        rotationRequired
    });
}

function reconcileNormalWidgetComposition(
    previousComposition,
    nextInput = {}
) {
    const enabledIds = normalizeEnabledWidgetIds(
        nextInput?.orderedEnabledWidgetIds
    );
    const previousLeadingId = Array.isArray(
        previousComposition?.visibleIds
    )
        ? previousComposition.visibleIds[0]
        : null;
    const preservedIndex = enabledIds.indexOf(previousLeadingId);

    return composeNormalWidgets({
        mode: nextInput?.mode,
        orderedEnabledWidgetIds: enabledIds,
        currentIndex: preservedIndex >= 0 ? preservedIndex : 0
    });
}

function normalizeNormalWidgetMode(mode) {
    return mode === NORMAL_WIDGET_EXPANDED_MODE
        ? NORMAL_WIDGET_EXPANDED_MODE
        : NORMAL_WIDGET_PAIR_MODE;
}

function normalizeEnabledWidgetIds(ids) {
    if (!Array.isArray(ids)) return [];

    const normalizedIds = [];
    const seenIds = new Set();

    ids.forEach((candidate) => {
        const id = typeof candidate === "string"
            ? candidate.trim()
            : "";

        if (!id || seenIds.has(id)) return;

        seenIds.add(id);
        normalizedIds.push(id);
    });

    return normalizedIds;
}

function normalizeCompositionIndex(index, widgetCount) {
    if (!Number.isInteger(widgetCount) || widgetCount <= 0) return 0;
    if (!Number.isFinite(index)) return 0;

    const integerIndex = Math.trunc(index);

    return ((integerIndex % widgetCount) + widgetCount) % widgetCount;
}

function createCompositionResult(result) {
    return Object.freeze({
        ...result,
        enabledIds: Object.freeze([...result.enabledIds]),
        visibleIds: Object.freeze([...result.visibleIds])
    });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        NORMAL_WIDGET_EXPANDED_MODE,
        NORMAL_WIDGET_PAIR_MODE,
        composeNormalWidgets,
        normalizeCompositionIndex,
        normalizeEnabledWidgetIds,
        normalizeNormalWidgetMode,
        reconcileNormalWidgetComposition
    };
}
