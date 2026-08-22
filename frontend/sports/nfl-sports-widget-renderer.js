class NflSportsWidgetRenderer {

    render(event) {
        const football = event.details?.football || {};
        const showQuarterScoring = event.status !== "scheduled";

        return {
            status: this.formatStatus(event, football),
            content: this.renderScoreboard(
                event,
                football,
                showQuarterScoring
            )
        };
    }

    renderScoreboard(event, football, showQuarterScoring) {
        return `
            <span class="nfl-widget-scoreboard${showQuarterScoring
                ? " nfl-widget-scoreboard-with-quarters"
                : ""}">
                ${showQuarterScoring ? this.renderHeadings() : ""}
                ${this.renderTeam(event.participants.away, "away")}
                ${showQuarterScoring
                    ? this.renderQuarterValues(
                        football.quarters?.away,
                        event.scores.away
                    )
                    : ""}
                ${this.renderTeam(event.participants.home, "home")}
                ${showQuarterScoring
                    ? this.renderQuarterValues(
                        football.quarters?.home,
                        event.scores.home
                    )
                    : ""}
            </span>`;
    }

    renderHeadings() {
        return `
            <span class="nfl-widget-scoreboard-corner"></span>
            ${["Q1", "Q2", "Q3", "Q4", "TOT"].map(
                (heading) => `
                    <span class="sports-scoreboard-heading">
                        ${heading}
                    </span>`
            ).join("")}`;
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

    renderQuarterValues(quarters, total) {
        const visibleQuarters = Array.from(
            { length: 4 },
            (_, index) => quarters?.[index] ?? "—"
        );

        return [...visibleQuarters, total ?? "—"].map(
            (value) => `
                <span class="sports-scoreboard-value">
                    ${value}
                </span>`
        ).join("");
    }

    formatStatus(event, football) {
        if (event.status === "scheduled") {
            return event.state?.scheduledTime || "—";
        }

        if (event.status === "final") return "Final";

        if (event.status === "live") {
            if (football.phase === "halftime") return "Halftime";

            const period = football.phase === "overtime" ||
                event.state?.period > 4
                ? "OT"
                : event.state?.period
                    ? `Q${event.state.period}`
                    : "Live";

            return [period, event.state?.clock]
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
