class FootballGameRenderer {

    render(payload = {}) {
        const away = this.normalizeTeam(payload.teams?.away, "AWAY");
        const home = this.normalizeTeam(payload.teams?.home, "HOME");

        return `
            <div class="football-gamecast">
                ${this.renderMatchup(payload, away, home)}
                ${this.renderGameState(payload)}
                ${this.renderDrive(payload.drive)}
                ${this.renderField(payload)}
                ${this.renderLastPlay(payload.lastPlay)}
                ${this.renderLineScore(payload, away, home)}
            </div>
        `;
    }

    normalizeTeam(team = {}, fallback) {
        const id = typeof team.id === "string" && team.id
            ? team.id
            : fallback;
        const idAbbreviation = id.includes(":")
            ? id.split(":").at(-1)
            : id;

        return {
            id,
            abbreviation: typeof team.abbreviation === "string" &&
                team.abbreviation
                ? team.abbreviation.toUpperCase()
                : idAbbreviation.toUpperCase(),
            name: team.shortName || team.name || fallback,
            logo: typeof team.logo === "string" ? team.logo : ""
        };
    }

    renderMatchup(payload, away, home) {
        return `
            <div class="football-matchup">
                ${this.renderTeamIdentity(away, "away")}
                <div class="football-team-score football-team-score-away">
                    ${this.value(payload.score?.away)}
                </div>
                <div class="football-matchup-separator">@</div>
                <div class="football-team-score football-team-score-home">
                    ${this.value(payload.score?.home)}
                </div>
                ${this.renderTeamIdentity(home, "home")}
            </div>
        `;
    }

    renderTeamIdentity(team, side) {
        const logo = team.logo
            ? `<img class="football-team-logo-image"
                src="${this.escape(team.logo)}" alt=""
                onerror="this.hidden=true">`
            : "";
        const logoMarkup = `
            <div class="football-team-logo" aria-hidden="true">
                ${logo}
            </div>
        `;
        const nameMarkup = `
            <div class="football-team-name">
                ${this.escape(team.name)}
            </div>
        `;

        return `
            <div class="football-team-identity football-team-identity-${side}">
                ${side === "home"
                    ? `${nameMarkup}${logoMarkup}`
                    : `${logoMarkup}${nameMarkup}`}
            </div>
        `;
    }

    renderGameState(payload) {
        const state = payload.gameState || {};
        const situation = payload.situation || {};
        const stateText = this.formatGameState(payload.status, state);
        const situationText = situation.shortText ||
            this.formatDownDistance(situation.down, situation.distance);

        return `
            <div class="football-game-state">
                <span class="football-period-clock">${
                    this.escape(stateText)
                }</span>
                ${situationText ? `<span class="football-down-distance">${
                    this.escape(situationText)
                }</span>` : ""}
                ${situation.fieldPositionText
                    ? `<span class="football-field-position">${
                        this.escape(situation.fieldPositionText)
                    }</span>`
                    : ""}
            </div>
        `;
    }

    formatGameState(status, state) {
        if (status === "final" || state.phase === "final") return "FINAL";
        if (state.phase === "halftime") return "HALF";

        const period = state.phase === "overtime" || state.quarter > 4
            ? "OT"
            : Number.isInteger(state.quarter)
                ? `Q${state.quarter}`
                : "";

        return [period, state.clock].filter(Boolean).join(" · ") || "—";
    }

    formatDownDistance(down, distance) {
        if (!Number.isInteger(down) || !Number.isInteger(distance)) return "";
        return `${this.ordinal(down)} & ${distance}`;
    }

    renderDrive(drive) {
        if (!drive) return `<div class="football-drive" aria-hidden="true"></div>`;

        const details = [];
        if (Number.isFinite(drive.plays)) details.push(
            `${drive.plays} ${drive.plays === 1 ? "PLAY" : "PLAYS"}`
        );
        if (Number.isFinite(drive.yards)) details.push(`${drive.yards} YDS`);
        if (drive.elapsed) details.push(drive.elapsed);
        if (details.length === 0 && drive.result) details.push(drive.result);

        return `
            <div class="football-drive">
                ${details.map((detail) => `<span>${
                    this.escape(detail)
                }</span>`).join("")}
            </div>
        `;
    }

    renderField(payload) {
        const situation = payload.situation || {};
        const normalizedBall = this.coordinate(situation.yardLine);

        if (normalizedBall === null) {
            if (this.isNeutralFieldState(payload)) {
                return this.renderNeutralField(payload);
            }

            return `<div class="football-field-placeholder" aria-hidden="true"></div>`;
        }

        const ball = this.fieldCoordinate(normalizedBall);
        const firstDown = this.fieldCoordinate(
            situation.firstDownYardLine
        );
        const direction = payload.possession?.team === "home"
            ? "home"
            : payload.possession?.team === "away"
                ? "away"
                : "unknown";
        const possessionLogo = ["away", "home"].includes(direction)
            ? payload.teams?.[direction]?.logo
            : null;
        const style = `--football-ball-position: ${ball}%;` +
            (firstDown === null
                ? ""
                : ` --football-first-down-position: ${firstDown}%;`);

        return `
            <div class="football-field${
                situation.redZone === true ? " is-red-zone" : ""
            } is-${direction}-direction" style="${style}"
                aria-label="Ball at ${this.escape(
                    situation.fieldPositionText || normalizedBall
                )}">
                <span class="football-end-zone football-end-zone-away"></span>
                <span class="football-yard-lines" aria-hidden="true">
                    ${this.renderYardLines()}
                </span>
                <span class="football-yard-numbers" aria-hidden="true">
                    ${this.renderYardNumbers()}
                </span>
                ${firstDown === null ? "" :
                    `<span class="football-first-down-marker" aria-hidden="true"></span>`}
                <span class="football-ball-marker" aria-hidden="true"></span>
                ${possessionLogo
                    ? `<span class="football-team-ball-marker" aria-hidden="true">
                        <img class="football-team-ball-marker-image"
                            src="${this.escape(possessionLogo)}" alt=""
                            onerror="this.parentElement.hidden=true">
                    </span>`
                    : ""}
                <span class="football-end-zone football-end-zone-home"></span>
            </div>
        `;
    }

