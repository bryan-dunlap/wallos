/*
 * Provider adapters supply events; this boundary validates and converts them
 * into the provider-neutral event contract consumed by Mosaic.
 */
class CalendarEventNormalizer {

    normalizeEvents(events, providerId) {
        if (!Array.isArray(events)) return [];

        return events
            .map((event) => this.normalizeEvent(event, providerId))
            .filter(Boolean)
            .sort((first, second) =>
                Date.parse(first.startTime) - Date.parse(second.startTime)
            );
    }

    normalizeEvent(event, providerId) {
        const id = this.normalizeRequiredString(event?.id);
        const title = this.normalizeRequiredString(event?.title);
        const startTime = this.normalizeTimestamp(event?.startTime);

        if (!id || !title || !startTime || !providerId) return null;

        return {
            id,
            title,
            startTime,
            endTime: this.normalizeTimestamp(event.endTime),
            allDay: event.allDay === true,
            location: this.normalizeOptionalString(event.location),
            calendar: {
                id: this.normalizeOptionalString(event.calendar?.id),
                name: this.normalizeOptionalString(event.calendar?.name)
            },
            provider: {
                id: providerId
            }
        };
    }

    normalizeRequiredString(value) {
        if (typeof value !== "string" || !value.trim()) return null;

        return value.trim();
    }

    normalizeOptionalString(value) {
        return typeof value === "string" && value.trim()
            ? value.trim()
            : null;
    }

    normalizeTimestamp(value) {
        if (value === null || value === undefined || value === "") {
            return null;
        }

        const timestamp = value instanceof Date
            ? value
            : new Date(value);

        return Number.isFinite(timestamp.getTime())
            ? timestamp.toISOString()
            : null;
    }

}
