class MosaicHero {

    constructor(element){

        this.element = element;

        this.state = {
            type: "default",
            title: "Daily Briefing",
            subtitle: "",
            candidate: null,
            payload: null
        };

    }


    mount(element){
        this.element = element;
        this.subscribeToEvents();
        this.render();
    }


    subscribeToEvents(){
        window.mosaicApp.eventCoordinator.subscribe(
            "hero-display",
            (event) => this.showEvent(event)
        );
    }


    render(){
        this.element.innerHTML = this.renderRestingTemplate();

    }


    renderRestingTemplate(){
        if (this.isDailyContext(this.state.payload)) {
            return this.renderDailyContextTemplate(
                this.state.payload
            );
        }

        return this.renderLegacyRestingTemplate();
    }


    isDailyContext(payload){
        return payload?.schemaVersion === 1 &&
            payload.greeting &&
            typeof payload.greeting.text === "string";
    }


    renderDailyContextTemplate(context){
        const composition = this.createDailyComposition(context);
        const hasContext = composition.alerts.length > 0 ||
            composition.sports.length > 0 ||
            composition.insights.length > 0 ||
            composition.calendar.length > 0;

        return `
            <div class="hero-resting hero-resting-daily${
                hasContext ? "" : " is-greeting-only"
            }">
                <div class="hero-title">
                    ${this.escape(context.greeting.text)}
                </div>

                <div class="hero-daily-rule" aria-hidden="true"></div>

                <div class="hero-daily-content"${
                    hasContext ? "" : " aria-hidden=\"true\""
                }>
                    ${this.renderDailyAlerts(composition.alerts)}

                    ${this.renderDailySports(composition.sports)}

                    ${this.renderDailyInsights(composition.insights)}
                    ${this.renderDailyCalendar(
                        composition.calendar,
                        composition.hiddenCalendarCount
                    )}
                </div>
            </div>
        `;
    }


    createDailyComposition(context){
        const maximumItems = 6;
        const available = {
            alerts: Array.isArray(context.alerts)
                ? context.alerts.filter((item) => item?.headline)
                : [],
            sports: Array.isArray(context.sports)
                ? context.sports.filter((item) => item?.favoriteTeam)
                : [],
            insights: Array.isArray(context.insights)
                ? context.insights.filter((item) => item?.headline)
                : [],
            calendar: Array.isArray(context.calendar)
                ? context.calendar.filter((item) => item?.title)
                : []
        };
        let remaining = maximumItems;
        const composition = {
            alerts: [],
            sports: [],
            insights: [],
            calendar: [],
            hiddenCalendarCount: 0
        };

        if (available.alerts.length > 0 && remaining > 0) {
            composition.alerts = available.alerts.slice(0, 1);
            remaining -= 1;
        }

        if (available.sports.length > 0 && remaining > 0) {
            composition.sports = available.sports.slice(0, 1);
            remaining -= 1;
        }

        if (available.insights.length > 0 && remaining > 0) {
            composition.insights = available.insights.slice(0, 1);
            remaining -= 1;
        }

        if (available.calendar.length > 0 && remaining > 0) {
            composition.calendar = available.calendar.slice(0, 1);
            remaining -= 1;
        }

        if (remaining > 0 && available.sports.length > 1) {
            const additionalSports = available.sports.slice(
                1,
                2
            );
            composition.sports.push(...additionalSports);
            remaining -= additionalSports.length;
        }

        if (remaining > 0 && available.calendar.length > 1) {
            composition.calendar.push(
                ...available.calendar.slice(
                    1,
                    1 + remaining
                )
            );
        }

        composition.hiddenCalendarCount = Math.max(
            available.calendar.length - composition.calendar.length,
            0
        );

        return composition;
    }


    renderDailyAlerts(alerts){
        if (alerts.length === 0) return "";

        return `<div class="hero-daily-alerts">
            ${alerts.map((alert) => `
                <div class="hero-daily-alert hero-context-row">
                    <span class="hero-context-glyph hero-alert-glyph" aria-hidden="true">!</span>
                    <div class="hero-context-entry-body">
                    <div class="hero-daily-alert-title">
                        ${this.escape(alert.headline)}
                    </div>
                    ${alert.summary ? `
                        <div class="hero-daily-alert-summary">
                            ${this.escape(alert.summary)}
                        </div>
                    ` : ""}
                    </div>
                </div>
            `).join("")}
        </div>`;
    }


