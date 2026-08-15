/*
 * Browser adapter for the backend iCalendar provider. Feed retrieval,
 * private URLs, caching, parsing, and recurrence expansion stay on the server.
 */
class IcalCalendarDataProvider {

    constructor() {
        this.id = "ical";
        this.name = "iCalendar";
        this.sources = [];
    }

    setSources(sources) {
        this.sources = Array.isArray(sources)
            ? sources.map((source) => ({ ...source }))
            : [];
    }

    getSources() {
        return this.sources.map((source) => ({ ...source }));
    }

    async getEvents({ start, end }) {
        const parameters = new URLSearchParams({
            start: new Date(start).toISOString(),
            end: new Date(end).toISOString()
        });
        const response = await fetch(
            `/api/calendar/events?${parameters}`
        );

        if (!response.ok) {
            throw new Error("iCalendar events are unavailable.");
        }

        const payload = await response.json();

        return Array.isArray(payload.events) ? payload.events : [];
    }

}

if (typeof window !== "undefined") {
    window.mosaicCalendar.providers.register(
        new IcalCalendarDataProvider()
    );
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = IcalCalendarDataProvider;
}
