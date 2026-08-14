class SportsProvider {

    constructor() {
        this.refreshTimer = null;
    }

    start() {
        this.stop();
        this.refresh();
        this.refreshTimer = setInterval(
            () => this.refresh(),
            5 * 60 * 1000
        );
        this.loadConfig().then(
            (config) => this.publishSportsFacts(config)
        );
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

    publishSportsFacts(config, gameStatus = "scheduled") {
        /*
         * Simulated facts establish the future Sports contract. A real
         * sports data source will later replace only this facts payload.
         * Scheduled, live, and final examples intentionally share one shape.
         */
        const payload = config.enabled && config.favoriteTeam
            ? {
                status: "available",
                favoriteTeam: {
                    id: config.favoriteTeam.id,
                    name: config.favoriteTeam.name,
                    league: config.favoriteTeam.league,
                    sport: config.favoriteTeam.sport,
                    renderer: config.favoriteTeam.renderer
                },
                game: this.createSimulatedGame(gameStatus)
            }
            : {
                status: "unavailable",
                favoriteTeam: config.favoriteTeam
                    ? {
                        id: config.favoriteTeam.id,
                        name: config.favoriteTeam.name,
                        league: config.favoriteTeam.league,
                        sport: config.favoriteTeam.sport,
                        renderer: config.favoriteTeam.renderer
                    }
                    : null,
                game: null
            };

        window.mosaicApp.eventBus.publish({
            type: "sports-facts",
            source: "sports",
            payload
        });
    }

    createSimulatedGame(status) {
        const commonGame = {
            status,
            opponent: "Los Angeles Angels",
            startTime: "2026-08-12T19:10:00-07:00",
            score: null,
            inning: null,
            outs: null,
            count: null,
            bases: null,
            lineScore: null,
            result: null
        };

        if (status === "live") {
            return {
                ...commonGame,
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
                },
                lineScore: {
                    innings: [
                        { number: 1, favoriteTeam: 0, opponent: 0 },
                        { number: 2, favoriteTeam: 1, opponent: 0 },
                        { number: 3, favoriteTeam: 0, opponent: 0 },
                        { number: 4, favoriteTeam: 0, opponent: 1 },
                        { number: 5, favoriteTeam: 0, opponent: 0 },
                        { number: 6, favoriteTeam: 2, opponent: 0 },
                        { number: 7, favoriteTeam: 0, opponent: 1 }
                    ],
                    favoriteTeam: {
                        runs: 3,
                        hits: 7,
                        errors: 0
                    },
                    opponent: {
                        runs: 2,
                        hits: 6,
                        errors: 0
                    }
                }
            };
        }

        if (status === "final") {
            return {
                ...commonGame,
                score: {
                    favoriteTeam: 5,
                    opponent: 3
                },
                result: "Mariners win 5-3"
            };
        }

        return {
            ...commonGame,
            status: "scheduled"
        };
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
