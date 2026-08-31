class SportsActiveContextGenerator {

    constructor() {
        this.unsubscribe = null;
        this.activeCandidateId = null;
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

        if (!candidate) {
            this.withdrawActiveCandidate();
            return;
        }

        if (
            this.activeCandidateId &&
            this.activeCandidateId !== candidate.id
        ) {
            this.publishWithdrawal(this.activeCandidateId);
        }

        window.mosaicApp.eventBus.publish({
            type: "hero-candidate",
            source: "sports",
            payload: {
                candidate
            }
        });
        this.activeCandidateId = candidate.id;
    }

    createLiveGameCandidate(facts) {
        const favoriteTeam = facts?.favoriteTeam;
        const game = facts?.game;
        const hasTypedSimulationGamecast =
            facts?.simulation === true &&
            game?.gamecast &&
            typeof game.gamecast.type === "string";

        if (
            facts?.status !== "available" ||
            !favoriteTeam?.id ||
            !favoriteTeam.name ||
            (game?.status !== "live" && !hasTypedSimulationGamecast) ||
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
                sticky: true,
                durationSeconds: null
            },
            createdAt: new Date().toISOString(),
            expiresAt: null
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

    withdrawActiveCandidate() {
        if (!this.activeCandidateId) return;

        this.publishWithdrawal(this.activeCandidateId);
        this.activeCandidateId = null;
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
