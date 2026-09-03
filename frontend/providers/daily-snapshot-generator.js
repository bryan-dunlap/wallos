class DailySnapshotGenerator {

    constructor() {
        this.maximumRestingRows = 3;
        this.profile = { name: "" };
        this.calendarFacts = null;
        this.sportsFactsById = new Map();
        this.weatherFacts = null;
        this.weatherInsights = [];
        this.unsubscribeCalendar = null;
        this.unsubscribeSports = null;
        this.unsubscribeWeatherFacts = null;
        this.unsubscribeWeatherInsights = null;
        this.boundaryTimer = null;
        this.insightExpirationTimer = null;
    }

    async start() {
        this.stop();
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
        this.unsubscribeWeatherFacts =
            window.mosaicApp.eventBus.subscribe(
                "weather-facts",
                (event) => this.receiveWeatherFacts(event.payload)
            );
        this.unsubscribeWeatherInsights =
            window.mosaicApp.eventBus.subscribe(
                "weather-insights",
                (event) => this.receiveWeatherInsights(event.payload)
            );
        this.profile = await this.loadProfile();

        this.publishSnapshot();
    }

    stop() {
        [
            "unsubscribeCalendar",
            "unsubscribeSports",
            "unsubscribeWeatherFacts",
            "unsubscribeWeatherInsights"
        ].forEach((key) => {
            if (this[key]) this[key]();
            this[key] = null;
        });
        this.clearTimer("boundaryTimer");
        this.clearTimer("insightExpirationTimer");
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
        const now = this.getNow();
        const favoriteId = facts?.favoriteTeam?.id;

        this.removeExpiredSports(now);

        if (favoriteId) {
            const item = this.normalizeSportsItem(facts, now);

            if (item) {
                this.removeFavoriteSports(favoriteId);
                this.sportsFactsById.set(item.id, item);
            }
        }

        this.publishSnapshot();
    }

    receiveWeatherFacts(facts) {
        this.weatherFacts = facts;
        this.publishSnapshot();
    }

    receiveWeatherInsights(payload) {
        this.weatherInsights = Array.isArray(payload?.insights)
            ? payload.insights
            : [];
        this.publishSnapshot();
    }

    publishSnapshot() {
        const now = this.getNow();
        const context = this.createDailyContext(now);
        const rows = this.createRestingRows(context, now);
        const highlights = this.createRestingHighlights(context);

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
                    summary: "",
                    payload: {
                        ...context,
                        rows,
                        highlights
                    },
                    createdAt: now.toISOString(),
                    expiresAt: null
                }
            }
        });

        this.scheduleTemporalUpdates(now);
    }

    getNow() {
        return new Date();
    }

    createDailyContext(now = this.getNow()) {
        this.removeExpiredSports(now);

        const period = this.getDayPeriod(now);

        return {
            schemaVersion: 1,
            date: this.getLocalDateKey(now),
            greeting: {
                text: this.createHeadline(now, this.profile.name),
                period
            },
            alerts: [],
            weather: this.normalizeWeather(this.weatherFacts),
            sports: [...this.sportsFactsById.values()]
                .filter((item) => this.isSameLocalDay(
                    new Date(item.startsAt || item.eventDate),
                    now
                ))
                .sort((first, second) =>
                    this.compareSportsItems(first, second)
                ),
            calendar: this.normalizeCalendar(this.calendarFacts, now),
            insights: this.normalizeInsights(now),
            generatedAt: now.toISOString()
        };
    }

    normalizeWeather(facts) {
        if (facts?.status !== "available") return null;

        const current = facts.current;
        const today = facts.today;

        if (!current || !today) return null;

        return {
            status: "available",
            location: facts.location ? {
                name: facts.location.name || "",
                region: facts.location.region || "",
                timezone: facts.location.timezone || ""
            } : null,
            current: {
                temperature: current.temperature ?? null,
                apparentTemperature:
                    current.apparentTemperature ?? null,
                condition: current.condition ? {
                    code: current.condition.code ?? null,
                    label: current.condition.label || "",
                    icon: current.condition.icon || ""
                } : null
            },
            today: {
                date: today.date,
                high: today.high ?? null,
                low: today.low ?? null,
                precipitationChance:
                    today.precipitationChance ?? null
            },
            updatedAt: facts.updatedAt || null,
            stale: facts.stale === true
        };
    }

    normalizeSportsItem(facts, now = this.getNow()) {
        const favoriteTeam = facts?.favoriteTeam;
        const game = facts?.game;
        const startsAt = game?.startTime || null;
        const eventDate = game?.eventDate || startsAt;
        const eventDay = new Date(startsAt || eventDate);
        const state = {
            scheduled: "upcoming",
            live: "active",
            final: "completed"
        }[game?.status];

        if (
            facts?.status !== "available" ||
            !favoriteTeam?.id ||
            !state ||
            !startsAt ||
            !Number.isFinite(eventDay.getTime()) ||
            !this.isSameLocalDay(eventDay, now)
        ) {
            return null;
        }

        const league = String(favoriteTeam.league || "")
            .trim()
            .toUpperCase();
        const eventIdentity = game.eventId ||
            game.eventDate || startsAt;
        const favoriteIsAway = game.teams?.away?.id === favoriteTeam.id;
        const favoriteIsHome = game.teams?.home?.id === favoriteTeam.id;
        const opponentTeam = favoriteIsAway
            ? game.teams?.home
            : favoriteIsHome
                ? game.teams?.away
                : null;
        const favoriteGameTeam = favoriteIsAway
            ? game.teams?.away
            : favoriteIsHome
                ? game.teams?.home
                : null;
        const favoriteScore = game.score?.favoriteTeam ??
            (favoriteIsAway ? game.score?.away : null) ??
            (favoriteIsHome ? game.score?.home : null);
        const opponentScore = game.score?.opponent ??
            (favoriteIsAway ? game.score?.home : null) ??
            (favoriteIsHome ? game.score?.away : null);

        return {
            id: [league, favoriteTeam.id, eventIdentity]
                .filter(Boolean)
                .join(":"),
            league,
            favoriteTeam: {
                id: favoriteTeam.id,
                name: favoriteTeam.name || "",
                shortName: favoriteTeam.shortName || "",
                abbreviation: favoriteTeam.abbreviation || "",
                sport: favoriteTeam.sport || "",
                logo: favoriteTeam.logo || favoriteGameTeam?.logo || ""
            },
            opponent: opponentTeam?.shortName ||
                opponentTeam?.name || game.opponent || "",
            state,
            startsAt,
            score: game.score ? {
                away: game.score.away ?? null,
                home: game.score.home ?? null,
                favoriteTeam: favoriteScore ?? null,
                opponent: opponentScore ?? null
            } : null,
            result: typeof game.result === "string"
                ? game.result.trim()
                : "",
            eventDate: game.eventDate || startsAt
        };
    }

    removeFavoriteSports(favoriteId) {
        this.sportsFactsById.forEach((item, id) => {
            if (item.favoriteTeam.id === favoriteId) {
                this.sportsFactsById.delete(id);
            }
        });
    }

    removeExpiredSports(now = this.getNow()) {
        this.sportsFactsById.forEach((item, id) => {
            const eventDay = new Date(item.startsAt || item.eventDate);

            if (
                !Number.isFinite(eventDay.getTime()) ||
                !this.isSameLocalDay(eventDay, now)
            ) {
                this.sportsFactsById.delete(id);
            }
        });
    }

    compareSportsItems(first, second) {
        const rank = { active: 0, completed: 1, upcoming: 2 };

        return (rank[first.state] ?? 3) - (rank[second.state] ?? 3) ||
            Date.parse(first.startsAt) - Date.parse(second.startsAt) ||
            first.league.localeCompare(second.league) ||
            first.id.localeCompare(second.id);
    }

    normalizeCalendar(calendar, now = this.getNow()) {
        if (calendar?.status !== "available") return [];

        const timed = Array.isArray(calendar.timedEvents)
            ? calendar.timedEvents
            : [];
        const allDay = Array.isArray(calendar.allDayEvents)
            ? calendar.allDayEvents
            : [];

        return [...timed, ...allDay]
            .map((event) => this.normalizeCalendarItem(event, now))
            .filter(Boolean)
            .sort((first, second) =>
                this.compareCalendarItems(first, second)
            );
    }

    normalizeCalendarItem(event, now) {
        if (!event?.id && !event?.title) return null;

        const allDay = event.allDay === true;
        const start = Date.parse(event.startTime);
        const end = Date.parse(event.endTime || event.startTime);

        if (!allDay && (!Number.isFinite(end) || end < now.getTime())) {
            return null;
        }

        return {
            id: event.id || `${event.startTime || ""}:${event.title}`,
            title: event.title || "",
            startsAt: event.startTime || null,
            endsAt: event.endTime || null,
            allDay,
            state: allDay || (Number.isFinite(start) && start <= now.getTime())
                ? "active"
                : "upcoming"
        };
    }

    compareCalendarItems(first, second) {
        const rank = (item) => {
            if (!item.allDay && item.state === "active") return 0;
            if (!item.allDay && item.state === "upcoming") return 1;
            return 2;
        };

        return rank(first) - rank(second) ||
            (Date.parse(first.startsAt) || 0) -
                (Date.parse(second.startsAt) || 0) ||
            first.id.localeCompare(second.id);
    }

    normalizeInsights(now = this.getNow()) {
        return this.weatherInsights
            .filter((insight) => {
                const expiration = Date.parse(insight?.expiresAt);

                return insight?.headline && insight?.summary &&
                    (!Number.isFinite(expiration) ||
                        expiration > now.getTime());
            })
            .sort((first, second) =>
                (second.priority || 0) - (first.priority || 0)
            )
            .map((insight) => ({
                id: insight.id || "",
                source: insight.source || "weather",
                type: insight.type || "weather.insight",
                priority: insight.priority || 0,
                emphasis: insight.emphasis || "standard",
                headline: insight.headline,
                summary: insight.summary,
                createdAt: insight.createdAt || null,
                expiresAt: insight.expiresAt || null
            }));
    }

    scheduleTemporalUpdates(now = this.getNow()) {
        this.scheduleBoundaryUpdate(now);
        this.scheduleInsightExpiration(now);
    }

    scheduleBoundaryUpdate(now) {
        this.clearTimer("boundaryTimer");

        const boundaries = [
            new Date(now),
            new Date(now),
            new Date(now)
        ];
        boundaries[0].setHours(12, 0, 0, 0);
        boundaries[1].setHours(18, 0, 0, 0);
        boundaries[2].setHours(24, 0, 0, 0);
        const next = boundaries.find((boundary) => boundary > now) ||
            boundaries[2];

        this.boundaryTimer = setTimeout(
            () => this.publishSnapshot(),
            Math.min(next.getTime() - now.getTime(), 2 ** 31 - 1)
        );
    }

    scheduleInsightExpiration(now) {
        this.clearTimer("insightExpirationTimer");

        const expiration = this.weatherInsights
            .map((insight) => Date.parse(insight?.expiresAt))
            .filter((value) => Number.isFinite(value) && value > now.getTime())
            .sort((first, second) => first - second)[0];

        if (!expiration) return;

        this.insightExpirationTimer = setTimeout(
            () => this.publishSnapshot(),
            Math.min(expiration - now.getTime(), 2 ** 31 - 1)
        );
    }

    clearTimer(key) {
        if (this[key] !== null) clearTimeout(this[key]);
        this[key] = null;
    }

    getLocalDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    createHeadline(now, profileName = "") {
        const hour = now.getHours();
        const name = profileName.trim();
        let greeting;

        if (hour < 12) greeting = "Good Morning";
        else if (hour < 18) greeting = "Good Afternoon";
        else greeting = "Good Evening";

        return name ? `${greeting} ${name}` : greeting;
    }

    createRestingRows(context, now = this.getNow()) {
        const normalizedContext = context?.schemaVersion === 1
            ? context
            : this.createCompatibilityContext(context, now);
        const sportsText = normalizedContext.sports
            .map((item) => this.formatNormalizedSportsItem(item, now))
            .find(Boolean) || "";
        const calendarLimit = this.maximumRestingRows -
            (sportsText ? 1 : 0);
        const calendarRows = normalizedContext.calendar
            .map((item) => ({
                type: "calendar",
                text: this.formatNormalizedCalendarItem(item)
            }))
            .filter((row) => row.text)
            .slice(0, calendarLimit);

        if (sportsText) {
            calendarRows.push({
                type: "sports",
                text: sportsText
            });
        }

        return calendarRows;
    }

    createCompatibilityContext(facts = {}, now = this.getNow()) {
        const legacySports = facts.sports?.favoriteTeam &&
            !facts.sports.favoriteTeam.id
            ? {
                ...facts.sports,
                favoriteTeam: {
                    ...facts.sports.favoriteTeam,
                    id: "legacy"
                }
            }
            : facts.sports;
        const sports = this.normalizeSportsItem(legacySports, now);

        return {
            schemaVersion: 1,
            sports: sports ? [sports] : [],
            calendar: this.normalizeCalendar(facts.calendar, now)
        };
    }

    formatNormalizedSportsItem(item, now) {
        const teamName = [
            item.favoriteTeam?.shortName,
            item.favoriteTeam?.name,
            item.favoriteTeam?.abbreviation
        ].find((value) => typeof value === "string" && value.trim())
            ?.trim();

        if (!teamName) return "";
        if (item.state === "completed") return item.result || "";
        if (item.state !== "upcoming") return "";

        const start = new Date(item.startsAt);

        if (!Number.isFinite(start.getTime())) return "";

        const time = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit"
        }).format(start);

        return `${teamName} play ` +
            `${this.getScheduledGameDaypart(start)} at ${time}.`;
    }

    formatNormalizedCalendarItem(item) {
        if (!item?.title || item.allDay) return item?.title || "";

        const start = new Date(item.startsAt);

        if (!Number.isFinite(start.getTime())) return item.title;

        const time = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit"
        }).format(start);

        return `${item.title} — ${time}`;
    }

    createCalendarRows(calendar, now = new Date()) {
        if (calendar?.status !== "available") return [];

        const events = [
            ...(Array.isArray(calendar.allDayEvents)
                ? calendar.allDayEvents
                : []),
            ...(Array.isArray(calendar.timedEvents)
                ? calendar.timedEvents
                : [])
        ];

        return events
            .filter((event) => this.isRemainingCalendarEvent(event, now))
            .sort((first, second) =>
                Date.parse(first.startTime) - Date.parse(second.startTime)
            )
            .map((event) => ({
                type: "calendar",
                text: this.formatCalendarEvent(event)
            }))
            .filter((row) => row.text);
    }

    isRemainingCalendarEvent(event, now) {
        if (!event?.title) return false;
        if (event.allDay === true) return true;

        const end = Date.parse(event.endTime || event.startTime);

        return Number.isFinite(end) && end >= now.getTime();
    }

    formatCalendarEvent(event) {
        const title = typeof event?.title === "string"
            ? event.title.trim()
            : "";

        if (!title || event.allDay === true) return title;

        const start = new Date(event.startTime);

        if (!Number.isFinite(start.getTime())) return title;

        const time = new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit"
        }).format(start);

        return `${title} — ${time}`;
    }

    getDayPeriod(now) {
        const hour = now.getHours();

        if (hour < 12) return "morning";
        if (hour < 18) return "afternoon";

        return "evening";
    }

    createRestingHighlights(context) {
        const insight = context?.insights?.[0];

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
        const sports = [...this.sportsFactsById.values()][0] || {
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