    isNeutralFieldState(payload) {
        return payload.status === "final" ||
            ["halftime", "final"].includes(payload.gameState?.phase);
    }

    renderNeutralField(payload) {
        const awayPosition = this.fieldCoordinate(35);
        const midfield = this.fieldCoordinate(50);
        const homePosition = this.fieldCoordinate(65);
        const awayLogo = payload.teams?.away?.logo;
        const homeLogo = payload.teams?.home?.logo;
        const logo = (source, side, position) => source
            ? `<span class="football-neutral-team-marker football-neutral-team-marker-${side}"
                    style="--football-neutral-team-position: ${position}%"
                    aria-hidden="true">
                    <img class="football-neutral-team-marker-image"
                        src="${this.escape(source)}" alt=""
                        onerror="this.parentElement.hidden=true">
                </span>`
            : "";

        return `
            <div class="football-field is-neutral-field"
                style="--football-first-down-position: ${midfield}%;"
                aria-label="Neutral matchup field">
                <span class="football-end-zone football-end-zone-away"></span>
                <span class="football-yard-lines" aria-hidden="true">
                    ${this.renderYardLines()}
                </span>
                <span class="football-yard-numbers" aria-hidden="true">
                    ${this.renderYardNumbers()}
                </span>
                <span class="football-first-down-marker" aria-hidden="true"></span>
                ${logo(awayLogo, "away", awayPosition)}
                ${logo(homeLogo, "home", homePosition)}
                <span class="football-end-zone football-end-zone-home"></span>
            </div>
        `;
    }

    renderYardLines() {
        return Array.from({ length: 19 }, (_, index) => {
            const position = (index + 1) * 5;
            const lineClass = position === 50
                ? " is-major is-midfield"
                : position % 10 === 0
                    ? " is-major"
                    : " is-minor";
            return `<span class="football-yard-line${lineClass}"
                style="--football-yard-position: ${
                    this.fieldCoordinate(position)
                }%"></span>`;
        }).join("");
    }

    renderYardNumbers() {
        const labels = [10, 20, 30, 40, 50, 40, 30, 20, 10];

        return labels.map((label, index) =>
            `<span class="football-yard-number"
                style="--football-yard-position: ${
                    this.fieldCoordinate((index + 1) * 10)
                }%">${
                    label
                }</span>`
        ).join("");
    }

    renderLastPlay(lastPlay) {
        return `
            <div class="football-last-play">
                ${lastPlay?.description
                    ? `<span class="football-last-play-label">LAST</span>` +
                        `<span class="football-last-play-text">${
                            this.escape(lastPlay.description)
                        }</span>`
                    : ""}
            </div>
        `;
    }

    renderLineScore(payload, away, home) {
        const periods = Array.isArray(payload.lineScore?.periods)
            ? payload.lineScore.periods
            : [];
        if (periods.length === 0) return "";

        return `
            <div class="football-line-score-region">
                <table class="football-line-score">
                    <thead><tr>
                        <th scope="col">Team</th>
                        ${periods.map((period) => `<th scope="col">${
                            period > 4 ? "OT" : `Q${period}`
                        }</th>`).join("")}
                        <th scope="col">T</th>
                    </tr></thead>
                    <tbody>
                        ${this.renderLineScoreRow(
                            away.abbreviation,
                            periods,
                            payload.lineScore?.away,
                            payload.score?.away
                        )}
                        ${this.renderLineScoreRow(
                            home.abbreviation,
                            periods,
                            payload.lineScore?.home,
                            payload.score?.home
                        )}
                    </tbody>
                </table>
            </div>
        `;
    }

    renderLineScoreRow(label, periods, scores, total) {
        return `
            <tr>
                <th scope="row">${this.escape(label)}</th>
                ${periods.map((_, index) => `<td>${
                    this.value(scores?.[index])
                }</td>`).join("")}
                <td>${this.value(total)}</td>
            </tr>
        `;
    }

    coordinate(value) {
        return Number.isFinite(value)
            ? Math.min(100, Math.max(0, value))
            : null;
    }

    fieldCoordinate(value) {
        const normalized = this.coordinate(value);

        return normalized === null
            ? null
            : Math.round((10 + normalized) / 120 * 100000000) / 1000000;
    }

    ordinal(value) {
        return `${value}${{ 1: "ST", 2: "ND", 3: "RD" }[value] || "TH"}`;
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
    "football-game",
    new FootballGameRenderer()
);
