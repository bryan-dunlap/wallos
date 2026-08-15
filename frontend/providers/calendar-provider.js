const CALENDAR_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

class CalendarProvider {

    constructor() {
        this.registry = window.mosaicCalendar.providers;
        this.normalizer = new CalendarEventNormalizer();
        this.refreshTimer = null;
        this.refreshInFlight = null;
        this.lastKnownGoodFacts = null;
        this.lastKnownGoodRangeFacts = null;
        this.currentRangeRequest = null;
        this.unsubscribeRangeRequests = null;
        this.started = false;
        this.handlePageHide = () => this.stop();
    }

    async start() {
        if (this.started) return;

        this.started = true;
        this.unsubscribeRangeRequests =
            window.mosaicApp.eventBus.subscribe(
                "calendar-range-request",
                (event) => this.handleRangeRequest(event.payload)
            );
        window.addEventListener(
            "pagehide",
            this.handlePageHide,
            { once: true }
        );

        await this.runRefreshCycle();

        if (!this.started) return;

        this.refreshTimer = setInterval(
            () => this.runRefreshCycle(),
            CALENDAR_REFRESH_INTERVAL_MS
        );
    }

    stop() {
        this.started = false;

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        if (this.unsubscribeRangeRequests) {
            this.unsubscribeRangeRequests();
            this.unsubscribeRangeRequests = null;
        }

        window.removeEventListener(
            "pagehide",
            this.handlePageHide
        );
    }

    runRefreshCycle() {
        if (this.refreshInFlight) return this.refreshInFlight;

        this.refreshInFlight = this.refreshAllCalendarFacts()
            .finally(() => {
                this.refreshInFlight = null;
            });

        return this.refreshInFlight;
    }

    async refreshAllCalendarFacts() {
        await this.refreshFromCurrentSettings();

        if (this.currentRangeRequest) {
            await this.refreshPlanningRange(this.currentRangeRequest);
        }
    }

    async refreshFromCurrentSettings() {
        const settings = await this.loadSettings();

        if (!settings.enabled) {
            this.publishFacts(this.createUnavailableFacts());
            return;
        }

        await this.refresh(settings.providerId);
    }

    async loadSettings() {
        const defaultProvider = this.registry.getDefault();

        try {
            const response = await fetch("/api/config");

            if (!response.ok) throw new Error("Config unavailable");

            const config = await response.json();

            const configuredProvider = this.registry.get(
                config.calendar?.provider
            );
            const selectedProvider =
                configuredProvider || defaultProvider;

            if (typeof selectedProvider?.setSources === "function") {
                selectedProvider.setSources(
                    config.calendar?.sources
                );
            }

            return {
                enabled: config.calendar?.enabled !== false,
                providerId: selectedProvider?.id || null
            };
        } catch (error) {
            return {
                enabled: true,
                providerId: defaultProvider?.id || null
            };
        }
    }

    async refresh(providerId) {
        const range = this.getTodayRange();

        try {
            const provider = this.registry.get(providerId) ||
                this.registry.getDefault();

            if (!provider) throw new Error("Calendar provider unavailable");

            const sources = this.registry.getSources(provider.id);
            const providerEvents = await provider.getEvents({
                ...range,
                sources
            });
            const events = this.normalizer.normalizeEvents(
                providerEvents,
                provider.id
            );
            const facts = this.createFacts(events);

            this.lastKnownGoodFacts = facts;
            this.publishFacts(facts);
        } catch (error) {
            this.publishFacts(
                this.lastKnownGoodFacts ||
                this.createUnavailableFacts()
            );
        }
    }

    async handleRangeRequest(payload) {
        const request = this.normalizeRangeRequest(payload);

        if (!request) return;

        this.currentRangeRequest = request;
        await this.refreshPlanningRange(request);
    }

    normalizeRangeRequest(payload) {
        const start = new Date(payload?.start);
        const end = new Date(payload?.end);
        const requestId = payload?.requestId;

        if (
            !Number.isFinite(start.getTime()) ||
            !Number.isFinite(end.getTime()) ||
            end <= start ||
            (typeof requestId !== "string" &&
                !Number.isInteger(requestId))
        ) {
            return null;
        }

        return {
            requestId,
            start,
            end
        };
    }

