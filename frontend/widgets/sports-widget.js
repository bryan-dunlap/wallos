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
        this.games = [];
        this.currentGameIndex = 0;
        this.rotationTimer = null;
        this.unsubscribe = null;
    }

    mount(element) {
        this.stopRotation();

        if (this.unsubscribe) {
            this.unsubscribe();
        }

        this.element = element;
        this.subscribeToEvents();
        this.render();
    }

    subscribeToEvents() {
        this.unsubscribe =
            window.mosaicApp.eventCoordinator.subscribe(
            "sports",
            (event) => this.showEvent(event)
        );
    }

    showEvent(event) {
        this.stopRotation();
        this.state = event;
        const games = Array.isArray(event.payload?.games)
            ? event.payload.games
            : [];
        this.games = this.selectRotatingGames(games);
        this.currentGameIndex = 0;
        this.render();

        if (this.games.length > 1) {
            this.startRotation();
        }
    }

    selectRotatingGames(games) {
        return games.filter(
            (game) =>
                !this.isCancelled(game) &&
                this.hasUsableMatchup(game)
        );
    }

    isInterrupted(game) {
        return /delayed|postponed|suspended/i.test(
            game.status?.detail || ""
        );
    }

    isCancelled(game) {
        const status = [
            game.status?.state,
            game.status?.detail
        ].filter(Boolean).join(" ");

        return /cancelled|canceled/i.test(status);
    }

    hasUsableMatchup(game) {
        return [game.awayTeam, game.homeTeam].every(
            (team) =>
                team &&
                typeof team.name === "string" &&
                team.name.trim() !== "" &&
                team.name !== "Team TBD"
        );
    }

    startRotation() {
        this.stopRotation();

        if (this.games.length < 2) return;

        this.rotationTimer = setInterval(
            () => this.advanceGame(),
            8000
        );
    }

    stopRotation() {
        if (!this.rotationTimer) return;

        clearInterval(this.rotationTimer);
        this.rotationTimer = null;
    }

    advanceGame() {
        if (this.games.length < 2) return;

        this.currentGameIndex =
            (this.currentGameIndex + 1) %
            this.games.length;

        this.render();
    }

    unmount() {
        this.stopRotation();

        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        this.element = null;
    }

    render() {
        const payload = this.state.payload || {};
        const game =
            this.games[this.currentGameIndex] || {};
        const isLoading =
            payload.availability === "loading";
        const isAvailable =
            payload.availability === "available";
        const sport = payload.sport || "Sports";
        const status = isLoading
            ? "Loading"
            : !isAvailable
                ? "Unavailable"
                : "Idle";

        if (!isAvailable || this.games.length === 0) {
            this.element.innerHTML = `
                <div class="widget-header">
                    <div class="widget-title">${sport}</div>
                    <div class="widget-status">${status}</div>
                </div>
                <div class="widget-body">
                    ${isLoading
                        ? "Loading game"
                        : isAvailable
                            ? "No games scheduled"
                            : "No Data"}
                </div>
                <div class="widget-footer">
                    <span>—</span>
                </div>
            `;
            return;
        }

        if (sport === "MLB") {
            const presentation = this.renderMlbGame(game);

            this.element.innerHTML = `
                <div class="widget-header">
                    <div class="widget-title">${sport}</div>
                    <div class="widget-status">${presentation.status}</div>
                </div>

                <div class="widget-body sports-matchup-layout">
                    ${presentation.content}
                </div>

                <div class="widget-footer">
                    <span></span>
                </div>
            `;
        }
    }

    renderMlbGame(game) {
        const statusState =
            game.status?.state || "";
        const statusDetail =
            game.status?.detail || "";
        const interrupted = this.isInterrupted(game);
        const liveStatus =
            this.formatInning(game.linescore?.inning);
        const hasReachedScheduledStart =
            this.hasReachedScheduledStart(game);
        const hasGameStarted =
            hasReachedScheduledStart &&
            game.linescore?.inning?.number != null;
        const showStats =
            statusState === "Final" ||
            hasGameStarted;
        const status = interrupted
            ? statusDetail
            : statusState === "Scheduled"
                ? game.scheduledTime || "—"
                : statusState === "Live"
                    ? hasGameStarted
                        ? liveStatus
                        : game.scheduledTime || "—"
                    : statusState === "Final"
                        ? "Final"
                        : statusDetail || statusState;
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
        const awayTeam = game.awayTeam || {};
        const homeTeam = game.homeTeam || {};

        return {
            status,
            content: `
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
                </span>`
        };
    }

    hasReachedScheduledStart(game) {
        const scheduledAt = Date.parse(
            game.scheduledAt
        );

        if (!Number.isNaN(scheduledAt)) {
            return Date.now() >= scheduledAt;
        }

        const timeMatch = String(
            game.scheduledTime || ""
        ).match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);

        if (!timeMatch) return false;

        const scheduledTime = new Date();
        let hours = Number(timeMatch[1]) % 12;

        if (timeMatch[3].toUpperCase() === "PM") {
            hours += 12;
        }

        scheduledTime.setHours(
            hours,
            Number(timeMatch[2]),
            0,
            0
        );

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
        const half = inning.half || "";

        return `${half} ${number}${suffix}`.trim();
    }

}
