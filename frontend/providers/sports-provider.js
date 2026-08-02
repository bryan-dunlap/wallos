class SportsProvider {

    async start() {
        try {
            const date = this.getDateKey(new Date());
            const response = await fetch(
                `/api/sports/mlb?date=${encodeURIComponent(date)}`
            );

            if (!response.ok) {
                throw new Error(
                    `Sports request failed: ${response.status}`
                );
            }

            const scheduleData = await response.json();
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

            this.publishUnavailableEvent();
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

    publishUnavailableEvent() {
        const event = createMosaicEvent({
            type: "sports",
            title: "Sports Update",
            subtitle: "Sports unavailable",
            source: "sports",
            payload: {
                sport: "MLB",
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
