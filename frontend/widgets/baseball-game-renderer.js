class BaseballGameRenderer {

    render(payload) {
        const score = payload.score || {};
        const inning = payload.inning || {};
        const count = payload.count || {};
        const favoriteTeam = this.normalizeTeam(
            payload.teams?.favoriteTeam,
            "TEAM"
        );
        const opponentTeam = this.normalizeTeam(
            payload.teams?.opponent,
            "OPP"
        );

        return `
            <div class="baseball-gamecast">
                <div class="baseball-game-primary">
                    <div class="baseball-game-matchup">
                        <div class="baseball-game-team-identity baseball-game-team-identity-favorite">
                            ${this.renderTeamLogo(favoriteTeam)}

                            <div class="baseball-game-team-name">
                                ${this.escape(favoriteTeam.name)}
                            </div>
                        </div>

                        <div class="baseball-game-team-score">
                            ${this.value(score.favoriteTeam)}
                        </div>

                        <div class="baseball-game-versus">VS</div>

                        <div class="baseball-game-team-score">
                            ${this.value(score.opponent)}
                        </div>

                        <div class="baseball-game-team-identity baseball-game-team-identity-opponent">
                            <div class="baseball-game-team-name">
                                ${this.escape(opponentTeam.name)}
                            </div>

                            ${this.renderTeamLogo(opponentTeam)}
                        </div>
                    </div>

                    <div class="baseball-game-inning">
                        ${this.escape(this.formatInning(inning))}
                    </div>
                </div>

                ${this.renderLineScore(
                    payload.lineScore,
                    favoriteTeam.id,
                    opponentTeam.id,
                    inning.number
                )}

                <div class="baseball-game-situation">
                    ${this.renderBases(payload.bases)}

                    <div class="baseball-game-indicators">
                        ${this.renderIndicators(
                            "Balls",
                            count.balls,
                            4
                        )}
                        ${this.renderIndicators(
                            "Strikes",
                            count.strikes,
                            3
                        )}
                        ${this.renderIndicators(
                            "Outs",
                            payload.outs,
                            3
                        )}
                    </div>
                </div>
            </div>
        `;
    }

    normalizeTeam(team, fallbackId) {
        const id = typeof team?.id === "string" && team.id.trim()
            ? team.id.trim().toUpperCase()
            : fallbackId;
        const name = typeof team?.name === "string" && team.name.trim()
            ? team.name.trim()
            : id;
        const logo = typeof team?.logo === "string"
            ? team.logo.trim()
            : "";

        return { id, name, logo };
    }

    renderTeamLogo(team) {
        const image = team.logo
            ? `<img class="baseball-game-team-logo-image"
                src="${this.escape(team.logo)}"
                alt=""
                onerror="this.hidden=true">`
            : "";

        return `
            <div class="baseball-game-team-logo" aria-hidden="true">
                ${image}
            </div>
        `;
    }

    renderLineScore(
        lineScore,
        favoriteLabel,
        opponentLabel,
        currentInning
    ) {
        const innings = this.getVisibleInnings(
            lineScore?.innings,
            currentInning
        );

        if (innings.length === 0) return "";

        const inningHeadings = innings
            .map((inning) => `<th scope="col">${inning.number}</th>`)
            .join("");
        const teamColumnWidth = 4.5;
        const scoreColumnWidth = 2.35;
        const lineScoreWidth =
            teamColumnWidth +
            (innings.length + 3) * scoreColumnWidth;

        return `
            <div class="baseball-line-score-wrap">
                <table class="baseball-line-score"
                    style="--baseball-line-score-width: ${lineScoreWidth}rem">
                    <colgroup>
                        <col class="baseball-line-score-team-column">
                        <col class="baseball-line-score-inning-column"
                            span="${innings.length}">
                        <col class="baseball-line-score-total-column"
                            span="3">
                    </colgroup>
                    <thead>
                        <tr>
                            <th scope="col">Team</th>
                            ${inningHeadings}
                            <th scope="col">R</th>
                            <th scope="col">H</th>
                            <th scope="col">E</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${this.renderLineScoreRow(
                            favoriteLabel,
                            innings,
                            "favoriteTeam",
                            lineScore.favoriteTeam
                        )}
                        ${this.renderLineScoreRow(
                            opponentLabel,
                            innings,
                            "opponent",
                            lineScore.opponent
                        )}
                    </tbody>
                </table>
            </div>
        `;
    }

    getVisibleInnings(allInnings, currentInning) {
        const innings = Array.isArray(allInnings)
            ? allInnings.filter(
                (inning) =>
                    Number.isInteger(inning?.number) &&
                    inning.number > 0
            )
            : [];
        const inningByNumber = new Map(
            innings.map((inning) => [inning.number, inning])
        );
        const latestReturnedInning = innings.reduce(
            (latest, inning) => Math.max(latest, inning.number),
            0
        );
        const activeInning =
            Number.isInteger(currentInning) && currentInning > 0
                ? currentInning
                : latestReturnedInning;

        if (activeInning === 0) return [];

        const lastVisibleInning = Math.max(9, activeInning);
        const firstVisibleInning = lastVisibleInning - 8;

        return Array.from({ length: 9 }, (_, index) => {
            const number = firstVisibleInning + index;
            const inning = inningByNumber.get(number);

            return inning
                ? { ...inning }
                : {
                    number,
                    favoriteTeam: null,
                    opponent: null
                };
        });
    }

    renderLineScoreRow(label, innings, teamKey, totals = {}) {
        const inningCells = innings
            .map((inning) => `<td>${this.value(inning[teamKey])}</td>`)
            .join("");

        return `
            <tr>
                <th scope="row">${this.escape(label)}</th>
                ${inningCells}
                <td>${this.value(totals.runs)}</td>
                <td>${this.value(totals.hits)}</td>
                <td>${this.value(totals.errors)}</td>
            </tr>
        `;
    }

    renderBases(bases = {}) {
        const occupiedLabels = [
            ["first", "first"],
            ["second", "second"],
            ["third", "third"]
        ]
            .filter(([key]) => bases[key] === true)
            .map(([, label]) => label);
        const description = occupiedLabels.length > 0
            ? `Occupied: ${occupiedLabels.join(", ")}`
            : "Bases empty";

        return `
            <div class="baseball-bases" aria-label="${description}">
                ${this.renderBase("second", bases.second)}
                ${this.renderBase("third", bases.third)}
                ${this.renderBase("first", bases.first)}
            </div>
        `;
    }

    renderBase(base, occupied) {
        const stateClass = occupied
            ? " is-occupied"
            : "";

        return `<span class="baseball-base baseball-base-${base}${stateClass}" aria-hidden="true"></span>`;
    }

    renderIndicators(label, value, total) {
        const current = Number.isInteger(value)
            ? Math.min(Math.max(value, 0), total)
            : 0;
        const indicators = Array.from(
            { length: total },
            (_, index) => `
                <span class="baseball-indicator${
                    index < current ? " is-filled" : ""
                }" aria-hidden="true"></span>
            `
        ).join("");

        return `
            <div class="baseball-indicator-row" aria-label="${this.escape(label)}: ${current}">
                <span class="baseball-indicator-label">
                    ${this.escape(label)}
                </span>
                <span class="baseball-indicator-values">
                    ${indicators}
                </span>
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
