class CalendarProvider {

    async start() {
        const enabled = await this.loadEnabledSetting();

        this.publishFacts(enabled);
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

    publishFacts(enabled = true) {
        /*
         * Simulated facts establish the Calendar contract. A future real
         * calendar integration will replace only this data source.
         */
        const payload = enabled
            ? {
                status: "available",
                eventsToday: 2,
                remainingToday: 2,
                nextEvent: {
                    title: "Operations Review",
                    start: "2026-08-11T14:00:00"
                }
            }
            : {
                status: "unavailable",
                eventsToday: 0,
                remainingToday: 0,
                nextEvent: null
            };

        window.mosaicApp.eventBus.publish({
            type: "calendar-facts",
            source: "calendar",
            payload
        });
    }

}
