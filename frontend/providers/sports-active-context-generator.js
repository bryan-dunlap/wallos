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
            !game.opponent
        ) {
            return null;
        }

        return {
            id: `sports:live:${favoriteTeam.id}`,
            source: "sports",
            type: "sports.live-game",
            mode: "active",
            priority: 100,
            headline: `${favoriteTeam.name} vs ${game.opponent}`,
            summary: this.formatGameSummary(favoriteTeam, game),
            payload: {
                type: "baseball-game",
                teams: {
                    favoriteTeam: this.createBaseballTeamIdentity(
                        favoriteTeam.id,
                        favoriteTeam.name,
                        favoriteTeam.logo
                    ),
                    opponent: this.createBaseballTeamIdentity(
                        this.getOpponentLabel(game.opponent),
                        game.opponent,
                        game.opponentLogo
                    )
                },
                score: game.score,
                inning: game.inning,
                outs: game.outs,
                count: game.count,
                bases: game.bases,
                lineScore: game.lineScore
            },
            behavior: {
                sticky: true,
                durationSeconds: null
            },
            createdAt: new Date().toISOString(),
            expiresAt: null
        };
    }

    formatGameSummary(favoriteTeam, game) {
        const details = [];
        const favoriteLabel = favoriteTeam.id.toUpperCase();
        const opponentLabel = this.getOpponentLabel(game.opponent);

        if (
            Number.isFinite(game.score?.favoriteTeam) &&
            Number.isFinite(game.score?.opponent)
        ) {
            details.push(
                `${favoriteLabel} ${game.score.favoriteTeam} · ` +
                `${opponentLabel} ${game.score.opponent}`
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

    getOpponentLabel(opponent) {
        const knownTeams = {
            "Los Angeles Angels": "LAA"
        };

        return knownTeams[opponent] || opponent
            .split(/\s+/)
            .map((word) => word.charAt(0))
            .join("")
            .toUpperCase();
    }

    createBaseballTeamIdentity(id, fullName, logo = "") {
        const teamId = String(id).toUpperCase();
        const name = String(fullName)
            .trim()
            .split(/\s+/)
            .at(-1);

        return {
            id: teamId,
            name,
            logo: typeof logo === "string" && logo.trim()
                ? logo.trim()
                : this.getMlbTeamLogo(teamId)
        };
    }

    getMlbTeamLogo(teamId) {
        const mlbTeamIds = {
            SEA: 136,
            LAA: 108
        };
        const mlbTeamId = mlbTeamIds[teamId];

        return mlbTeamId
            ? `https://www.mlbstatic.com/team-logos/${mlbTeamId}.svg`
            : "";
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
