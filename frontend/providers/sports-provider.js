const SPORTS_REFRESH_INTERVAL_MS = 5 * 60 * 1000;

class SportsProvider {

    constructor() {
        this.refreshTimer = null;
        this.refreshInFlight = null;
        this.unsubscribeSimulationState = null;
        this.simulationActive = false;
        this.lifecycleVersion = 0;
        this.mlbDataProvider = new MlbDataProvider();
    }

    start() {
        this.stop();
        const lifecycleVersion = this.lifecycleVersion;
        this.unsubscribeSimulationState =
            window.mosaicApp.eventBus.subscribe(
                "sports-simulation-state",
                (event) => this.handleSimulationState(
                    event.payload?.active
                )
            );

        this.runRefreshLoop(lifecycleVersion);
    }

    async runRefreshLoop(lifecycleVersion) {
        await this.runRefreshCycle();

        if (lifecycleVersion !== this.lifecycleVersion) return;

        this.refreshTimer = setTimeout(
            () => this.runRefreshLoop(lifecycleVersion),
            SPORTS_REFRESH_INTERVAL_MS
        );
    }

    async refreshCycle() {
        await this.refresh();
        return this.refreshSportsFacts();
    }

    runRefreshCycle() {
        if (this.refreshInFlight) return this.refreshInFlight;

        this.refreshInFlight = this.refreshCycle()
            .finally(() => {
                this.refreshInFlight = null;
            });

        return this.refreshInFlight;
    }

    handleSimulationState(active) {
        this.simulationActive = active === true;

        if (!this.simulationActive) this.runRefreshCycle();
    }

    async loadConfig() {
        try {
            const response = await fetch("/api/config");

            if (!response.ok) throw new Error("Config unavailable");

            const config = await response.json();
            const favoriteTeams = Array.isArray(
                config.sports?.favoriteTeams
            )
                ? config.sports.favoriteTeams
                : [];
            // The current facts adapter is MLB-only. Other league favorites
            // remain configured for future adapters without being sent to the
            // MLB data path.
            const favoriteTeam = favoriteTeams.find(
                (team) => team?.league === "MLB"
            ) || null;

            return {
                enabled: config.sports?.enabled !== false,
                favoriteTeam
            };
        } catch (error) {
            return {
                enabled: true,
                favoriteTeam: {
                    id: "SEA",
                    name: "Seattle Mariners",
                    league: "MLB",
                    sport: "baseball",
                    renderer: "baseball-gamecast",
                    providerId: 136,
                    logo: "https://www.mlbstatic.com/team-logos/136.svg"
                }
            };
        }
    }

    publishSportsFacts(payload) {
        window.mosaicApp.eventBus.publish({
            type: "sports-facts",
            source: "sports",
            payload
        });
    }

    async refreshSportsFacts() {
        let config = null;

        try {
            if (this.simulationActive) return null;

            config = await this.loadConfig();

            if (!config.enabled || !config.favoriteTeam) {
                this.publishSportsFacts(
                    this.mlbDataProvider.createUnavailableFacts(
                        config.favoriteTeam
                    )
                );
                return null;
            }

            const facts = await this.mlbDataProvider.getScheduleFacts(
                config.favoriteTeam,
                this.getDateKey(new Date())
            );

            if (this.simulationActive) return null;

            this.publishSportsFacts(facts);
            return facts.game?.status || null;
        } catch (error) {
            console.error(
                "Unable to load favorite-team MLB schedule:",
                error
            );
            if (!this.simulationActive) {
                this.publishSportsFacts(
                    this.mlbDataProvider.createUnavailableFacts(
                        config?.favoriteTeam
                    )
                );
            }
            return null;
        }
    }

    stop() {
        this.lifecycleVersion += 1;

        if (this.unsubscribeSimulationState) {
            this.unsubscribeSimulationState();
            this.unsubscribeSimulationState = null;
        }

        if (!this.refreshTimer) return;

        clearTimeout(this.refreshTimer);
        this.refreshTimer = null;
    }

    async refresh() {
        try {
            const date = this.getDateKey(new Date());
            const response = await fetch(
                `/api/sports?date=${encodeURIComponent(date)}`
            );
            const scheduleData = await response.json();

            if (!response.ok) {
                const error = new Error(
                    `Sports request failed: ${response.status}`
                );
                throw error;
            }

            const leagues = normalizeSportsScheduleLeagues(
                scheduleData,
                (game, league) => league === "MLB"
                    ? this.normalizeGame(game)
                    : game
            );
            this.publishSportsEvent(leagues);
        } catch (error) {
            console.error(
                "Unable to load sports:",
                error
            );

            this.publishUnavailableEvent();
        }
    }

    publishSportsEvent(leagues) {
        const gameCount = leagues.reduce(
            (count, league) => count + league.games.length,
            0
        );
        const event = createMosaicEvent({
            type: "sports",
            title: "Sports Update",
            subtitle: gameCount === 1
                ? "1 game today"
                : `${gameCount} games today`,
            source: "sports",
            payload: {
                leagues,
                availability: "available"
            }
        });

        window.mosaicApp.eventBus.publish(event);
    }

    publishUnavailableEvent() {
        const event = createMosaicEvent({
            type: "sports",
            title: "Sports Update",
            subtitle: "Sports unavailable",
            source: "sports",
            payload: {
                leagues: [],
                availability: "unavailable"
            }
        });

        window.mosaicApp.eventBus.publish(event);
    }

    normalizeGame(game) {
        return {
            eventId: game.eventId,
            scheduledAt: game.scheduledAt,
            scheduledTime: game.scheduledTime,
            status: {
                ...game.status,
                state: game.status?.state === "Preview"
                    ? "Scheduled"
                    : game.status?.state
            },
            linescore: game.linescore || null,
            awayTeam: this.normalizeTeam(
                game.awayTeam
            ),
            homeTeam: this.normalizeTeam(
                game.homeTeam
            )
        };
    }

    normalizeTeam(team = {}) {
        return {
            name: team.name || "Team TBD",
            abbreviation: team.abbreviation || "",
            logo: team.logo || "",
            record: team.record || {
                wins: null,
                losses: null
            },
            runs: team.runs ?? null,
            hits: team.hits ?? null,
            errors: team.errors ?? null
        };
    }

    getDateKey(date) {
        const year = date.getFullYear();
        const month = String(
            date.getMonth() + 1
        ).padStart(2, "0");
        const day = String(
            date.getDate()
        ).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

}

function normalizeSportsScheduleLeagues(
    scheduleData = {},
    normalizeGame = (game) => game
) {
    const sourceLeagues = Array.isArray(scheduleData.leagues)
        ? scheduleData.leagues
        : [{
            league: scheduleData.sport || "MLB",
            availability: "available",
            sportsEvents: Array.isArray(scheduleData.sportsEvents)
                ? scheduleData.sportsEvents
                : [],
            updatedAt: scheduleData.updatedAt,
            stale: scheduleData.stale === true
        }];

    return sourceLeagues
        .filter((entry) =>
            typeof entry?.league === "string" &&
            entry.league.trim()
        )
        .map((entry) => {
            const league = entry.league.trim().toUpperCase();

            return {
                league,
                availability: entry.availability || "unavailable",
                games: Array.isArray(entry.sportsEvents)
                    ? entry.sportsEvents.map(
                        (game) => normalizeGame(game, league)
                    )
                    : [],
                updatedAt: entry.updatedAt || null,
                stale: entry.stale === true
            };
        });
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { normalizeSportsScheduleLeagues };
}
