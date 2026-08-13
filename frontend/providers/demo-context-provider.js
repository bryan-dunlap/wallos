/*
 * Temporary development infrastructure for exercising Hero context modes.
 * Remove this provider when real active and interrupt generators are ready.
 */
class DemoContextProvider {

    constructor() {
        this.candidateIds = [
            "demo:resting",
            "demo:active",
            "demo:interrupt"
        ];
    }

    start() {
        window.mosaicDemo = window.mosaicDemo || {};
        window.mosaicDemo.hero = {
            resting: () => this.publishCandidate({
                id: "demo:resting",
                source: "demo",
                type: "demo.resting",
                mode: "resting",
                priority: 10,
                behavior: {
                    sticky: false,
                    durationSeconds: null
                },
                headline: "Clear evening ahead",
                summary: "72° with calm conditions"
            }),
            active: () => this.publishCandidate({
                id: "demo:active",
                source: "demo",
                type: "demo.active",
                mode: "active",
                priority: 50,
                behavior: {
                    sticky: true,
                    durationSeconds: null
                },
                headline: "Mariners Live",
                summary: "SEA 3 - LAA 2 | Bottom 7th"
            }),
            interrupt: () => this.publishCandidate({
                id: "demo:interrupt",
                source: "demo",
                type: "demo.interrupt",
                mode: "interrupt",
                priority: 90,
                behavior: {
                    sticky: false,
                    durationSeconds: 30
                },
                headline: "Meeting in 5 minutes",
                summary: "Operations Review"
            }),
            clear: () => this.clearCandidates()
        };

        /*
         * Temporary Calendar reminder test helpers. These publish only
         * calendar-facts so production reminder rules remain authoritative.
         */
        window.mosaicDemo.calendar = {
            triggerReminder: (minutesUntilEvent) =>
                this.triggerCalendarReminder(minutesUntilEvent),
            clearReminder: () => this.clearCalendarReminder()
        };

        /*
         * Temporary Sports facts helpers. These never publish Hero events;
         * production context generators remain responsible for Hero state.
         */
        window.mosaicDemo.sports = {
            scheduled: () => this.publishSportsState("scheduled"),
            live: () => this.publishSportsState("live"),
            final: () => this.publishSportsState("final"),
            clear: () => this.clearSportsFacts()
        };
    }

    publishCandidate(candidate) {
        window.mosaicApp.eventBus.publish({
            type: "hero-candidate",
            source: "demo",
            payload: {
                candidate
            }
        });
    }

    clearCandidates() {
        this.candidateIds.forEach((id) => {
            window.mosaicApp.eventBus.publish({
                type: "hero-candidate-withdraw",
                source: "demo",
                payload: {
                    id
                }
            });
        });
    }

    triggerCalendarReminder(minutesUntilEvent) {
        const supportedCheckpoints = [30, 15, 5, 0];

        if (!supportedCheckpoints.includes(minutesUntilEvent)) {
            throw new RangeError(
                "Reminder minutes must be 30, 15, 5, or 0."
            );
        }

        const checkpointLeadMs = 50;
        const start = new Date(
            Date.now() +
            minutesUntilEvent * 60 * 1000 +
            checkpointLeadMs
        ).toISOString();

        this.publishCalendarFacts({
            status: "available",
            eventsToday: 1,
            remainingToday: 1,
            nextEvent: {
                title: "Operations Review",
                start
            }
        });
    }

    clearCalendarReminder() {
        this.publishCalendarFacts({
            status: "available",
            eventsToday: 0,
            remainingToday: 0,
            nextEvent: null
        });
    }

    publishCalendarFacts(payload) {
        window.mosaicApp.eventBus.publish({
            type: "calendar-facts",
            source: "demo",
            payload
        });
    }

    publishSportsState(status) {
        const startTime = new Date();
        startTime.setHours(19, 10, 0, 0);

        const game = {
            status,
            opponent: "Los Angeles Angels",
            startTime: startTime.toISOString(),
            score: null,
            inning: null,
            outs: null,
            count: null,
            bases: null,
            result: null
        };

        if (status === "live") {
            Object.assign(game, {
                score: {
                    favoriteTeam: 3,
                    opponent: 2
                },
                inning: {
                    half: "bottom",
                    number: 7
                },
                outs: 1,
                count: {
                    balls: 2,
                    strikes: 1
                },
                bases: {
                    first: false,
                    second: true,
                    third: false
                }
            });
        }

        if (status === "final") {
            Object.assign(game, {
                score: {
                    favoriteTeam: 5,
                    opponent: 3
                },
                result: "Mariners win 5-3"
            });
        }

        this.publishSportsFacts({
            status: "available",
            favoriteTeam: {
                id: "SEA",
                name: "Seattle Mariners"
            },
            game
        });
    }

    clearSportsFacts() {
        this.publishSportsFacts({
            status: "unavailable",
            favoriteTeam: {
                id: "SEA",
                name: "Seattle Mariners"
            },
            game: null
        });
    }

    publishSportsFacts(payload) {
        window.mosaicApp.eventBus.publish({
            type: "sports-facts",
            source: "demo",
            payload
        });
    }

}