    async refreshPlanningRange(request) {
        const settings = await this.loadSettings();

        if (!settings.enabled) {
            this.publishRangeFacts(
                this.createUnavailableRangeFacts(request)
            );
            return;
        }

        try {
            const provider = this.registry.get(settings.providerId) ||
                this.registry.getDefault();

            if (!provider) throw new Error("Calendar provider unavailable");

            const sources = this.registry.getSources(provider.id);
            const providerEvents = await provider.getEvents({
                start: request.start,
                end: request.end,
                sources
            });
            const events = this.normalizer.normalizeEvents(
                providerEvents,
                provider.id
            );
            const facts = this.createRangeFacts(events, request);

            this.lastKnownGoodRangeFacts = facts;
            this.publishRangeFacts(facts);
        } catch (error) {
            const cachedFacts = this.lastKnownGoodRangeFacts;
            const cacheMatchesRange =
                cachedFacts?.range?.start === request.start.toISOString() &&
                cachedFacts?.range?.end === request.end.toISOString();

            this.publishRangeFacts(
                cacheMatchesRange
                    ? { ...cachedFacts, requestId: request.requestId }
                    : this.createUnavailableRangeFacts(request)
            );
        }
    }

    createRangeFacts(events, request) {
        const countsByDate = events.reduce((counts, event) => {
            const dateKey = this.getEventDateKey(event);

            if (!dateKey) return counts;

            counts[dateKey] = (counts[dateKey] || 0) + 1;

            return counts;
        }, {});

        return {
            status: "available",
            requestId: request.requestId,
            range: {
                start: request.start.toISOString(),
                end: request.end.toISOString()
            },
            countsByDate
        };
    }

    getEventDateKey(event) {
        if (
            event?.allDay === true &&
            typeof event.startTime === "string" &&
            /^\d{4}-\d{2}-\d{2}/.test(event.startTime)
        ) {
            return event.startTime.slice(0, 10);
        }

        const date = new Date(event?.startTime);

        return Number.isFinite(date.getTime())
            ? this.getLocalDateKey(date)
            : null;
    }

    createUnavailableRangeFacts(request) {
        return {
            status: "unavailable",
            requestId: request.requestId,
            range: {
                start: request.start.toISOString(),
                end: request.end.toISOString()
            },
            countsByDate: {}
        };
    }

    getLocalDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    getTodayRange(now = new Date()) {
        const start = new Date(now);
        start.setHours(0, 0, 0, 0);

        const end = new Date(start);
        end.setDate(end.getDate() + 1);

        return { start, end };
    }

    createFacts(events, now = new Date()) {
        const classifiedEvents = this.classifyEvents(events);
        const remainingTimedEvents = classifiedEvents.timed.filter(
            (event) => {
                const eventEnd = Date.parse(
                    event.endTime || event.startTime
                );

                return Number.isFinite(eventEnd) &&
                    eventEnd >= now.getTime();
            }
        );
        const nextEvent = remainingTimedEvents[0] || null;

        return {
            status: "available",
            eventsToday: events.length,
            remainingToday:
                remainingTimedEvents.length +
                classifiedEvents.allDay.length,
            nextEvent: nextEvent
                ? {
                    title: nextEvent.title,
                    start: nextEvent.startTime
                }
                : null,
            timedEvents: remainingTimedEvents.map(
                (event) => this.createEventFact(event)
            ),
            allDayEvents: classifiedEvents.allDay.map(
                (event) => this.createEventFact(event)
            )
        };
    }

    createEventFact(event) {
        /*
         * Calendar and provider identity remain internal normalization
         * metadata. Presentation consumers receive event awareness only.
         */
        return {
            id: event.id,
            title: event.title,
            startTime: event.startTime,
            endTime: event.endTime,
            allDay: event.allDay,
            location: event.location
        };
    }

    classifyEvents(events) {
        return events.reduce(
            (classified, event) => {
                const classification = this.classifyEvent(event);

                if (classification === "all-day") {
                    classified.allDay.push(event);
                } else {
                    classified.timed.push(event);
                }

                return classified;
            },
            { timed: [], allDay: [] }
        );
    }

    classifyEvent(event) {
        return event.allDay === true ? "all-day" : "timed";
    }

    createUnavailableFacts() {
        return {
            status: "unavailable",
            eventsToday: 0,
            remainingToday: 0,
            nextEvent: null,
            timedEvents: [],
            allDayEvents: []
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

    publishRangeFacts(payload) {
        window.mosaicApp.eventBus.publish({
            type: "calendar-range-facts",
            source: "calendar",
            payload
        });
    }

}
