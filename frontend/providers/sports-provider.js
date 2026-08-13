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

            return {
                enabled: config.sports?.enabled !== false,
                favoriteTeam:
                    typeof config.sports?.favoriteTeam === "string"
                        ? config.sports.favoriteTeam
                        : "SEA"
            };
        } catch (error) {
            return {
                enabled: true,
                favoriteTeam: "SEA"
            };
        }
    }

    publishSportsFacts(config) {
        /*
         * Simulated facts establish the future Sports contract. A real
         * sports data source will later replace only this facts payload.
         * The game shape can grow with live score/inning and final result.
         */
        const payload = config.enabled
            ? {
                status: "available",
                favoriteTeam: {
                    id: config.favoriteTeam,
                    name: config.favoriteTeam === "SEA"
                        ? "Seattle Mariners"
                        : config.favoriteTeam
                },
                game: {
                    status: "scheduled",
                    opponent: "Los Angeles Angels",
                    startTime: "2026-08-12T19:10:00-07:00"
                }
            }
            : {
                status: "unavailable",
                favoriteTeam: {
                    id: config.favoriteTeam,
                    name: config.favoriteTeam === "SEA"
                        ? "Seattle Mariners"
                        : config.favoriteTeam
                },
                game: null
            };

        window.mosaicApp.eventBus.publish({
            type: "sports-facts",
            source: "sports",
            payload
        });
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
