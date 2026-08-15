/*
 * Temporary Calendar source. A Google, iCloud, Outlook, CalDAV, or Home
 * Assistant adapter can later implement this same provider interface.
 */
class DemoCalendarDataProvider {

    constructor() {
        this.id = "demo";
        this.name = "Demo Calendar";
        this.sources = [
            { id: "work", name: "Work", enabled: true },
            { id: "personal", name: "Personal", enabled: true },
            { id: "birthdays", name: "Birthdays", enabled: true },
            { id: "holidays", name: "National Holidays", enabled: true }
        ];
    }

    getSources() {
        return this.sources.map((source) => ({ ...source }));
    }

    async getEvents({ start, end, sources = this.getSources() }) {
        const day = new Date(start);
        const rangeEnd = new Date(end);
        const enabledSourceIds = new Set(
            sources
                .filter((source) => source.enabled !== false)
                .map((source) => source.id)
        );
        const events = [
            this.createTimedEvent(
                day,
                14,
                "demo:operations-review",
                "Operations Review",
                "work",
                "Work"
            ),
            this.createTimedEvent(
                day,
                16,
                "demo:appointment",
                "Appointment",
                "personal",
                "Personal"
            ),
            this.createAllDayEvent(
                day,
                "demo:birthday",
                "Birthday",
                "birthdays",
                "Birthdays"
            ),
            this.createAllDayEvent(
                day,
                "demo:holiday",
                "Holiday",
                "holidays",
                "National Holidays"
            )
        ];

        return events.filter((event) => {
            const eventStart = Date.parse(event.startTime);

            return enabledSourceIds.has(event.calendar.id) &&
                eventStart >= day.getTime() &&
                eventStart < rangeEnd.getTime();
        });
    }

    createTimedEvent(
        day,
        hour,
        id,
        title,
        calendarId,
        calendarName
    ) {
        const startTime = new Date(day);
        startTime.setHours(hour, 0, 0, 0);

        return {
            id,
            title,
            startTime,
            endTime: null,
            allDay: false,
            location: null,
            calendar: {
                id: calendarId,
                name: calendarName
            }
        };
    }

    createAllDayEvent(day, id, title, calendarId, calendarName) {
        const startTime = new Date(day);
        startTime.setHours(0, 0, 0, 0);

        const endTime = new Date(startTime);
        endTime.setDate(endTime.getDate() + 1);

        return {
            id,
            title,
            startTime,
            endTime,
            allDay: true,
            location: null,
            calendar: {
                id: calendarId,
                name: calendarName
            }
        };
    }

}

if (typeof window !== "undefined") {
    // The demo source is the framework's first registered provider.
    window.mosaicCalendar.providers.register(
        new DemoCalendarDataProvider()
    );
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = DemoCalendarDataProvider;
}
