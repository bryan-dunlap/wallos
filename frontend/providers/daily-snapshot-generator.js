class DailySnapshotGenerator {

    async start() {
        const profile = await this.loadProfile();

        this.publishSnapshot(profile);
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

    publishSnapshot(profile = { name: "" }) {
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
                    headline: this.createHeadline(now, profile.name),
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

    getPlaceholderFacts() {
        return {
            // Future Calendar facts will replace these placeholders.
            calendar: {
                eventsRemaining: 0,
                eventsCompleted: 0,
                nextEvent: null,
                tomorrowFirstEvent: null
            },
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
