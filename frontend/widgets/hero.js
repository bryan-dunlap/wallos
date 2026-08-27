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
