class NflSportsWidgetRenderer {

    render(event) {
        const football = event.details?.football || {};

        return {
            status: this.formatStatus(event, football),
            content: this.renderScoreboard(event)
        };
    }

    renderScoreboard(event) {
        return `
            <span class="nfl-widget-scoreboard">
                ${this.renderTeam(event.participants.away, "away")}
                ${this.renderScore(event.scores.away, event.status)}
                ${this.renderTeam(event.participants.home, "home")}
                ${this.renderScore(event.scores.home, event.status)}
            </span>`;
    }

    renderTeam(team, position) {
        return `
            <span class="team-identity nfl-widget-team
                nfl-widget-team-${position}">
                ${this.renderLogo(team)}
                <span class="team-identity-text">
                    <span class="team-identity-name">
                        ${team.name}
                    </span>
                    <span class="team-identity-record">
                        ${this.formatRecord(team.record)}
                    </span>
                </span>
            </span>`;
    }

    renderLogo(team) {
        return team.logo
            ? `<span class="team-identity-logo" aria-hidden="true">
                <img class="team-identity-logo-image"
                    src="${team.logo}" alt=""
                    onerror="this.hidden=true">
            </span>`
            : `<span class="team-identity-logo"
                aria-hidden="true">—</span>`;
    }

    renderScore(score, status) {
        const value = status === "scheduled" ? "—" : score ?? "—";

        return `<span class="nfl-widget-score">${value}</span>`;
    }

    formatStatus(event, football) {
        if (event.status === "scheduled") {
            return event.state?.scheduledTime || "—";
        }

        if (event.status === "final") return "Final";

        if (event.status === "live") {
            if (football.phase === "halftime") return "Halftime";

            const period = football.phase === "overtime" ||
                football.quarter > 4
                ? "OT"
                : football.quarter
                    ? `Q${football.quarter}`
                    : "Live";

            return [period, football.gameClock]
                .filter(Boolean)
                .join(" ");
        }

        return event.state?.statusDetail || "Unknown";
    }

    formatRecord(record) {
        if (record?.wins == null || record?.losses == null) return "";

        const ties = record.ties ? `-${record.ties}` : "";

        return `(${record.wins}-${record.losses}${ties})`;
    }

}

const nflSportsWidgetRenderer = new NflSportsWidgetRenderer();

if (typeof window !== "undefined") {
    window.mosaicSportsWidgetRendererRegistry.register(
        "NFL",
        nflSportsWidgetRenderer
    );
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        NflSportsWidgetRenderer,
        nflSportsWidgetRenderer
    };
}
