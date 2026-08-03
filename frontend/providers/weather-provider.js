class WeatherProvider {

    constructor() {
        this.refreshTimer = null;
    }

    start() {
        this.stop();
        this.refresh();
        this.refreshTimer = setInterval(
            () => this.refresh(),
            30 * 60 * 1000
        );
    }

    stop() {
        if (!this.refreshTimer) return;

        clearInterval(this.refreshTimer);
        this.refreshTimer = null;
    }

    async refresh() {
        try {
            const response = await fetch("/api/weather");

            if (!response.ok) {
                throw new Error(
                    `Weather request failed: ${response.status}`
                );
            }

            const weatherData = await response.json();
            const todayDate = new Intl.DateTimeFormat(
                "en-CA",
                {
                    timeZone: weatherData.location.timezone,
                    year: "numeric",
                    month: "2-digit",
                    day: "2-digit"
                }
            ).format(new Date());
            const today = weatherData.daily.find(
                (day) => day.date === todayDate
            );

            if (!weatherData.current || !today) {
                throw new Error(
                    "Current weather data is unavailable."
                );
            }

            this.publishWeatherEvent(
                weatherData,
                today
            );
        } catch (error) {
            console.error(
                "Unable to load weather:",
                error
            );

            this.publishUnavailableEvent();
        }
    }

    publishWeatherEvent(weatherData, today) {
        const weatherCode =
            weatherData.current.weatherCode;
        const condition =
            this.getCondition(weatherCode);
        const event = createMosaicEvent({
            type: "weather",
            title: "Weather Update",
            subtitle: condition,
            source: "weather",
            payload: {
                location: [
                    weatherData.location.name,
                    weatherData.location.state
                ].filter(Boolean).join(", "),
                temperature:
                    weatherData.current.temperature,
                condition,
                icon: this.getIcon(weatherCode),
                high: today.high,
                low: today.low,
                precipitation:
                    today.precipitationChance,
                status: "available"
            }
        });

        window.mosaicApp.eventBus.publish(event);
    }

    publishUnavailableEvent() {
        const event = createMosaicEvent({
            type: "weather",
            title: "Weather Update",
            subtitle: "Weather unavailable",
            source: "weather",
            payload: {
                location: "",
                temperature: null,
                condition: "",
                icon: "",
                high: null,
                low: null,
                precipitation: null,
                status: "unavailable"
            }
        });

        window.mosaicApp.eventBus.publish(event);
    }

    getCondition(code) {
        const conditions = {
            0: "Clear skies",
            1: "Mostly clear",
            2: "Partly cloudy",
            3: "Cloudy",
            45: "Fog",
            48: "Freezing fog",
            51: "Light drizzle",
            53: "Drizzle",
            55: "Heavy drizzle",
            56: "Freezing drizzle",
            57: "Heavy freezing drizzle",
            61: "Light rain",
            63: "Rain",
            65: "Heavy rain",
            66: "Freezing rain",
            67: "Heavy freezing rain",
            71: "Light snow",
            73: "Snow",
            75: "Heavy snow",
            77: "Snow grains",
            80: "Light showers",
            81: "Showers",
            82: "Heavy showers",
            85: "Light snow showers",
            86: "Heavy snow showers",
            95: "Thunderstorms",
            96: "Thunderstorms with hail",
            99: "Severe thunderstorms"
        };

        return conditions[code] || "Weather unavailable";
    }

    getIcon(code) {
        if (code === 0) return "☀️";
        if (code === 1 || code === 2) return "🌤️";
        if (code === 3) return "☁️";
        if (code === 45 || code === 48) return "🌫️";
        if (code >= 51 && code <= 67) return "🌧️";
        if (code >= 71 && code <= 77) return "❄️";
        if (code >= 80 && code <= 82) return "🌦️";
        if (code >= 85 && code <= 86) return "🌨️";
        if (code >= 95) return "⛈️";

        return "";
    }

}
