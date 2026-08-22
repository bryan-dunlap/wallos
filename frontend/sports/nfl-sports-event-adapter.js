const buildNormalizedNflSportsEvent =
    typeof createNormalizedSportsEvent === "function"
        ? createNormalizedSportsEvent
        : require("./sports-event-contract").createNormalizedSportsEvent;

class NflSportsEventAdapter {

    adaptGames(games) {
        if (!Array.isArray(games)) return [];

        return games
            .map((game) => this.adaptGame(game))
            .filter(Boolean);
    }

    adaptGame(game) {
        if (this.isCancelled(game) || !this.hasUsableMatchup(game)) {
            return null;
        }

        const football = game.state || {};

        return buildNormalizedNflSportsEvent({
            league: "NFL",
            id: String(game.eventId ?? ""),
            type: "game",
            status: this.normalizeStatus(game.status?.state),
            participants: {
                away: this.normalizeParticipant(game.awayTeam),
                home: this.normalizeParticipant(game.homeTeam)
            },
            scores: {
                away: game.awayTeam?.score ?? null,
                home: game.homeTeam?.score ?? null
            },
            state: {
                scheduledAt: game.scheduledAt || null,
                scheduledTime: game.scheduledTime || null,
                statusDetail: game.status?.detail || ""
            },
            details: {
                football: {
                    quarter: football.quarter ?? null,
                    gameClock: football.gameClock || null,
                    phase: football.phase || null,
                    possession: football.possession || null,
                    down: football.down ?? null,
                    distance: football.distance ?? null,
                    yardLine: football.yardLine || null,
                    redZone: football.redZone === true,
                    timeouts: football.timeouts || null,
                    result: game.result || null
                }
            }
        });
    }

    normalizeParticipant(team = {}) {
        return {
            name: team.name,
            abbreviation: team.abbreviation || "",
            logo: team.logo || "",
            record: team.record || null
        };
    }

    normalizeStatus(status) {
        const normalizedStatus = String(status || "").toLowerCase();

        if (
            normalizedStatus === "scheduled" ||
            normalizedStatus === "preview" ||
            normalizedStatus === "pregame"
        ) {
            return "scheduled";
        }

        if (normalizedStatus === "live") return "live";
        if (normalizedStatus === "final") return "final";

        return "unknown";
    }

    isCancelled(game) {
        const status = [
            game.status?.state,
            game.status?.detail
        ].filter(Boolean).join(" ");

        return /cancelled|canceled/i.test(status);
    }

    hasUsableMatchup(game) {
        return [game.awayTeam, game.homeTeam].every(
            (team) =>
                team &&
                typeof team.name === "string" &&
                team.name.trim() !== "" &&
                team.name !== "Team TBD"
        );
    }

}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { NflSportsEventAdapter };
}
