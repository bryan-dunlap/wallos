const MLB_FACT_REQUESTS_IN_FLIGHT = new Map();

class MlbDataProvider {

    async getScheduleFacts(favoriteTeam, date) {
        if (
            !favoriteTeam?.id ||
            favoriteTeam.league !== "MLB"
        ) {
            return this.createUnavailableFacts(favoriteTeam);
        }

        const requestKey = `${favoriteTeam.id}:${date}`;
        const existingRequest = MLB_FACT_REQUESTS_IN_FLIGHT.get(
            requestKey
        );

        if (existingRequest) return existingRequest;

        const request = this.fetchScheduleFacts(favoriteTeam, date)
            .finally(() => {
                if (
                    MLB_FACT_REQUESTS_IN_FLIGHT.get(requestKey) ===
                    request
                ) {
                    MLB_FACT_REQUESTS_IN_FLIGHT.delete(requestKey);
                }
            });

        MLB_FACT_REQUESTS_IN_FLIGHT.set(requestKey, request);

        return request;
    }

    async fetchScheduleFacts(favoriteTeam, date) {
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
            game: this.normalizeGame(game, favoriteTeam)
        };
    }

    includesTeam(game, favoriteTeamId) {
        return [game?.awayTeam, game?.homeTeam].some(
            (team) => team?.abbreviation === favoriteTeamId
        );
    }

    normalizeGame(game, favoriteTeam) {
        const status = this.normalizeStatus(game?.status);

        if (!game || !status) return null;

        const favoriteTeamId = favoriteTeam.id;
        const favoriteIsAway =
            game.awayTeam?.abbreviation === favoriteTeamId;
        const favoriteGameTeam = favoriteIsAway
            ? game.awayTeam
            : game.homeTeam;
        const opponent = favoriteIsAway
            ? game.homeTeam
            : game.awayTeam;

        if (!opponent?.name || !game.scheduledAt) return null;

        const normalizedGame = {
            status,
            opponent: opponent.name,
            opponentLogo: opponent.logo || "",
            teams: {
                away: this.normalizeGameTeam(game.awayTeam),
                home: this.normalizeGameTeam(game.homeTeam)
            },
            startTime: game.scheduledAt,
            score: null,
            inning: null,
            outs: null,
            count: null,
            bases: null,
            lineScore: null,
            batter: null,
            pitcher: null,
            result: null
        };

        if (status === "live") {
            return {
                ...normalizedGame,
                score: this.normalizeScore(
                    game.awayTeam,
                    game.homeTeam,
                    favoriteGameTeam,
                    opponent
                ),
                inning: this.normalizeInning(game.linescore?.inning),
                outs: game.linescore?.outs ?? null,
                count: {
                    balls: game.linescore?.count?.balls ?? null,
                    strikes: game.linescore?.count?.strikes ?? null
                },
                bases: this.normalizeBases(game.linescore?.bases),
                batter: this.normalizeBatter(
                    game.linescore?.batter
                ),
                pitcher: this.normalizePitcher(
                    game.linescore?.pitcher
                ),
                lineScore: this.normalizeLineScore(
                    game,
                    favoriteIsAway
                )
            };
        }

        if (status === "final") {
            const score = this.normalizeScore(
                game.awayTeam,
                game.homeTeam,
                favoriteGameTeam,
                opponent
            );

            return {
                ...normalizedGame,
                score,
                result: this.formatResult(
                    favoriteTeam.name,
                    score
                )
            };
        }

        return normalizedGame;
    }

    normalizeStatus(status = {}) {
        const state = String(status.state || "").toLowerCase();
        const detail = String(status.detail || "").toLowerCase();

        if (
            state === "preview" ||
            state === "scheduled" ||
            detail === "scheduled"
        ) {
            return "scheduled";
        }

        if (
            state === "live" ||
            state === "in progress" ||
            detail === "in progress"
        ) {
            return "live";
        }

        if (
            state === "final" ||
            detail === "final" ||
            detail === "game over"
        ) {
            return "final";
        }

        return null;
    }

    normalizeScore(awayTeam, homeTeam, favoriteTeam, opponent) {
        return {
            away: awayTeam?.runs ?? null,
            home: homeTeam?.runs ?? null,
            favoriteTeam: favoriteTeam?.runs ?? null,
            opponent: opponent?.runs ?? null
        };
    }

    normalizeGameTeam(team = {}) {
        const name = team.name || "";

        return {
            id: team.abbreviation || "",
            name,
            shortName:
                team.shortName ||
                name.trim().split(/\s+/).at(-1) ||
                "",
            logo: team.logo || "",
            providerId: team.providerId ?? team.id ?? null
        };
    }

    normalizeInning(inning = {}) {
        const half = String(inning.half || "").toLowerCase();

        return {
            half: ["top", "bottom"].includes(half)
                ? half
                : null,
            number: inning.number ?? null
        };
    }

    normalizeBases(bases = {}) {
        return {
            first: bases.first?.occupied === true,
            second: bases.second?.occupied === true,
            third: bases.third?.occupied === true
        };
    }

    normalizeBatter(batter) {
        if (!batter?.name) return null;

        return {
            id: batter.id ?? null,
            name: batter.name,
            hits: batter.hits ?? null,
            atBats: batter.atBats ?? null,
            seasonAVG: batter.seasonAVG ?? null
        };
    }

    normalizePitcher(pitcher) {
        if (!pitcher?.name) return null;

        return {
            id: pitcher.id ?? null,
            name: pitcher.name,
            strikes: pitcher.strikes ?? null,
            pitches: pitcher.pitches ?? null,
            seasonERA: pitcher.seasonERA ?? null
        };
    }

    normalizeLineScore(game, favoriteIsAway) {
        const innings = Array.isArray(game.linescore?.innings)
            ? game.linescore.innings
            : [];
        const favoriteTeam = favoriteIsAway
            ? game.awayTeam
            : game.homeTeam;
        const opponent = favoriteIsAway
            ? game.homeTeam
            : game.awayTeam;

        return {
            innings: innings.map((inning) => ({
                number: inning.number,
                away: inning.away,
                home: inning.home,
                favoriteTeam: favoriteIsAway
                    ? inning.away
                    : inning.home,
                opponent: favoriteIsAway
                    ? inning.home
                    : inning.away
            })),
            away: this.normalizeLineScoreTotals(game.awayTeam),
            home: this.normalizeLineScoreTotals(game.homeTeam),
            favoriteTeam: this.normalizeLineScoreTotals(favoriteTeam),
            opponent: this.normalizeLineScoreTotals(opponent)
        };
    }

    normalizeLineScoreTotals(team = {}) {
        return {
            runs: team.runs ?? null,
            hits: team.hits ?? null,
            errors: team.errors ?? null
        };
    }

    formatResult(teamName, score) {
        if (
            !Number.isFinite(score.favoriteTeam) ||
            !Number.isFinite(score.opponent)
        ) {
            return null;
        }

        const result = score.favoriteTeam > score.opponent
            ? "win"
            : score.favoriteTeam < score.opponent
                ? "lose"
                : "tie";

        return `${teamName} ${result} ` +
            `${score.favoriteTeam}-${score.opponent}`;
    }

    normalizeFavoriteTeam(favoriteTeam) {
        return {
            id: favoriteTeam.id,
            name: favoriteTeam.name,
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
