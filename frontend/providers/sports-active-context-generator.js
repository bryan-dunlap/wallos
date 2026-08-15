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

        if (
            facts?.status !== "available" ||
            !favoriteTeam?.id ||
            !favoriteTeam.name ||
            game?.status !== "live" ||
            !game.teams?.away?.id ||
            !game.teams?.home?.id
        ) {
            return null;
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
