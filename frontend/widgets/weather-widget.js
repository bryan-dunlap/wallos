class WeatherWidget {

    constructor() {
        this.element = null;
        this.density = "compact";
        this.unsubscribe = null;
        this.state = {
            title: "Weather",
            subtitle: "",
            payload: {
                status: "loading"
            }
        };
    }

    mount(element) {
        this.unmount();
        this.element = element;
        this.subscribeToEvents();
        this.render();
    }

    subscribeToEvents() {
        this.unsubscribe = window.mosaicApp.eventCoordinator.subscribe(
            "weather",
            (event) => this.showEvent(event)
        );
    }

    showEvent(event) {
        this.state = event;
        this.render();
    }

    setPresentationContext(context = {}) {
        const density = context.density === "expanded"
            ? "expanded"
            : "compact";

        if (this.density === density) return;
        this.density = density;
        this.render();
    }

    unmount() {
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = null;
        this.element = null;
    }

    render() {
        if (!this.element) return;

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
            payload.precipitation > 0;
        const freshness = getWeatherFreshness(payload);

        this.element.dataset.normalWidgetDensity = this.density;

        if (this.density === "expanded") {
            this.element.innerHTML = this.renderExpanded({
                payload,
                isAvailable,
                location,
                icon,
                temperature,
                condition,
                high,
                low,
                showPrecipitation,
                freshness
            });
            return;
        }

        this.element.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">Weather</div>
                <div class="widget-status">${freshness}</div>
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

                <div class="weather-details">
                    ${condition} · H ${high}° · L ${low}°
                    ${showPrecipitation
                        ? ` · Rain ${payload.precipitation}%`
                        : ""}
                </div>
            </div>
        `;
    }

    renderExpanded(view) {
        const feelsLike = view.isAvailable &&
            Number.isFinite(view.payload.apparentTemperature)
            ? `${view.payload.apparentTemperature}°`
            : "—";
        const hours = view.isAvailable && Array.isArray(view.payload.hourly)
            ? view.payload.hourly.slice(0, 5)
            : [];

        return `
            <div class="widget-header">
                <div class="widget-title">Weather</div>
                <div class="widget-status">${view.freshness}</div>
            </div>
            <div class="normal-widget-expanded-content weather-expanded">
                <div class="normal-widget-expanded-primary weather-expanded-primary">
                    <div class="weather-expanded-location">${view.location}</div>
                    <div class="weather-expanded-current">
                        <span class="weather-expanded-icon">${view.icon}</span>
                        <span class="weather-expanded-temperature">${view.temperature}</span>
                        <span class="weather-expanded-condition">${view.condition}</span>
                    </div>
                    <div class="weather-expanded-support">
                        <span>Feels ${feelsLike}</span>
                        <span>H ${view.high}°</span>
                        <span>L ${view.low}°</span>
                        ${view.showPrecipitation
                            ? `<span>Rain ${view.payload.precipitation}%</span>`
                            : ""}
                    </div>
                </div>
                ${hours.length ? `
                    <div class="normal-widget-expanded-secondary weather-hourly" aria-label="Upcoming hourly weather">
                        ${hours.map(renderWeatherHour).join("")}
                    </div>
                ` : ""}
            </div>
        `;
    }

}

function getWeatherFreshness(payload = {}) {
    if (payload.status === "loading") return "Loading";
    if (payload.status !== "available") return "Unavailable";
    return payload.stale === true ? "Last known" : "Current";
}

function renderWeatherHour(hour = {}) {
    const chance = Number(hour.precipitationChance);
    return `
        <div class="weather-hourly-entry">
            <span class="weather-hourly-time">${formatWeatherHour(hour.at)}</span>
            <span class="weather-hourly-icon" aria-hidden="true">${hour.icon || "—"}</span>
            <span class="weather-hourly-temperature">${Number.isFinite(hour.temperature) ? `${hour.temperature}°` : "—"}</span>
            <span class="weather-hourly-precipitation">${chance > 0 ? `${chance}%` : ""}</span>
        </div>
    `;
}

function formatWeatherHour(value) {
    const match = String(value || "").match(/T(\d{2}):(\d{2})/);
    if (!match) return "—";
    const hour = Number(match[1]);
    return `${hour % 12 || 12}${hour >= 12 ? " PM" : " AM"}`;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        WeatherWidget,
        formatWeatherHour,
        getWeatherFreshness,
        renderWeatherHour
    };
}
