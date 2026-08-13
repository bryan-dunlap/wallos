class BaseballGameRenderer {

    render(payload) {
        const score = payload.score || {};
        const inning = payload.inning || {};
        const count = payload.count || {};
        const favoriteLabel =
            payload.teams?.favoriteTeam?.id || "TEAM";
        const opponentLabel =
            payload.teams?.opponent?.id || "OPP";

        return `
            <div class="baseball-game-score">
                <div>${this.escape(favoriteLabel)} ${this.value(score.favoriteTeam)}</div>
                <div>${this.escape(opponentLabel)} ${this.value(score.opponent)}</div>
            </div>

            <div class="baseball-game-inning">
                ${this.escape(this.formatInning(inning))}
            </div>

            <div class="baseball-game-outs">
                OUTS: ${this.value(payload.outs)}
            </div>

            <div class="baseball-game-bases">
                BASES: ${this.escape(this.formatBases(payload.bases))}
            </div>

            <div class="baseball-game-count">
                COUNT: ${this.value(count.balls)}-${this.value(count.strikes)}
            </div>
        `;
    }

    formatInning(inning) {
        if (
            !["top", "bottom"].includes(inning.half) ||
            !Number.isInteger(inning.number)
        ) {
            return "INNING —";
        }

        return `${inning.half.toUpperCase()} ` +
            this.formatOrdinal(inning.number).toUpperCase();
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

    formatBases(bases = {}) {
        const occupied = [
            ["first", "FIRST"],
            ["second", "SECOND"],
            ["third", "THIRD"]
        ]
            .filter(([key]) => bases[key] === true)
            .map(([, label]) => label);

        return occupied.length > 0
            ? occupied.join(", ")
            : "EMPTY";
    }

    value(value) {
        return Number.isFinite(value) ? value : "—";
    }

    escape(value) {
        return String(value)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }

}

window.mosaicActiveRendererRegistry.register(
    "baseball-game",
    new BaseballGameRenderer()
);
