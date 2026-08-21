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
        this.sportsDemoChannel = null;
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
            run: (profileId, scenarioId) =>
                this.runSportsSimulation(profileId, scenarioId),
            scheduled: () =>
                this.runSportsSimulation("MLB", "scheduled"),
            live: () =>
                this.runSportsSimulation("MLB", "live-bottom"),
            final: () =>
                this.runSportsSimulation("MLB", "final"),
            clear: () => this.clearSportsSimulation()
        };

        this.startSportsDemoChannel();
    }

    startSportsDemoChannel() {
        if (
            this.sportsDemoChannel ||
            typeof BroadcastChannel !== "function"
        ) {
            return;
        }

        this.sportsDemoChannel = new BroadcastChannel(
            "mosaic-sports-demo"
        );
        this.sportsDemoChannel.addEventListener(
            "message",
            (event) => {
                if (event.data?.action === "run") {
                    this.runSportsSimulation(
                        event.data.profileId,
                        event.data.scenarioId
                    );
                }

                if (event.data?.action === "clear") {
                    this.clearSportsSimulation();
                }
            }
        );
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

    runSportsSimulation(profileId, scenarioId) {
        const facts = window.sportsSimulationProfileRegistry
            ?.createFacts(profileId, scenarioId);

        if (!facts) return;

        this.publishSportsSimulationState(true);
        this.publishSportsFacts(facts);
    }

    clearSportsSimulation() {
        this.publishSportsFacts({
            status: "unavailable",
            simulation: true,
            favoriteTeam: null,
            game: null
        });
        this.publishSportsSimulationState(false);
    }

    publishSportsSimulationState(active) {
        window.mosaicApp.eventBus.publish({
            type: "sports-simulation-state",
            source: "sports-simulator",
            payload: { active }
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
