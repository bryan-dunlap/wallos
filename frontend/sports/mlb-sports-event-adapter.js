const buildNormalizedSportsEvent =
    typeof createNormalizedSportsEvent === "function"
        ? createNormalizedSportsEvent
        : require("./sports-event-contract").createNormalizedSportsEvent;

class MlbSportsEventAdapter {

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

        const awayTeam = this.normalizeParticipant(game.awayTeam);
        const homeTeam = this.normalizeParticipant(game.homeTeam);

        return buildNormalizedSportsEvent({
            league: "MLB",
            id: String(game.eventId ?? ""),
            type: "game",
            status: this.normalizeStatus(game.status?.state),
            participants: {
                away: awayTeam,
                home: homeTeam
            },
            scores: {
                away: awayTeam.score,
                home: homeTeam.score
            },
            state: {
                scheduledAt: game.scheduledAt || null,
                scheduledTime: game.scheduledTime || null,
                statusDetail: game.status?.detail || ""
            },
            details: {
                baseball: {
                    inning: game.linescore?.inning || null,
                    innings: game.linescore?.innings || [],
                    bases: game.linescore?.bases || null,
                    outs: game.linescore?.outs ?? null,
                    count: game.linescore?.count || null,
                    pitcher: game.linescore?.pitcher || null,
                    batter: game.linescore?.batter || null,
                    teamStats: {
                        away: {
                            hits: game.awayTeam?.hits ?? null,
                            errors: game.awayTeam?.errors ?? null
                        },
                        home: {
                            hits: game.homeTeam?.hits ?? null,
                            errors: game.homeTeam?.errors ?? null
                        }
                    }
                }
            }
        });
    }

    normalizeParticipant(team = {}) {
        return {
            name: team.shortName || team.name,
            fullName: team.name || team.shortName || "",
            abbreviation: team.abbreviation || "",
            logo: team.logo || "",
            record: team.record || {
                wins: null,
                losses: null
            },
            score: team.runs ?? null
        };
    }

    normalizeStatus(status) {
        const normalizedStatus = String(status || "").toLowerCase();

        if (normalizedStatus === "scheduled" || normalizedStatus === "preview") {
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
    module.exports = { MlbSportsEventAdapter };
}
