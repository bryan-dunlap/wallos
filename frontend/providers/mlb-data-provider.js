class MlbDataProvider {

    async getScheduleFacts(favoriteTeam, date) {
        if (
            !favoriteTeam?.id ||
            favoriteTeam.league !== "MLB"
        ) {
            return this.createUnavailableFacts(favoriteTeam);
        }

        const response = await fetch(
            `/api/sports/mlb?date=${encodeURIComponent(date)}`
        );
        const schedule = await response.json();

        if (!response.ok) {
            throw new Error(
                `MLB schedule request failed: ${response.status}`
            );
        }

        const games = Array.isArray(schedule.sportsEvents)
            ? schedule.sportsEvents
            : [];
        const game = games.find(
            (event) => this.includesTeam(event, favoriteTeam.id)
        );

        return {
            status: "available",
            favoriteTeam: this.normalizeFavoriteTeam(favoriteTeam),
            game: this.normalizeScheduledGame(game, favoriteTeam.id)
        };
    }

    includesTeam(game, favoriteTeamId) {
        return [game?.awayTeam, game?.homeTeam].some(
            (team) => team?.abbreviation === favoriteTeamId
        );
    }

    normalizeScheduledGame(game, favoriteTeamId) {
        if (!game || game.status?.state !== "Preview") {
            return null;
        }

        const favoriteIsAway =
            game.awayTeam?.abbreviation === favoriteTeamId;
        const opponent = favoriteIsAway
            ? game.homeTeam
            : game.awayTeam;

        if (!opponent?.name || !game.scheduledAt) return null;

        return {
            status: "scheduled",
            opponent: opponent.name,
            startTime: game.scheduledAt
        };
    }

    normalizeFavoriteTeam(favoriteTeam) {
        return {
            id: favoriteTeam.id,
            name: favoriteTeam.name,
            league: favoriteTeam.league,
            sport: favoriteTeam.sport,
            renderer: favoriteTeam.renderer
        };
    }

    createUnavailableFacts(favoriteTeam = null) {
        return {
            status: "unavailable",
            favoriteTeam: favoriteTeam
                ? this.normalizeFavoriteTeam(favoriteTeam)
                : null,
            game: null
        };
    }

}
