class WeatherWidget {

    constructor() {
        this.element = null;
        this.state = {
            title: "Weather",
            subtitle: "",
            payload: {
                status: "loading"
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
            "weather",
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
            payload.status === "loading";
        const isAvailable =
            payload.status === "available";
        const icons = {
            sunny: "☀️"
        };
        const location = isAvailable
            ? payload.location
            : isLoading
                ? "—"
                : "Weather unavailable";
        const icon = isAvailable
            ? icons[payload.icon] || payload.icon || "—"
            : "—";
        const temperature = isAvailable
            ? `${payload.temperature}°`
            : "—°";
        const condition = isAvailable
            ? payload.condition
            : isLoading
                ? "Loading weather"
                : "Unable to load conditions";
        const high = isAvailable
            ? payload.high
            : "—";
        const low = isAvailable
            ? payload.low
            : "—";
        const showPrecipitation =
            isAvailable &&
            payload.precipitation != null;

        this.element.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">Weather</div>
                <div class="widget-status">LIVE</div>
            </div>

            <div class="weather-content">
                <div class="weather-location">
                    ${location}
                </div>

                <div class="weather-main">
                    <div class="weather-icon">${icon}</div>
                    <div class="weather-temperature">
                        ${temperature}
                    </div>
                </div>

                <div class="weather-rotating">
                    ${condition}
                </div>

                <div class="weather-details">
                    H ${high}° · L ${low}°
                    ${showPrecipitation
                        ? ` · Rain ${payload.precipitation}%`
                        : ""}
                </div>
            </div>
        `;
    }

}
