class MlbSportsWidgetRenderer {

    render(event) {
        const baseball = event.details?.baseball || {};
        const statusDetail = event.state?.statusDetail || "";
        const interrupted = /delayed|postponed|suspended/i.test(
            statusDetail
        );
        const hasReachedScheduledStart =
            this.hasReachedScheduledStart(event.state);
        const hasGameStarted =
            hasReachedScheduledStart &&
            baseball.inning?.number != null;
        const showStats = event.status === "final" || hasGameStarted;
        const status = interrupted
            ? statusDetail
            : event.status === "scheduled"
                ? event.state?.scheduledTime || "—"
                : event.status === "live"
                    ? hasGameStarted
                        ? this.formatInning(baseball.inning)
                        : event.state?.scheduledTime || "—"
                    : event.status === "final"
                        ? "Final"
                        : statusDetail || "Unknown";

        return {
            status,
            content: this.renderScoreboard(event, baseball, showStats)
        };
    }

    renderScoreboard(event, baseball, showStats) {
        const awayTeam = event.participants.away;
        const homeTeam = event.participants.home;
        const teamStats = baseball.teamStats || {};

        return `
            <span class="sports-scoreboard">
                ${showStats ? `
                    <span class="sports-scoreboard-corner"></span>
                    <span class="sports-scoreboard-heading">R</span>
                    <span class="sports-scoreboard-heading">H</span>
                    <span class="sports-scoreboard-heading">E</span>
                ` : ""}
                ${this.renderTeam(awayTeam, "away")}
                ${showStats
                    ? this.renderValue(event.scores.away) +
                        this.renderValue(teamStats.away?.hits) +
                        this.renderValue(teamStats.away?.errors)
                    : ""}
                ${this.renderTeam(homeTeam, "home")}
                ${showStats
                    ? this.renderValue(event.scores.home) +
                        this.renderValue(teamStats.home?.hits) +
                        this.renderValue(teamStats.home?.errors)
                    : ""}
            </span>`;
    }

    renderTeam(team, position) {
        const record = this.formatRecord(team.record);

        return `
            <span class="team-identity sports-widget-team sports-scoreboard-team
                sports-scoreboard-team-${position}">
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

    renderValue(value) {
        return `
            <span class="sports-scoreboard-value">
                ${value ?? "—"}
            </span>`;
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

    hasReachedScheduledStart(state = {}) {
        const scheduledAt = Date.parse(state.scheduledAt);

        if (!Number.isNaN(scheduledAt)) {
            return Date.now() >= scheduledAt;
        }

        const timeMatch = String(
            state.scheduledTime || ""
        ).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

        if (!timeMatch) return false;

        const scheduledTime = new Date();
        let hours = Number(timeMatch[1]) % 12;

        if (timeMatch[3].toUpperCase() === "PM") hours += 12;

        scheduledTime.setHours(hours, Number(timeMatch[2]), 0, 0);

        return Date.now() >= scheduledTime.getTime();
    }

    formatInning(inning = {}) {
        const number = inning.number;

        if (number == null) return "—";

        const remainder = number % 100;
        const suffix = remainder >= 11 && remainder <= 13
            ? "th"
            : number % 10 === 1
                ? "st"
                : number % 10 === 2
                    ? "nd"
                    : number % 10 === 3
                        ? "rd"
                        : "th";

        return `${inning.half || ""} ${number}${suffix}`.trim();
    }

}

const mlbSportsWidgetRenderer = new MlbSportsWidgetRenderer();

if (typeof window !== "undefined") {
    window.mosaicSportsWidgetRendererRegistry.register(
        "MLB",
        mlbSportsWidgetRenderer
    );
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        MlbSportsWidgetRenderer,
        mlbSportsWidgetRenderer
    };
}
