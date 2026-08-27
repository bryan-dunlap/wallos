class SportsWidgetScheduledPresenter {

    render(event) {
        return `
            <span class="sports-widget-scheduled-scoreboard">
                ${this.renderTeam(event.participants.away, "away")}
                ${this.renderTeam(event.participants.home, "home")}
            </span>`;
    }

    renderTeam(team, position) {
        const record = this.formatRecord(team.record);

        return `
            <span class="team-identity sports-widget-team
                sports-widget-team-${position}">
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

const sportsWidgetScheduledPresenter =
    new SportsWidgetScheduledPresenter();

if (typeof window !== "undefined") {
    window.mosaicSportsWidgetScheduledPresenter =
        sportsWidgetScheduledPresenter;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        SportsWidgetScheduledPresenter,
        sportsWidgetScheduledPresenter
    };
}
