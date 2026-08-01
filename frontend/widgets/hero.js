class MosaicHero {

    constructor(element){

        this.element = element;

        this.state = {
            type: "default",
            title: "Daily Briefing",
            subtitle: ""
        };

    }


    render(){

        this.element.innerHTML = `

            <div class="hero-title">
                ${this.state.title}
            </div>

            <div class="hero-subtitle">
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


/* ==========================
   Hero Startup
========================== */

const heroContainer = document.querySelector(
    ".hero-container"
);

if (heroContainer) {

    const mosaicHero = new MosaicHero(
        heroContainer
    );

    mosaicHero.render();

}