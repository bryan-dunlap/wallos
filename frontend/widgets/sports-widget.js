class SportsWidget {

    constructor() {
        this.element = null;
        this.state = {
            title: "Sports",
            subtitle: "",
            payload: {
                availability: "loading"
            }
        };
    }

    mount(element) {
        this.element = element;
        this.subscribeToEvents();
        this.render();
    }

    subscribeToEvents() {
        window.mosaicApp.eventCoordinator.subscribe(
            "sports",
            (event) => this.showEvent(event)
        );
    }

    showEvent(event) {
        this.state = event;
        this.render();
    }

    render() {
        const payload = this.state.payload || {};
        const isLoading =
            payload.availability === "loading";
        const isAvailable =
            payload.availability === "available";
        const statusState =
            payload.status?.state || "";
        const showStats =
            statusState === "Live" ||
            statusState === "Final";
        const sport = payload.sport || "Sports";
        const status = isLoading
            ? "Loading"
            : !isAvailable
                ? "Unavailable"
                : statusState === "Scheduled"
                    ? payload.scheduledTime
                    : statusState;

        if (!isAvailable) {
            this.element.innerHTML = `
                <div class="widget-header">
                    <div class="widget-title">${sport}</div>
                    <div class="widget-status">${status}</div>
                </div>
                <div class="widget-body">
                    ${isLoading ? "Loading game" : "No Data"}
                </div>
                <div class="widget-footer">
                    <span>—</span>
                </div>
            `;
            return;
        }

        const formatRecord = (record) => (
            record?.wins != null &&
            record?.losses != null
                ? `(${record.wins}-${record.losses})`
                : ""
        );
        const renderLogo = (team) => (
            team.logo
                ? `<img class="team-identity-logo"
                    src="${team.logo}" alt="">`
                : `<span class="team-identity-logo"
                    aria-hidden="true">—</span>`
        );
        const renderTeam = (team, position) => `
            <span class="team-identity sports-scoreboard-team
                sports-scoreboard-team-${position}">
                ${renderLogo(team)}
                <span class="team-identity-text">
                    <span class="team-identity-name">
                        ${team.name}
                    </span>
                    <span class="team-identity-record">
                        ${formatRecord(team.record)}
                    </span>
                </span>
            </span>
        `;
        const renderValue = (value) => `
            <span class="sports-scoreboard-value">
                ${value ?? "—"}
            </span>
        `;
        const awayTeam = payload.awayTeam || {};
        const homeTeam = payload.homeTeam || {};

        this.element.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${sport}</div>
                <div class="widget-status">${status}</div>
            </div>

            <div class="widget-body sports-matchup-layout">
                <span class="sports-scoreboard">
                    ${showStats ? `
                        <span class="sports-scoreboard-corner"></span>
                        <span class="sports-scoreboard-heading">R</span>
                        <span class="sports-scoreboard-heading">H</span>
                        <span class="sports-scoreboard-heading">E</span>
                    ` : ""}
                    ${renderTeam(awayTeam, "away")}
                    ${showStats
                        ? renderValue(awayTeam.runs) +
                            renderValue(awayTeam.hits) +
                            renderValue(awayTeam.errors)
                        : ""}
                    ${renderTeam(homeTeam, "home")}
                    ${showStats
                        ? renderValue(homeTeam.runs) +
                            renderValue(homeTeam.hits) +
                            renderValue(homeTeam.errors)
                        : ""}
                </span>
            </div>

            <div class="widget-footer">
                <span></span>
            </div>
        `;
    }

}
