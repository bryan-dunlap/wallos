class WeatherWidget {

    constructor() {
        this.element = null;
        this.state = {
            title: "Weather",
            subtitle: ""
        };
    }

    mount(element) {
        this.element = element;
        this.subscribeToEvents();
        this.render();
    }

    subscribeToEvents() {
        window.mosaicApp.eventCoordinator.subscribe(
            "weather",
            (event) => this.showEvent(event)
        );
    }

    showEvent(event) {
        this.state = event;
        this.render();
    }

    render() {
        this.element.innerHTML = `
            <div class="widget-title">
                ${this.state.title}
            </div>

            <div class="widget-subtitle">
                ${this.state.subtitle}
            </div>
        `;
    }

}
