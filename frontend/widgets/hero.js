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
        return `

            <div class="hero-resting">
                <div class="hero-title">
                    ${this.state.title}
                </div>

                <div class="hero-subtitle">
                    ${this.state.subtitle}
                </div>
            </div>

        `;

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
