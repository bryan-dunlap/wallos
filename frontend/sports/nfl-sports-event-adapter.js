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
        if (!this.hasUsableMatchup(game)) {
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
                statusDetail: game.status?.detail || "",
                period: football.period ?? football.quarter ?? null,
                clock: football.clock || football.gameClock || null
            },
            details: {
                football: {
                    quarters: {
                        away: Array.isArray(football.quarters?.away)
                            ? [...football.quarters.away]
                            : [],
                        home: Array.isArray(football.quarters?.home)
                            ? [...football.quarters.home]
                            : []
                    },
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
        const normalizedStatus = String(status || "")
            .trim()
            .toLowerCase();

        if (
            normalizedStatus === "scheduled" ||
            normalizedStatus === "preview" ||
            normalizedStatus === "pregame" ||
            normalizedStatus === "postponed" ||
            normalizedStatus === "delayed"
        ) {
            return "scheduled";
        }

        if (
            normalizedStatus === "live" ||
            normalizedStatus === "in_progress"
        ) {
            return "live";
        }

        if (normalizedStatus === "final") return "final";

        return "unknown";
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
