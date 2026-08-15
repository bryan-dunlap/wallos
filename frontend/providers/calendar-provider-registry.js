/*
 * Calendar data sources register here. Provider adapters retrieve events;
 * CalendarProvider turns their normalized output into shared calendar facts.
 */
class CalendarProviderRegistry {

    constructor() {
        this.providers = new Map();
    }

    register(provider) {
        if (
            !provider ||
            typeof provider.id !== "string" ||
            !provider.id.trim() ||
            typeof provider.name !== "string" ||
            !provider.name.trim() ||
            typeof provider.getEvents !== "function"
        ) {
            throw new TypeError(
                "Calendar providers require id, name, and getEvents()."
            );
        }

        this.providers.set(provider.id, provider);

        return provider;
    }

    get(providerId) {
        return this.providers.get(providerId) || null;
    }

    getDefault() {
        return this.providers.values().next().value || null;
    }

    getSources(providerId) {
        const provider = this.get(providerId);

        if (!provider || typeof provider.getSources !== "function") {
            return [];
        }

        const sources = provider.getSources();

        if (!Array.isArray(sources)) return [];

        return sources
            .filter((source) =>
                typeof source?.id === "string" &&
                source.id.trim() &&
                typeof source?.name === "string" &&
                source.name.trim()
            )
            .map((source) => ({
                id: source.id.trim(),
                name: source.name.trim(),
                enabled: source.enabled !== false
            }));
    }

    getMetadata() {
        return Array.from(this.providers.values(), (provider) => ({
            id: provider.id,
            name: provider.name,
            sources: this.getSources(provider.id)
        }));
    }

}

if (typeof window !== "undefined") {
    window.mosaicCalendar = window.mosaicCalendar || {};
    window.mosaicCalendar.providers = new CalendarProviderRegistry();
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = CalendarProviderRegistry;
}
