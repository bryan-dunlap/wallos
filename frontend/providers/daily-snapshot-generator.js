class DailySnapshotGenerator {

    constructor() {
        this.profile = { name: "" };
        this.calendarFacts = null;
        this.sportsFacts = null;
        this.weatherInsights = [];
        this.unsubscribeCalendar = null;
        this.unsubscribeSports = null;
        this.unsubscribeWeatherInsights = null;
    }

    async start() {
        this.unsubscribeCalendar =
            window.mosaicApp.eventBus.subscribe(
                "calendar-facts",
                (event) => this.receiveCalendarFacts(event.payload)
            );
        this.unsubscribeSports =
            window.mosaicApp.eventBus.subscribe(
                "sports-facts",
                (event) => this.receiveSportsFacts(event.payload)
            );
        this.unsubscribeWeatherInsights =
            window.mosaicApp.eventBus.subscribe(
                "weather-insights",
                (event) => this.receiveWeatherInsights(event.payload)
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

    receiveSportsFacts(facts) {
        this.sportsFacts = facts;
        this.publishSnapshot();
    }

    receiveWeatherInsights(payload) {
        this.weatherInsights = Array.isArray(payload?.insights)
            ? payload.insights
            : [];
        this.publishSnapshot();
    }

    publishSnapshot() {
        const facts = this.getPlaceholderFacts();
        const now = new Date();
        const snapshot = this.createSnapshot(facts, now);
        const highlights = this.createRestingHighlights(now);

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
                    payload: highlights.length > 0
                        ? { highlights }
                        : null,
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

    createRestingHighlights(now) {
        const currentInsights = this.weatherInsights
            .filter((insight) => {
                const expiration = Date.parse(insight?.expiresAt);

                return insight?.headline &&
                    insight?.summary &&
                    (
                        !Number.isFinite(expiration) ||
                        expiration > now.getTime()
                    );
            })
            .sort((first, second) =>
                (second.priority || 0) - (first.priority || 0)
            );
        const insight = currentInsights[0];

        if (!insight) return [];

        return [{
            type: insight.type,
            emphasis: insight.emphasis || "standard",
            headline: insight.headline,
            summary: insight.summary
        }];
    }

    createSnapshot(facts, now) {
        const hour = now.getHours();

        if (hour < 12) return this.createMorningSnapshot(facts, now);
        if (hour < 18) return this.createAfternoonSnapshot(facts, now);

        return this.createEveningSnapshot(facts, now);
    }

    createMorningSnapshot(facts, now = new Date()) {
        const sportsSummary = this.createSportsSummary(
            facts.sports,
            "morning",
            now
        );

        if (
            facts.calendar.status === "available" &&
            facts.calendar.remainingToday > 0
        ) {
            return {
                summary: this.createCalendarSummary(
                    "morning",
                    facts.calendar,
                    !sportsSummary
                ) + (sportsSummary
                    ? ` ${sportsSummary.replace(/^Today: /, "")}`
                    : "")
            };
        }

        if (sportsSummary) {
            return { summary: sportsSummary };
        }

        if (facts.calendar.status === "available") {
            return { summary: "No remaining events today." };
        }

        const eventSummary = facts.calendar.eventsRemaining > 0
            ? `${facts.calendar.eventsRemaining} events scheduled. `
            : "";

        return {
            summary: eventSummary
                ? `Today: ${eventSummary}`.trim()
                : "Your day is clear."
        };
    }

    createAfternoonSnapshot(facts, now = new Date()) {
        const sportsSummary = this.createSportsSummary(
            facts.sports,
            "afternoon",
            now
        );

        if (
            facts.calendar.status === "available" &&
            facts.calendar.remainingToday > 0
        ) {
            return {
                summary: this.createCalendarSummary(
                    "afternoon",
                    facts.calendar,
                    !sportsSummary
                ) + (sportsSummary ? ` ${sportsSummary}` : "")
            };
        }

        if (sportsSummary) {
            return { summary: sportsSummary };
        }

        if (facts.calendar.status === "available") {
            return { summary: "No remaining events today." };
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
            summary: "Your day is clear."
        };
    }

    createEveningSnapshot(facts, now = new Date()) {
        const sportsSummary = this.createSportsSummary(
            facts.sports,
            "evening",
            now
        );

        if (
            facts.calendar.status === "available" &&
            facts.calendar.remainingToday > 0
        ) {
            return {
                summary: this.createCalendarSummary(
                    "evening",
                    facts.calendar,
                    !sportsSummary
                ) + (sportsSummary ? ` ${sportsSummary}` : "")
            };
        }

        if (sportsSummary) {
            return { summary: sportsSummary };
        }

        if (facts.calendar.status === "available") {
            return { summary: "No remaining events today." };
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
            summary: "Your day is clear."
        };
    }

    createSportsSummary(sports, period, now) {
        const game = sports?.game;
        const startTime = new Date(game?.startTime);
        const teamName = [
            sports?.favoriteTeam?.shortName,
            sports?.favoriteTeam?.name,
            sports?.favoriteTeam?.abbreviation
        ].find((value) =>
            typeof value === "string" && value.trim()
        )?.trim();

        if (
            sports?.status !== "available" ||
            !teamName ||
            !Number.isFinite(startTime.getTime()) ||
            !this.isSameLocalDay(startTime, now)
        ) {
            return "";
        }

        if (game?.status === "final") {
            return typeof game.result === "string"
                ? game.result.trim()
                : "";
        }

        if (game?.status !== "scheduled") {
            return "";
        }

        const time = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit"
        }).format(startTime);
        const daypart = this.getScheduledGameDaypart(startTime);
        const lead = period === "morning" ? "Today: " : "";

        return `${lead}${teamName} play ${daypart} at ${time}.`;
    }

    getScheduledGameDaypart(startTime) {
        const hour = startTime.getHours();

        if (hour < 12) return "this morning";
        if (hour < 17) return "this afternoon";

        return "tonight";
    }

    isSameLocalDay(first, second) {
        return first.getFullYear() === second.getFullYear() &&
            first.getMonth() === second.getMonth() &&
            first.getDate() === second.getDate();
    }

    createCalendarSummary(
        period,
        calendar,
        includeNextEvent = true
    ) {
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

        if (
            !includeNextEvent ||
            !nextEvent?.title ||
            !nextEvent.start
        ) {
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
        const sports = this.sportsFacts || {
            status: "unavailable",
            favoriteTeam: null,
            game: null
        };

        return {
            // Supplied by CalendarProvider; real integration comes later.
            calendar,
            // Supplied by SportsProvider; real integration comes later.
            sports,
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
