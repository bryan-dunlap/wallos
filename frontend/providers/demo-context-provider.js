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
        this.celebrationSequence = 0;
        this.displayedSimulationGameId = null;
        this.pendingScoreCelebrations = [];
        this.unsubscribeHeroDisplay = null;
        this.unsubscribeOwnershipState = null;
        this.ownershipSimulationCandidates = new Map();
        this.ownershipSimulationState = null;
        this.ownershipSimulationScenario = null;
        this.palettePreviewSequence = 0;
    }

    start() {
        if (!this.unsubscribeHeroDisplay) {
            this.unsubscribeHeroDisplay =
                window.mosaicApp.eventBus.subscribe(
                    "hero-display",
                    (event) => this.handleHeroDisplay(
                        event.payload?.candidate
                    )
                );
        }
        if (!this.unsubscribeOwnershipState) {
            this.unsubscribeOwnershipState =
                window.mosaicApp.eventBus.subscribe(
                    "gamecast-ownership-simulation-state",
                    (event) => this.handleOwnershipState(event.payload)
                );
        }

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
            celebrate: (eventType) =>
                this.triggerScoreCelebration(eventType),
            clear: () => this.clearSportsSimulation()
        };
        window.mosaicDemo.gamecastOwnership = {
            testRotation: () =>
                this.startOwnershipScenario("rotation"),
            marinersPriority: () =>
                this.startOwnershipScenario("mariners-priority"),
            seahawksPriority: () =>
                this.startOwnershipScenario("seahawks-priority"),
            testSingleGame: () =>
                this.startOwnershipScenario("single-game"),
            reset: () => this.resetOwnershipSimulation()
        };
        window.mosaicDemo.teamPalette = {
            preview: (teamId) => this.previewTeamPalette(teamId),
            reset: () => this.clearSportsSimulation()
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

                if (event.data?.action === "celebrate") {
                    this.triggerScoreCelebration(event.data.eventType);
                }

                if (event.data?.action === "palette-preview") {
                    this.previewTeamPalette(event.data.teamId);
                }

                if (event.data?.action === "ownership") {
                    this.handleOwnershipAction(event.data.command);
                }

                if (event.data?.action === "ownership-status-request") {
                    this.publishOwnershipStatus();
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

    handleHeroDisplay(candidate) {
        const identity = candidate?.gamecastIdentity;
        const isDisplayedGamecast = Boolean(
            candidate?.source === "sports" &&
            candidate?.simulation === true &&
            candidate?.mode === "active" &&
            ["baseball-game", "football-game"].includes(
                candidate?.payload?.type
            ) &&
            typeof identity?.gameId === "string" &&
            identity.gameId
        );

        this.displayedSimulationGameId = isDisplayedGamecast
            ? identity.gameId
            : null;

        if (!this.displayedSimulationGameId) return;

        const ready = this.pendingScoreCelebrations.filter(
            (pending) =>
                pending.gameId === this.displayedSimulationGameId
        );
        this.pendingScoreCelebrations =
            this.pendingScoreCelebrations.filter(
                (pending) =>
                    pending.gameId !== this.displayedSimulationGameId
            );
        ready.forEach((pending) => this.publishScoreEvent(pending.event));
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

        if (!facts) return null;

        this.publishSportsSimulationState(true);
        this.publishSportsFacts(facts);
        return facts;
    }

    triggerScoreCelebration(eventType) {
        const definitions = {
            run: {
                league: "MLB", scenario: "live-bottom",
                points: 1, intensity: "score"
            },
            "home-run": {
                league: "MLB", scenario: "live-bottom",
                points: 1, intensity: "major"
            },
            touchdown: {
                league: "NFL", scenario: "live-drive",
                points: 6, intensity: "major"
            },
            "field-goal": {
                league: "NFL", scenario: "live-drive",
                points: 3, intensity: "score"
            }
        };
        const definition = definitions[eventType];

        if (!definition) return null;

        const facts = window.sportsSimulationProfileRegistry
            ?.createFacts(
                definition.league,
                definition.scenario
            );

        if (!facts) return null;

        const gamecast = facts.game.gamecast || facts.game;
        const ownershipGameId = this.ownershipSimulationCandidates
            .get(definition.league)?.gamecastIdentity?.gameId;
        const rawGameId = gamecast.eventId ||
            `simulation:${definition.league.toLowerCase()}:gamecast`;
        const gameId = ownershipGameId || this.qualifySimulationIdentity(
            definition.league,
            rawGameId
        );
        const scoringTeamId = this.qualifySimulationIdentity(
            definition.league,
            facts.favoriteTeam.id
        );
        const score = gamecast.score || { away: 0, home: 0 };
        const currentScore = {
            away: score.away ?? 0,
            home: score.home ?? 0
        };
        const previousScore = {
            ...currentScore,
            away: Math.max(0, currentScore.away - definition.points)
        };
        this.celebrationSequence += 1;
        const event = {
            schemaVersion: 1,
            id: `simulation-score:${this.celebrationSequence}`,
            gameId,
            sport: facts.favoriteTeam.sport,
            league: definition.league,
            scoringTeamId,
            scoringSide: "away",
            eventType,
            points: definition.points,
            intensity: definition.intensity,
            previousScore,
            currentScore,
            providerEventId: null,
            period: null,
            gameClock: null,
            occurredAt: null,
            observedAt: new Date().toISOString(),
            sourceRevision: null,
            simulation: true
        };

        if (this.ownershipSimulationCandidates.size > 0) {
            this.publishScoreEvent(event);
            return event;
        }

        if (this.displayedSimulationGameId === gameId) {
            this.publishScoreEvent(event);
            return event;
        }

        this.pendingScoreCelebrations.push({ gameId, event });
        this.publishSportsSimulationState(true);
        this.publishSportsFacts(facts);
        return event;
    }

    publishScoreEvent(event) {
        window.mosaicApp.eventBus.publish({
            type: "gamecast-score-event",
            source: "sports-simulator",
            payload: event
        });
    }

    qualifySimulationIdentity(league, value) {
        const prefix = `${league}:`;
        const normalized = String(value || "").toUpperCase();
        return normalized.startsWith(prefix)
            ? normalized
            : `${prefix}${normalized}`;
    }

    clearSportsSimulation() {
        this.palettePreviewSequence += 1;
        this.displayedSimulationGameId = null;
        this.pendingScoreCelebrations = [];
        this.publishSportsFacts({
            status: "unavailable",
            simulation: true,
            favoriteTeam: null,
            game: null
        });
        this.publishSportsSimulationState(false);
        this.publishPalettePreviewStatus("Idle");
    }

    async previewTeamPalette(teamId) {
        const team = window.teamPalettePreviewTeams?.find(
            (candidate) => candidate.teamId === teamId
        );
        const store = window.mosaicApp.teamPaletteStore;
        if (!team || !store) return null;

        const baseFacts = window.sportsSimulationProfileRegistry
            ?.createFacts(
                team.league,
                team.league === "NFL" ? "live-drive" : "live-bottom"
            );
        if (!baseFacts) return null;

        const sequence = ++this.palettePreviewSequence;
        const abbreviation = team.teamId.split(":").at(-1);
        const opponent = [
            baseFacts.game.teams.away,
            baseFacts.game.teams.home
        ].find((candidate) =>
            this.qualifySimulationIdentity(team.league, candidate.id) !==
                team.teamId
        );
        const previewTeam = {
            id: team.teamId,
            abbreviation,
            name: team.name,
            shortName: team.name.split(" ").at(-1),
            league: team.league,
            sport: team.sport,
            logo: team.logo
        };
        const rawGameId = `PALETTE-PREVIEW:${abbreviation}`;
        const gameId = this.qualifySimulationIdentity(
            team.league,
            rawGameId
        );
        const gamecast = {
            ...(baseFacts.game.gamecast || {}),
            eventId: rawGameId
        };
        const facts = {
            ...baseFacts,
            simulation: true,
            favoriteTeam: previewTeam,
            game: {
                ...baseFacts.game,
                eventId: rawGameId,
                opponent: opponent.name,
                teams: { away: previewTeam, home: opponent },
                gamecast
            }
        };

        this.publishPalettePreviewStatus("Resolving");
        this.publishSportsSimulationState(true);
        this.publishSportsFacts(facts);
        await store.preload([{
            teamId: team.teamId,
            logoUrl: team.logo
        }]);

        if (sequence !== this.palettePreviewSequence) return null;
        if (!store.getCached({ teamId: team.teamId, logoUrl: team.logo })) {
            this.publishPalettePreviewStatus("Unavailable");
            return null;
        }

        this.publishPalettePreviewStatus("Ready");
        this.celebrationSequence += 1;
        const event = {
            schemaVersion: 1,
            id: `palette-preview-score:${this.celebrationSequence}`,
            gameId,
            sport: team.sport,
            league: team.league,
            scoringTeamId: team.teamId,
            scoringSide: "away",
            eventType: team.league === "NFL" ? "touchdown" : "run",
            points: team.league === "NFL" ? 6 : 1,
            intensity: "score",
            observedAt: new Date().toISOString(),
            simulation: true
        };

        if (this.displayedSimulationGameId === gameId) {
            this.publishScoreEvent(event);
        } else {
            this.pendingScoreCelebrations.push({ gameId, event });
        }
        return event;
    }

    publishPalettePreviewStatus(status) {
        this.sportsDemoChannel?.postMessage({
            action: "palette-preview-status",
            status
        });
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

    handleOwnershipAction(command) {
        const actions = {
            rotation: () => this.startOwnershipScenario("rotation"),
            "mariners-priority": () =>
                this.startOwnershipScenario("mariners-priority"),
            "seahawks-priority": () =>
                this.startOwnershipScenario("seahawks-priority"),
            "single-game": () =>
                this.startOwnershipScenario("single-game"),
            reset: () => this.resetOwnershipSimulation()
        };
        return actions[command]?.() || null;
    }

    startOwnershipScenario(scenario) {
        this.resetOwnershipSimulation();
        const definitions = {
            rotation: { nflCritical: false, mlbCritical: false },
            "mariners-priority": {
                nflCritical: false, mlbCritical: true
            },
            "seahawks-priority": {
                nflCritical: true, mlbCritical: true
            },
            "single-game": { nflCritical: false, mlb: false }
        };
        const definition = definitions[scenario];
        if (!definition) return null;

        this.ownershipSimulationScenario = scenario;
        const nfl = this.createOwnershipCandidate(
            "NFL", 0, definition.nflCritical
        );
        const mlb = definition.mlb === false
            ? null
            : this.createOwnershipCandidate(
                "MLB", 1, definition.mlbCritical
            );
        if (!nfl || (definition.mlb !== false && !mlb)) return null;

        this.ownershipSimulationCandidates.set("NFL", nfl);
        this.publishOwnershipCandidate(nfl);
        if (mlb) {
            this.ownershipSimulationCandidates.set("MLB", mlb);
            this.publishOwnershipCandidate(mlb);
        }
        return { nfl, mlb };
    }

    createOwnershipCandidate(league, favoriteRank, critical = false) {
        const scenario = league === "NFL" ? "live-drive" : "live-bottom";
        const facts = window.sportsSimulationProfileRegistry
            ?.createFacts(league, scenario);
        if (!facts || typeof SportsActiveContextGenerator === "undefined") {
            return null;
        }

        const candidate = new SportsActiveContextGenerator()
            .createLiveGameCandidate(facts);
        if (!candidate) return null;

        return {
            ...candidate,
            id: `sports:ownership-simulation:${league.toLowerCase()}`,
            priority: candidate.priority + 1,
            simulation: true,
            gamecastIdentity: {
                ...candidate.gamecastIdentity,
                gameId: league === "NFL"
                    ? "NFL:OWNERSHIP-SIM:SEA-SF"
                    : "MLB:OWNERSHIP-SIM:SEA-LAA"
            },
            gamecastOwnership: { favoriteRank, critical }
        };
    }

    endOwnershipGamecast(league) {
        const candidate = this.ownershipSimulationCandidates.get(league);
        if (!candidate) return false;
        this.ownershipSimulationCandidates.delete(league);
        window.mosaicApp.eventBus.publish({
            type: "gamecast-ownership-simulation-withdraw",
            source: "sports-simulator",
            payload: { id: candidate.id }
        });
        return true;
    }

    resetOwnershipSimulation() {
        [...this.ownershipSimulationCandidates.keys()].forEach(
            (league) => this.endOwnershipGamecast(league)
        );
        this.ownershipSimulationCandidates.clear();
        this.ownershipSimulationState = null;
        this.ownershipSimulationScenario = null;
        this.publishOwnershipStatus();
    }

    publishOwnershipCandidate(candidate) {
        window.mosaicApp.eventBus.publish({
            type: "gamecast-ownership-simulation-candidate",
            source: "sports-simulator",
            payload: { candidate }
        });
    }

    handleOwnershipState(state) {
        this.ownershipSimulationState = state;
        this.publishOwnershipStatus();
    }

    publishOwnershipStatus() {
        this.sportsDemoChannel?.postMessage({
            action: "ownership-status",
            state: this.ownershipSimulationState,
            scenario: this.ownershipSimulationScenario
        });
    }

}
