/*
 * Temporary Calendar source. A Google, iCloud, Outlook, CalDAV, or Home
 * Assistant adapter can later implement this same provider interface.
 */
class DemoCalendarDataProvider {

    constructor() {
        this.id = "demo";
        this.name = "Demo Calendar";
    }

    async getEvents({ start, end }) {
        const day = new Date(start);
        const rangeEnd = new Date(end);
        const events = [
            this.createEvent(
                day,
                14,
                "demo:operations-review",
                "Operations Review",
                "work",
                "Work"
            ),
            this.createEvent(
                day,
                16,
                "demo:project-sync",
                "Project Sync",
                "personal",
                "Personal"
            )
        ];

        return events.filter((event) => {
            const eventStart = Date.parse(event.startTime);

            return eventStart >= day.getTime() &&
                eventStart < rangeEnd.getTime();
        });
    }

    createEvent(day, hour, id, title, calendarId, calendarName) {
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

}

// The demo source is the framework's first registered provider.
window.mosaicCalendar.providers.register(
    new DemoCalendarDataProvider()
);
