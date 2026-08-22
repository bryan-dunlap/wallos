class SportsWidgetRendererRegistry {

    constructor() {
        this.renderers = new Map();
    }

    register(league, renderer) {
        const normalizedLeague = this.normalizeLeague(league);

        if (!normalizedLeague || typeof renderer?.render !== "function") {
            return false;
        }

        this.renderers.set(normalizedLeague, renderer);
        return true;
    }

    get(league) {
        const normalizedLeague = this.normalizeLeague(league);

        return normalizedLeague
            ? this.renderers.get(normalizedLeague) || null
            : null;
    }

    normalizeLeague(league) {
        return typeof league === "string" && league.trim()
            ? league.trim().toUpperCase()
            : null;
    }

}

const sportsWidgetRendererRegistry =
    new SportsWidgetRendererRegistry();

if (typeof window !== "undefined") {
    window.mosaicSportsWidgetRendererRegistry =
        sportsWidgetRendererRegistry;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        SportsWidgetRendererRegistry,
        sportsWidgetRendererRegistry
    };
}
