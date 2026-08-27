const sharedNflScheduledPresenter =
    typeof sportsWidgetScheduledPresenter !== "undefined"
        ? sportsWidgetScheduledPresenter
        : require("./sports-widget-scheduled-presenter")
            .sportsWidgetScheduledPresenter;

class NflSportsWidgetRenderer {

    render(event) {
        const football = event.details?.football || {};
        const showQuarterScoring = event.status !== "scheduled";

        return {
            status: this.formatStatus(event, football),
            content: event.status === "scheduled"
                ? sharedNflScheduledPresenter.render(event)
                : this.renderScoreboard(
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
        const record = this.formatRecord(team.record);

        return `
            <span class="team-identity sports-widget-team
                sports-widget-team-${position} nfl-widget-team
                nfl-widget-team-${position}">
                ${this.renderLogo(team)}
                <span class="team-identity-text">
                    <span class="team-identity-name">
                        ${this.formatTeamName(team)}
                    </span>
                    ${record ? `<span class="team-identity-record">
                        ${record}
                    </span>` : ""}
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
        if (typeof record === "string") {
            const normalizedRecord = record.trim();
            return normalizedRecord ? `(${normalizedRecord})` : "";
        }

        if (record?.wins == null || record?.losses == null) return "";

        const ties = record.ties ? `-${record.ties}` : "";

        return `(${record.wins}-${record.losses}${ties})`;
    }

    formatTeamName(team = {}) {
        const shortName = String(team.shortName || "").trim();

        if (shortName) return shortName;

        const nameParts = String(team.name || "").trim().split(/\s+/);
        return nameParts.at(-1) || team.abbreviation || "Team";
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