    renderDailySports(sports){
        if (sports.length === 0) return "";

        return `<div class="hero-daily-sports">
            ${sports.map((item) => {
                const team = item.favoriteTeam || {};
                const state = ["active", "completed", "upcoming"]
                    .includes(item.state)
                    ? item.state
                    : "upcoming";
                const teamName = team.shortName ||
                    team.name || team.abbreviation || "";
                const opponent = item.opponent
                    ? ` vs. ${item.opponent}`
                    : "";
                const matchup = `${teamName}${opponent}`;

                return `
                    <div class="hero-daily-sport hero-context-row hero-daily-sport-${
                        state
                    }">
                        ${this.renderDailySportsMark(item)}
                        <span class="hero-context-entry-body">
                            ${this.escape(this.formatDailySportLine(
                                item,
                                matchup,
                                teamName
                            ))}
                        </span>
                    </div>
                `;
            }).join("")}
        </div>`;
    }


    renderDailySportsMark(item){
        const sport = String(item.favoriteTeam?.sport || "")
            .trim()
            .toLowerCase();
        const league = String(item.league || "")
            .trim()
            .toUpperCase();
        const sportIdentity = sport || league.toLowerCase() || "unknown";
        const glyph = {
            baseball: "⚾",
            football: "🏈",
            hockey: "🏒",
            basketball: "🏀"
        }[sport] || {
            MLB: "⚾",
            NFL: "🏈",
            NHL: "🏒",
            NBA: "🏀"
        }[league] || "•";

        return `
            <span class="hero-context-glyph hero-sports-glyph"
                data-sport="${this.escape(sportIdentity)}" aria-hidden="true">
                ${glyph}
            </span>
        `;
    }


    formatDailySportLine(item, matchup, teamName){
        if (item.state === "completed") {
            return this.formatCompletedSportLine(
                item,
                matchup,
                teamName
            );
        }

        if (item.state === "active") {
            const score = this.formatDailyScore(item.score);
            return score
                ? `${matchup} · ${score} · Live`
                : `${matchup} · Live`;
        }

        if (!item.startsAt) return matchup;

        const start = new Date(item.startsAt);

        if (!Number.isFinite(start.getTime())) return matchup;

        return `${matchup} · ${new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit"
        }).format(start)}`;
    }


    formatCompletedSportLine(item, matchup, teamName){
        const opponent = item.opponent || "the opponent";
        let favoriteScore = item.score?.favoriteTeam;
        let opponentScore = item.score?.opponent;
        let outcome = null;

        if (
            !Number.isFinite(favoriteScore) ||
            !Number.isFinite(opponentScore)
        ) {
            const result = String(item.result || "").match(
                /\b(win|lose|tie)\s+(\d+)-(\d+)\b/i
            );

            if (result) {
                outcome = result[1].toLowerCase();
                favoriteScore = Number(result[2]);
                opponentScore = Number(result[3]);
            }
        }

        if (
            Number.isFinite(favoriteScore) &&
            Number.isFinite(opponentScore)
        ) {
            const score = `${favoriteScore}–${opponentScore}`;

            if (favoriteScore > opponentScore || outcome === "win") {
                return `${teamName} beat ${opponent} ${score}`;
            }

            if (favoriteScore < opponentScore || outcome === "lose") {
                return `${teamName} lost to ${opponent} ${score}`;
            }

            return `${teamName} tied ${opponent} ${score}`;
        }

        return item.result || `${matchup} · Final`;
    }


    formatDailyScore(score){
        if (!score) return "";

        if (
            Number.isFinite(score.favoriteTeam) &&
            Number.isFinite(score.opponent)
        ) {
            return `${score.favoriteTeam}–${score.opponent}`;
        }

        if (Number.isFinite(score.away) && Number.isFinite(score.home)) {
            return `${score.away}–${score.home}`;
        }

        return "";
    }


    renderDailyInsights(insights){
        if (insights.length === 0) return "";

        const insight = insights[0];

        return `
            <div class="hero-daily-insight hero-context-row${
                insight.emphasis === "significant"
                    ? " is-significant"
                    : ""
            }">
                <span class="hero-context-glyph hero-insight-glyph" aria-hidden="true">✦</span>
                <span class="hero-context-entry-body">
                    <span class="hero-daily-insight-title">
                        ${this.escape(insight.headline)}
                    </span>
                    ${insight.summary ? `
                        <span class="hero-daily-insight-summary">
                            ${this.escape(insight.summary)}
                        </span>
                    ` : ""}
                </span>
            </div>
        `;
    }


    renderDailyCalendar(calendar, hiddenCount = 0){
        if (calendar.length === 0) return "";

        return `<div class="hero-daily-calendar">
            ${calendar.map((item) => `
                <div class="hero-daily-calendar-item hero-context-row${
                    item.state === "active" ? " is-active" : ""
                }">
                    <span class="hero-context-glyph hero-calendar-glyph" aria-hidden="true"></span>
                    <span class="hero-context-entry-body hero-calendar-content">
                        <span class="hero-daily-calendar-title">
                            ${this.escape(item.title)}
                        </span>
                        <span class="hero-daily-calendar-time">
                            ${this.escape(this.formatDailyCalendarTime(item))}
                        </span>
                    </span>
                </div>
            `).join("")}
            ${hiddenCount > 0 ? `
                <div class="hero-daily-more">+${hiddenCount} more</div>
            ` : ""}
        </div>`;
    }


    formatDailyCalendarTime(item){
        if (item.allDay) return "All day";

        if (!item.startsAt) return "";

        const start = new Date(item.startsAt);

        if (!Number.isFinite(start.getTime())) return "";

        return new Intl.DateTimeFormat("en-US", {
            hour: "numeric",
            minute: "2-digit"
        }).format(start);
    }


    renderLegacyRestingTemplate(){
        const rows = this.getRestingRows();
        const legacySubtitle = rows.length === 0 && this.state.subtitle
            ? `<div class="hero-subtitle">
                    ${this.escape(this.state.subtitle)}
                </div>`
            : "";

        return `

            <div class="hero-resting">
                <div class="hero-title">
                    ${this.escape(this.state.title)}
                </div>

                ${legacySubtitle}

                ${this.renderRestingRows(rows)}

                ${rows.length === 0
                    ? this.renderRestingHighlights()
                    : ""}
            </div>

        `;

    }


    getRestingRows(){
        return Array.isArray(this.state.payload?.rows)
            ? this.state.payload.rows.slice(0, 3)
            : [];
    }


    renderRestingRows(rows = this.getRestingRows()){
        if (rows.length === 0) return "";

        return `
            <div class="hero-resting-rows">
                ${rows.map((row) => `
                    <div class="hero-resting-row hero-resting-row-${
                        row.type === "sports" ? "sports" : "calendar"
                    }">
                        ${this.escape(row.text)}
                    </div>
                `).join("")}
            </div>
        `;
    }


    renderRestingHighlights(){
        const highlights = Array.isArray(
            this.state.payload?.highlights
        )
            ? this.state.payload.highlights
            : [];

        return highlights.map((highlight) => {
            const significant =
                highlight.emphasis === "significant";

            return `
                <div class="hero-resting-highlight${
                    significant ? " is-significant" : ""
                }">
                    <div class="hero-resting-highlight-title">
                        ${significant ? "⚠ " : ""}${
                            this.escape(highlight.headline)
                        }
                    </div>
                    <div class="hero-resting-highlight-summary">
                        ${this.escape(highlight.summary)}
                    </div>
                </div>
            `;
        }).join("");
    }


    renderInterruptTemplate(){
        return `

            <div class="hero-interrupt">
                <div class="hero-title">
                    ${this.state.title}
                </div>

                <div class="hero-subtitle">
                    ${this.state.subtitle}
                </div>
            </div>

        `;

    }


    renderActiveTemplate(){
        return `

            <div class="hero-active">
                <div class="hero-title hero-active-header">
                    ${this.state.title}
                </div>

                <div class="hero-active-content" hidden></div>

                <div class="hero-subtitle hero-active-summary">
                    ${this.state.subtitle}
                </div>
            </div>

        `;

    }


    showEvent(event){
        const candidate = event.payload?.candidate;

        if (!candidate) {
            this.reset();
            return;
        }

        const modeRenderers = {
            resting: () => this.renderRestingHero(candidate),
            interrupt: () => this.renderInterruptHero(candidate),
            active: () => this.renderActiveHero(candidate)
        };
        const mode = candidate.mode || "resting";
        const renderer =
            modeRenderers[mode] || modeRenderers.resting;

        renderer();

    }


    renderRestingHero(candidate){
        this.setCandidateState(candidate);
        this.element.innerHTML = this.renderRestingTemplate();
    }


    renderInterruptHero(candidate){
        this.setCandidateState(candidate);
        this.element.innerHTML = this.renderInterruptTemplate();
    }


    renderActiveHero(candidate){
        this.setCandidateState(candidate);
        this.element.innerHTML = this.renderActiveTemplate();

        const contentRegion = this.element.querySelector(
            ".hero-active-content"
        );

        if (contentRegion) {
            contentRegion.payload = candidate.payload ?? null;

            const renderer =
                window.mosaicActiveRendererRegistry
                    ?.getForPayload(candidate.payload);

            if (renderer) {
                contentRegion.innerHTML = renderer.render(
                    candidate.payload,
                    candidate
                );
                contentRegion.hidden = false;

                const summaryRegion = this.element.querySelector(
                    ".hero-active-summary"
                );

                if (summaryRegion) summaryRegion.hidden = true;
            }
        }
    }


    setCandidateState(candidate){
        this.state = {
            type: "default",
            title: candidate.headline,
            subtitle: candidate.summary,
            candidate,
            payload: candidate.payload ?? null
        };

    }


    escape(value){
        return String(value ?? "")
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }


    reset(){

        this.state = {
            type:"default",
            title:"Daily Briefing",
            subtitle:"",
            candidate:null,
            payload:null
        };

        this.render();

    }

}
