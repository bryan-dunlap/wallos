class SportsActiveContextGenerator {

    constructor() {
        this.unsubscribe = null;
        this.activeCandidateIds = new Map();
        this.activeSimulationCandidateId = null;
    }

    start() {
        this.unsubscribe =
            window.mosaicApp.eventBus.subscribe(
                "sports-facts",
                (event) => this.evaluate(event.payload)
            );
    }

    evaluate(facts) {
        const candidate = this.createLiveGameCandidate(facts);
        const favoriteTeamId = facts?.favoriteTeam?.id || null;

        if (facts?.simulation === true) {
            this.evaluateSimulationCandidate(candidate);
            return;
        }

        if (!candidate) {
            if (facts?.game?.suppressHeroCandidateWithdrawal === true) {
                return;
            }

            if (favoriteTeamId) {
                this.withdrawFavoriteCandidate(favoriteTeamId);
            } else {
                this.withdrawAllFavoriteCandidates();
            }
            return;
        }

        this.publishCandidate(candidate);
        this.activeCandidateIds.set(favoriteTeamId, candidate.id);
    }

    createLiveGameCandidate(facts) {
        const favoriteTeam = facts?.favoriteTeam;
        const game = facts?.game;
        const hasEligibleTypedGamecast =
            game?.gamecast &&
            typeof game.gamecast.type === "string" &&
            ["live", "final"].includes(
                game.gamecast.status || game.status
            );

        if (
            facts?.status !== "available" ||
            !favoriteTeam?.id ||
            !favoriteTeam.name ||
            (game?.status !== "live" && !hasEligibleTypedGamecast) ||
            !game.teams?.away?.id ||
            !game.teams?.home?.id
        ) {
            return null;
        }

        if (
            game.gamecast &&
            typeof game.gamecast.type === "string"
        ) {
            return this.createTypedGamecastCandidate(
                favoriteTeam,
                game,
                game.gamecast
            );
        }

        if (favoriteTeam.sport !== "baseball") {
            return this.createGenericLiveCandidate(
                favoriteTeam,
                game
            );
        }

        return {
            id: `sports:live:${favoriteTeam.id}`,
            source: "sports",
            type: "sports.live-game",
            mode: "active",
            priority: 100,
            headline:
                `${game.teams.away.name} at ${game.teams.home.name}`,
            summary: this.formatGameSummary(game),
            payload: {
                type: "baseball-game",
                teams: {
                    away: this.createBaseballTeamIdentity(
                        game.teams.away
                    ),
                    home: this.createBaseballTeamIdentity(
                        game.teams.home
                    )
                },
                score: game.score,
                inning: game.inning,
                battingTeam: this.getBattingTeam(game),
                outs: game.outs,
                count: game.count,
                bases: game.bases,
                lineScore: game.lineScore,
                batter: game.batter,
                pitcher: game.pitcher
            },
            behavior: {
                sticky: true,
                durationSeconds: null
            },
            createdAt: new Date().toISOString(),
            expiresAt: null
        };
    }

    createTypedGamecastCandidate(favoriteTeam, game, payload) {
        const away = game.teams.away;
        const home = game.teams.home;
        const isFinal = (payload.status || game.status) === "final";
        const createdAt = new Date();
        const durationSeconds = isFinal ? 60 : null;

        return {
            id: `sports:live:${favoriteTeam.id}`,
            source: "sports",
            type: "sports.live-game",
            mode: "active",
            priority: 100,
            headline: `${away.name} at ${home.name}`,
            summary: this.formatGenericGameSummary(game),
            payload,
            behavior: {
                sticky: !isFinal,
                durationSeconds
            },
            createdAt: createdAt.toISOString(),
            expiresAt: durationSeconds === null
                ? null
                : new Date(
                    createdAt.getTime() + durationSeconds * 1000
                ).toISOString()
        };
    }

    createGenericLiveCandidate(favoriteTeam, game) {
        const away = game.teams.away;
        const home = game.teams.home;

        return {
            id: `sports:live:${favoriteTeam.id}`,
            source: "sports",
            type: "sports.live-game",
            mode: "active",
            priority: 100,
            headline: `${away.name} at ${home.name}`,
            summary: this.formatGenericGameSummary(game),
            payload: {
                type: `${favoriteTeam.sport || "sports"}-gamecast`,
                sport: favoriteTeam.sport || game.sport || null,
                league: favoriteTeam.league || game.league || null,
                teams: game.teams,
                score: game.score,
                quarter: game.quarter ?? null,
                period: game.period ?? null,
                gameClock: game.gameClock ?? null,
                possession: game.possession ?? null,
                down: game.down ?? null,
                distance: game.distance ?? null,
                yardLine: game.yardLine ?? null,
                redZone: game.redZone ?? null,
                strength: game.strength ?? null,
                powerPlay: game.powerPlay ?? null,
                shotsOnGoal: game.shotsOnGoal ?? null,
                teamFouls: game.teamFouls ?? null,
                timeouts: game.timeouts ?? null,
                phase: game.phase ?? null
            },
            behavior: {
                sticky: true,
                durationSeconds: null
            },
            createdAt: new Date().toISOString(),
            expiresAt: null
        };
    }

    formatGenericGameSummary(game) {
        const details = [];
        const away = game.teams.away;
        const home = game.teams.home;

        if (
            Number.isFinite(game.score?.away) &&
            Number.isFinite(game.score?.home)
        ) {
            details.push(
                `${away.shortName || away.name} ${game.score.away} · ` +
                `${home.shortName || home.name} ${game.score.home}`
            );
        }

        if (game.gameClock) details.push(game.gameClock);
        if (Number.isInteger(game.quarter)) {
            details.push(`Q${game.quarter}`);
        } else if (Number.isInteger(game.period)) {
            details.push(`P${game.period}`);
        }

        if (
            Number.isInteger(game.down) &&
            Number.isInteger(game.distance)
        ) {
            details.push(`${game.down} & ${game.distance}`);
        }

        return details.join(" · ") || "Game in progress";
    }

    getBattingTeam(game) {
        if (game?.status !== "live") return null;
        if (game.inning?.half === "top") return "away";
        if (game.inning?.half === "bottom") return "home";

        return null;
    }

    formatGameSummary(game) {
        const details = [];
        const awayLabel = game.teams.away.id.toUpperCase();
        const homeLabel = game.teams.home.id.toUpperCase();

        if (
            Number.isFinite(game.score?.away) &&
            Number.isFinite(game.score?.home)
        ) {
            details.push(
                `${awayLabel} ${game.score.away} · ` +
                `${homeLabel} ${game.score.home}`
            );
        }

        if (
            ["top", "bottom"].includes(game.inning?.half) &&
            Number.isInteger(game.inning?.number)
        ) {
            details.push(
                `${game.inning.half.toUpperCase()} ` +
                `${this.formatOrdinal(game.inning.number).toUpperCase()}`
            );
        }

        if (Number.isInteger(game.outs)) {
            details.push(`${game.outs} ${game.outs === 1 ? "OUT" : "OUTS"}`);
        }

        const runners = this.formatRunners(game.bases);

        if (runners) details.push(runners);

        if (
            Number.isInteger(game.count?.balls) &&
            Number.isInteger(game.count?.strikes)
        ) {
            details.push(
                `COUNT ${game.count.balls}-${game.count.strikes}`
            );
        }

        return details.join(" · ");
    }

    createBaseballTeamIdentity(team) {
        return {
            id: String(team.id).toUpperCase(),
            name: team.shortName || team.name,
            logo: typeof team.logo === "string"
                ? team.logo.trim()
                : "",
            providerId: team.providerId ?? null
        };
    }

    formatOrdinal(number) {
        const remainder = number % 100;

        if (remainder >= 11 && remainder <= 13) {
            return `${number}th`;
        }

        return `${number}${{
            1: "st",
            2: "nd",
            3: "rd"
        }[number % 10] || "th"}`;
    }

    formatRunners(bases = {}) {
        const occupiedBases = [
            ["first", "1ST"],
            ["second", "2ND"],
            ["third", "3RD"]
        ]
            .filter(([key]) => bases[key] === true)
            .map(([, label]) => label);

        if (occupiedBases.length === 0) return "";
        if (occupiedBases.length === 1) {
            return `RUNNER ON ${occupiedBases[0]}`;
        }

        const lastBase = occupiedBases.pop();

        return `RUNNERS ON ${occupiedBases.join(", ")} AND ${lastBase}`;
    }

    evaluateSimulationCandidate(candidate) {
        if (!candidate) {
            if (this.activeSimulationCandidateId) {
                this.publishWithdrawal(
                    this.activeSimulationCandidateId
                );
                this.activeSimulationCandidateId = null;
            }
            return;
        }

        if (
            this.activeSimulationCandidateId &&
            this.activeSimulationCandidateId !== candidate.id
        ) {
            this.publishWithdrawal(this.activeSimulationCandidateId);
        }

        this.publishCandidate(candidate);
        this.activeSimulationCandidateId = candidate.id;
    }

    publishCandidate(candidate) {
        window.mosaicApp.eventBus.publish({
            type: "hero-candidate",
            source: "sports",
            payload: { candidate }
        });
    }

    withdrawFavoriteCandidate(favoriteTeamId) {
        const candidateId = this.activeCandidateIds.get(favoriteTeamId);

        if (!candidateId) return;

        this.publishWithdrawal(candidateId);
        this.activeCandidateIds.delete(favoriteTeamId);
    }

    withdrawAllFavoriteCandidates() {
        this.activeCandidateIds.forEach(
            (candidateId) => this.publishWithdrawal(candidateId)
        );
        this.activeCandidateIds.clear();
    }

    publishWithdrawal(id) {
        window.mosaicApp.eventBus.publish({
            type: "hero-candidate-withdraw",
            source: "sports",
            payload: {
                id
            }
        });
    }

}
