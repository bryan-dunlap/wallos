class SportsProvider {

    constructor() {
        this.refreshTimer = null;
        this.mlbDataProvider = new MlbDataProvider();
    }

    start() {
        this.stop();
        this.refreshCycle();
        this.refreshTimer = setInterval(
            () => this.refreshCycle(),
            5 * 60 * 1000
        );
    }

    async refreshCycle() {
        await this.refresh();
        await this.refreshSportsFacts();
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
            // Version 0.1 continues using the first favorite. The collection
            // later enables multiple games, leagues, and priority selection.
            const favoriteTeam = favoriteTeams[0] || null;

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
                    renderer: "baseball-gamecast"
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
            config = await this.loadConfig();

            if (!config.enabled || !config.favoriteTeam) {
                this.publishSportsFacts(
                    this.mlbDataProvider.createUnavailableFacts(
                        config.favoriteTeam
                    )
                );
                return;
            }

            const facts = await this.mlbDataProvider.getScheduleFacts(
                config.favoriteTeam,
                this.getDateKey(new Date())
            );

            this.publishSportsFacts(facts);
        } catch (error) {
            console.error(
                "Unable to load favorite-team MLB schedule:",
                error
            );
            this.publishSportsFacts(
                this.mlbDataProvider.createUnavailableFacts(
                    config?.favoriteTeam
                )
            );
        }
    }

    stop() {
        if (!this.refreshTimer) return;

        clearInterval(this.refreshTimer);
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
                error.sport = scheduleData.sport;
                throw error;
            }

            const games = Array.isArray(
                scheduleData.sportsEvents
            )
                ? scheduleData.sportsEvents
                : [];
            this.publishSportsEvent(
                scheduleData.sport || "MLB",
                games
            );
        } catch (error) {
            console.error(
                "Unable to load sports:",
                error
            );

            this.publishUnavailableEvent(error.sport);
        }
    }

    publishSportsEvent(sport, games) {
        const normalizedGames = games.map(
            (game) => this.normalizeGame(game)
        );
        const event = createMosaicEvent({
            type: "sports",
            title: "Sports Update",
            subtitle: normalizedGames.length === 1
                ? "1 MLB game today"
                : `${normalizedGames.length} MLB games today`,
            source: "sports",
            payload: {
                sport: sport || "MLB",
                games: normalizedGames,
                availability: "available"
            }
        });

        window.mosaicApp.eventBus.publish(event);
    }

    publishUnavailableEvent(sport = "MLB") {
        const event = createMosaicEvent({
            type: "sports",
            title: "Sports Update",
            subtitle: "Sports unavailable",
            source: "sports",
            payload: {
                sport,
                games: [],
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
