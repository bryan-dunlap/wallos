function filterSportsWidgetEvents(events, widgetConfig = {}) {
    if (!Array.isArray(events) || widgetConfig.enabled === false) {
        return [];
    }

    const configuredLeagues = widgetConfig.leagues instanceof Set
        ? [...widgetConfig.leagues]
        : Array.isArray(widgetConfig.leagues)
            ? widgetConfig.leagues
            : [];
    const allowedLeagues = new Set(
        configuredLeagues
            .filter((league) => typeof league === "string")
            .map((league) => league.trim().toUpperCase())
            .filter(Boolean)
    );

    return events.filter((event) =>
        typeof event?.league === "string" &&
        allowedLeagues.has(event.league.toUpperCase())
    );
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { filterSportsWidgetEvents };
}
