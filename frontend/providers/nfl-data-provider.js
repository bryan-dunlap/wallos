const NFL_FACT_REQUESTS_IN_FLIGHT = new Map();

class NflDataProvider {

    async getScheduleFacts(favoriteTeam, date) {
        if (
            !favoriteTeam?.id ||
            favoriteTeam.league !== "NFL"
        ) {
            return this.createUnavailableFacts(favoriteTeam);
        }

        const requestKey = `${favoriteTeam.id}:${date}`;
        const existingRequest = NFL_FACT_REQUESTS_IN_FLIGHT.get(
            requestKey
        );

        if (existingRequest) return existingRequest;

        const request = this.fetchScheduleFacts(favoriteTeam, date)
            .finally(() => {
                if (
                    NFL_FACT_REQUESTS_IN_FLIGHT.get(requestKey) ===
                    request
                ) {
                    NFL_FACT_REQUESTS_IN_FLIGHT.delete(requestKey);
                }
            });

        NFL_FACT_REQUESTS_IN_FLIGHT.set(requestKey, request);
        return request;
    }

    async fetchScheduleFacts(favoriteTeam, date) {
        const response = await fetch(
            `/api/sports/nfl?date=${encodeURIComponent(date)}`
        );
        const schedule = await response.json();

        if (!response.ok) {
            throw new Error(
                `NFL schedule request failed: ${response.status}`
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
            game: this.normalizeGame(game, favoriteTeam, date)
        };
    }

    includesTeam(game, favoriteTeamId) {
        return [game?.awayTeam, game?.homeTeam].some(
            (team) => team?.id === favoriteTeamId
        );
    }

    normalizeGame(game, favoriteTeam, requestedDate = null) {
        const status = this.normalizeStatus(game?.status);

        if (!game || !status || !game.eventId) return null;

        const favoriteIsAway = game.awayTeam?.id === favoriteTeam.id;
        const favoriteIsHome = game.homeTeam?.id === favoriteTeam.id;

        if (!favoriteIsAway && !favoriteIsHome) return null;

        const teams = {
            away: this.normalizeTeam(game.awayTeam),
            home: this.normalizeTeam(game.homeTeam)
        };

        if (!teams.away.id || !teams.home.id) return null;

        const score = {
            away: game.awayTeam?.score ?? null,
            home: game.homeTeam?.score ?? null
        };
        const gameState = {
            quarter: game.state?.period ?? null,
            clock: game.state?.clock ?? null,
            phase: game.state?.phase || this.getPhase(status)
        };
        const lineScore = this.normalizeLineScore(game.state);
        const gamecast = {
            type: "football-game",
            status,
            eventId: String(game.eventId),
            teams,
            score,
            gameState,
            possession: null,
            situation: null,
            drive: null,
            lastPlay: null,
            lineScore
        };
        const opponent = favoriteIsAway
            ? teams.home
            : teams.away;

        return {
            status,
            eventId: String(game.eventId),
            eventDate: game.date || requestedDate,
            opponent: opponent.name,
            opponentLogo: opponent.logo,
            teams,
            startTime: game.scheduledAt || null,
            score,
            quarter: gameState.quarter,
            gameClock: gameState.clock,
            lineScore,
            gamecast
        };
    }

    normalizeStatus(status = {}) {
        const state = String(status.state || status || "")
            .trim()
            .toLowerCase();

        if (["scheduled", "live", "final"].includes(state)) {
            return state;
        }

        return null;
    }

    getPhase(status) {
        if (status === "final") return "final";
        if (status === "live") return "regulation";
        return null;
    }

    normalizeTeam(team = {}) {
        return {
            id: team.id || null,
            providerId: team.providerId ?? null,
            abbreviation: team.abbreviation || "",
            name: team.name || "",
            shortName: team.shortName || team.name || "",
            logo: team.logo || ""
        };
    }

    normalizeLineScore(state = {}) {
        const away = Array.isArray(state.quarters?.away)
            ? state.quarters.away.slice(0, 4)
            : [];
        const home = Array.isArray(state.quarters?.home)
            ? state.quarters.home.slice(0, 4)
            : [];

        while (away.length < 4) away.push(null);
        while (home.length < 4) home.push(null);

        return {
            periods: [1, 2, 3, 4],
            away,
            home,
            overtime: {
                away: state.overtime?.away ?? null,
                home: state.overtime?.home ?? null
            }
        };
    }

    normalizeFavoriteTeam(favoriteTeam) {
        return {
            id: favoriteTeam.id,
            abbreviation: favoriteTeam.abbreviation,
            name: favoriteTeam.name,
            shortName: favoriteTeam.shortName,
            league: favoriteTeam.league,
            sport: favoriteTeam.sport,
            renderer: favoriteTeam.renderer,
            providerId: favoriteTeam.providerId,
            logo: favoriteTeam.logo
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

if (typeof module !== "undefined" && module.exports) {
    module.exports = { NflDataProvider };
}
