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

    getMetadata() {
        return Array.from(this.providers.values(), (provider) => ({
            id: provider.id,
            name: provider.name
        }));
    }

}

window.mosaicCalendar = window.mosaicCalendar || {};
window.mosaicCalendar.providers = new CalendarProviderRegistry();
