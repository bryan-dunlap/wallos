class MosaicHero {

    constructor(element){

        this.element = element;

        this.state = {
            type: "default",
            title: "Daily Briefing",
            subtitle: ""
        };

    }


    mount(element){
        this.element = element;
        this.subscribeToEvents();
        this.render();
    }


    subscribeToEvents(){
        [
            "default",
            "weather",
            "sports",
            "calendar"
        ].forEach((type) => {
            window.mosaicApp.eventCoordinator.subscribe(
                type,
                (event) => this.showEvent(event)
            );
        });
    }


    render(){
        const templates = {
            default: () => this.renderTemplate("default"),
            weather: () => this.renderTemplate("weather"),
            sports: () => this.renderTemplate("sports"),
            calendar: () => this.renderTemplate("calendar")
        };
        const template =
            templates[this.state.type] ||
            templates.default;

        this.element.innerHTML = template();

    }


    renderTemplate(type){
        const typeClass =
            type === "default"
                ? ""
                : ` hero-${type}`;

        return `

            <div class="hero-title${typeClass}">
                ${this.state.title}
            </div>

            <div class="hero-subtitle${typeClass}">
                ${this.state.subtitle}
            </div>

        `;

    }


    showEvent(event){

        this.state = event;

        this.render();

    }


    reset(){

        this.state = {
            type:"default",
            title:"Daily Briefing",
            subtitle:""
        };

        this.render();

    }

}
