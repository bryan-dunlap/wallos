class DailySnapshotGenerator {

    constructor() {
        this.profile = { name: "" };
        this.calendarFacts = null;
        this.unsubscribeCalendar = null;
    }

    async start() {
        this.unsubscribeCalendar =
            window.mosaicApp.eventBus.subscribe(
                "calendar-facts",
                (event) => this.receiveCalendarFacts(event.payload)
            );
        this.profile = await this.loadProfile();

        this.publishSnapshot();
    }

    async loadProfile() {
        try {
            const response = await fetch("/api/config");

            if (!response.ok) throw new Error("Config unavailable");

            const config = await response.json();

            return {
                name: typeof config.profile?.name === "string"
                    ? config.profile.name
                    : ""
            };
        } catch (error) {
            return { name: "" };
        }
    }

    receiveCalendarFacts(facts) {
        this.calendarFacts = facts;
        this.publishSnapshot();
    }

    publishSnapshot() {
        const facts = this.getPlaceholderFacts();
        const now = new Date();
        const snapshot = this.createSnapshot(facts, now);

        window.mosaicApp.eventBus.publish({
            type: "hero-candidate",
            source: "daily-snapshot",
            payload: {
                candidate: {
                    id: "daily-snapshot:current",
                    source: "daily-snapshot",
                    type: "daily.snapshot",
                    mode: "resting",
                    priority: 1,
                    behavior: {
                        sticky: false,
                        durationSeconds: null
                    },
                    headline: this.createHeadline(
                        now,
                        this.profile.name
                    ),
                    summary: snapshot.summary,
                    createdAt: now.toISOString(),
                    expiresAt: null
                }
            }
        });
    }

    createHeadline(now, profileName = "") {
        const hour = now.getHours();
        const name = profileName.trim();
        let greeting;

        if (hour < 12) greeting = "Good morning";
        else if (hour < 18) greeting = "Good afternoon";
        else greeting = "Good evening";

        return name ? `${greeting} ${name}` : greeting;
    }

    createSnapshot(facts, now) {
        const hour = now.getHours();

        if (hour < 12) return this.createMorningSnapshot(facts);
        if (hour < 18) return this.createAfternoonSnapshot(facts);

        return this.createEveningSnapshot(facts);
    }

    createMorningSnapshot(facts) {
        if (facts.calendar.status === "available") {
            return {
                summary: this.createCalendarSummary(
                    "morning",
                    facts.calendar
                )
            };
        }

        const eventSummary = facts.calendar.eventsRemaining > 0
            ? `${facts.calendar.eventsRemaining} events scheduled. `
            : "";
        const gameSummary = this.createGameSummary(facts.sports);

        return {
            summary: eventSummary || gameSummary
                ? `Today: ${eventSummary}${gameSummary}`.trim()
                : "Your day is clear."
        };
    }

    createAfternoonSnapshot(facts) {
        if (facts.calendar.status === "available") {
            return {
                summary: this.createCalendarSummary(
                    "afternoon",
                    facts.calendar
                )
            };
        }

        if (facts.calendar.eventsRemaining > 0) {
            const nextEvent = facts.calendar.nextEvent;
            const nextSummary = nextEvent
                ? ` Next: ${nextEvent.title} at ${nextEvent.time}.`
                : "";

            return {
                summary:
                    `Remaining today: ` +
                    `${facts.calendar.eventsRemaining} events.` +
                    nextSummary
            };
        }

        return {
            summary: this.createGameSummary(facts.sports) ||
                "Your day is clear."
        };
    }

    createEveningSnapshot(facts) {
        if (facts.calendar.status === "available") {
            return {
                summary: this.createCalendarSummary(
                    "evening",
                    facts.calendar
                )
            };
        }

        if (facts.calendar.eventsCompleted > 0) {
            const tomorrow = facts.calendar.tomorrowFirstEvent;
            const tomorrowSummary = tomorrow
                ? ` Tomorrow starts at ${tomorrow.time}.`
                : "";

            return {
                summary:
                    `Today: ${facts.calendar.eventsCompleted} ` +
                    `events completed.` + tomorrowSummary
            };
        }

        return {
            summary: this.createGameSummary(facts.sports) ||
                "Your day is clear."
        };
    }

    createGameSummary(sports) {
        if (
            !sports.gameToday ||
            !sports.favoriteTeam ||
            !sports.gameTime
        ) {
            return "";
        }

        return `${sports.favoriteTeam} play tonight at ${sports.gameTime}.`;
    }

    createCalendarSummary(period, calendar) {
        if (calendar.remainingToday <= 0) {
            return "No remaining events today.";
        }

        const eventCount = period === "morning"
            ? calendar.eventsToday
            : calendar.remainingToday;
        const countLabel = eventCount === 1 ? "event" : "events";
        const lead = period === "morning"
            ? `Today: ${eventCount} ${countLabel} scheduled.`
            : `Remaining today: ${eventCount} ${countLabel}.`;
        const nextEvent = calendar.nextEvent;

        if (!nextEvent?.title || !nextEvent.start) {
            return lead;
        }

        const start = new Date(nextEvent.start);

        if (!Number.isFinite(start.getTime())) {
            return lead;
        }

        const time = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit"
        }).format(start);

        return `${lead} Next: ${nextEvent.title} at ${time}.`;
    }

    getPlaceholderFacts() {
        const calendar = this.calendarFacts || {
            status: "unavailable",
            eventsToday: 0,
            remainingToday: 0,
            nextEvent: null
        };

        return {
            // Supplied by CalendarProvider; real integration comes later.
            calendar,
            // Future Sports facts will replace these placeholders.
            sports: {
                favoriteTeam: "Mariners",
                gameToday: true,
                gameTime: "7:10 PM"
            },
            // Future Home Assistant facts will replace this placeholder.
            home: {
                status: "Normal"
            },
            // Future Weather facts will replace these placeholders.
            weather: {
                condition: "Clear"
            }
        };
    }

}
