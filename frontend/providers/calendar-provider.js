class CalendarProvider {

    constructor() {
        this.registry = window.mosaicCalendar.providers;
        this.normalizer = new CalendarEventNormalizer();
    }

    async start() {
        const enabled = await this.loadEnabledSetting();

        if (!enabled) {
            this.publishFacts(this.createUnavailableFacts());
            return;
        }

        await this.refresh();
    }

    async loadEnabledSetting() {
        try {
            const response = await fetch("/api/config");

            if (!response.ok) throw new Error("Config unavailable");

            const config = await response.json();

            return config.calendar?.enabled !== false;
        } catch (error) {
            return true;
        }
    }

    async refresh() {
        const range = this.getTodayRange();

        try {
            const provider = this.registry.get("demo");
            const providerEvents = await provider.getEvents(range);
            const events = this.normalizer.normalizeEvents(
                providerEvents,
                provider.id
            );

            this.publishFacts(this.createFacts(events));
        } catch (error) {
            this.publishFacts(this.createUnavailableFacts());
        }
    }

    getTodayRange(now = new Date()) {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        return { start, end };
    }

    createFacts(events, now = new Date()) {
        const remainingEvents = events.filter((event) => {
            const eventEnd = Date.parse(
                event.endTime || event.startTime
            );

            return Number.isFinite(eventEnd) && eventEnd >= now.getTime();
        });
        const nextEvent = remainingEvents[0] || null;

        return {
            status: "available",
            eventsToday: events.length,
            remainingToday: remainingEvents.length,
            nextEvent: nextEvent
                ? {
                    title: nextEvent.title,
                    start: nextEvent.startTime
                }
                : null
        };
    }

    createUnavailableFacts() {
        return {
            status: "unavailable",
            eventsToday: 0,
            remainingToday: 0,
            nextEvent: null
        };
    }

    publishFacts(payload) {
        /*
         * calendar-facts remains the provider-neutral boundary used by Daily
         * Snapshot and Calendar Reminder Generator.
         */
        window.mosaicApp.eventBus.publish({
            type: "calendar-facts",
            source: "calendar",
            payload
        });
    }

}
