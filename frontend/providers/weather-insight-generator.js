class WeatherInsightGenerator {

    constructor() {
        this.unsubscribe = null;
    }

    start() {
        this.stop();
        this.unsubscribe =
            window.mosaicApp.eventBus.subscribe(
                "weather-facts",
                (event) => this.evaluate(event.payload)
            );
    }

    stop() {
        if (!this.unsubscribe) return;

        this.unsubscribe();
        this.unsubscribe = null;
    }

    evaluate(facts) {
        const insights = [
            this.createRainArrivingInsight(facts),
            this.createHotAfternoonInsight(facts)
        ].filter(Boolean);

        window.mosaicApp.eventBus.publish({
            type: "weather-insights",
            source: "weather",
            payload: {
                status: facts?.status === "available"
                    ? "available"
                    : "unavailable",
                insights
            }
        });
    }

    createRainArrivingInsight(facts) {
        if (
            facts?.status !== "available" ||
            !facts.today?.date ||
            !Array.isArray(facts.hourly)
        ) {
            return null;
        }

        const now = Date.now();
        const oneHour = 60 * 60 * 1000;
        const todayHours = facts.hourly
            .map((hour) => ({
                ...hour,
                timestamp: Date.parse(hour.at)
            }))
            .filter((hour) =>
                Number.isFinite(hour.timestamp) &&
                hour.at.startsWith(facts.today.date) &&
                hour.precipitationChance != null
            )
            .sort((first, second) =>
                first.timestamp - second.timestamp
            );
        const currentHour = todayHours
            .filter((hour) => hour.timestamp <= now)
            .at(-1);

        if (
            !currentHour ||
            currentHour.precipitationChance >= 30
        ) {
            return null;
        }

        const firstRainIndex = todayHours.findIndex(
            (hour) =>
                hour.timestamp - now >= oneHour &&
                hour.precipitationChance >= 60
        );

        if (firstRainIndex === -1) {
            return null;
        }

        const firstRainHour = todayHours[firstRainIndex];
        let lastRainHour = firstRainHour;

        for (
            let index = firstRainIndex + 1;
            index < todayHours.length;
            index++
        ) {
            const hour = todayHours[index];
            const isNextHour =
                hour.timestamp - lastRainHour.timestamp === oneHour;

            if (
                !isNextHour ||
                hour.precipitationChance < 40
            ) {
                break;
            }

            lastRainHour = hour;
        }

        const endOfDay = Date.parse(
            `${facts.today.date}T23:59:59`
        );
        const expiresAt = new Date(
            Math.min(
                lastRainHour.timestamp + oneHour,
                endOfDay
            )
        ).toISOString();
        const rainTime = new Intl.DateTimeFormat(
            "en-US",
            {
                hour: "numeric",
                minute: "2-digit",
                timeZone: facts.location?.timezone
            }
        ).format(new Date(firstRainHour.timestamp));

        return {
            id: `weather:rain-arriving:${facts.today.date}`,
            source: "weather",
            type: "weather.rain-arriving",
            priority: 70,
            emphasis: "significant",
            headline: "Rain arriving later today",
            summary:
                `Rain chances increase to about ` +
                `${firstRainHour.precipitationChance}% ` +
                `around ${rainTime}.`,
            createdAt: new Date(now).toISOString(),
            expiresAt
        };
    }

    createHotAfternoonInsight(facts) {
        if (
            facts?.status !== "available" ||
            facts.current?.temperature == null ||
            !facts.today?.date ||
            !Array.isArray(facts.hourly)
        ) {
            return null;
        }

        const now = Date.now();
        const remainingHours = facts.hourly
            .map((hour) => ({
                ...hour,
                timestamp: Date.parse(hour.at)
            }))
            .filter((hour) =>
                Number.isFinite(hour.timestamp) &&
                hour.timestamp > now
            );

        if (remainingHours.length === 0) {
            return null;
        }

        const peak = remainingHours.reduce(
            (highest, hour) =>
                hour.temperature > highest.temperature
                    ? hour
                    : highest
        );
        const oneHour = 60 * 60 * 1000;
        const reachesHotThreshold =
            peak.temperature >= 85;
        const warmsSignificantly =
            peak.temperature -
                facts.current.temperature >= 10;
        const peakIsFarEnoughAhead =
            peak.timestamp - now >= oneHour;

        if (
            !reachesHotThreshold ||
            !warmsSignificantly ||
            !peakIsFarEnoughAhead
        ) {
            return null;
        }

        const hotHours = remainingHours.filter(
            (hour) =>
                hour.timestamp >= peak.timestamp &&
                hour.temperature >= 85
        );
        const lastHotHour =
            hotHours.at(-1) || peak;
        const endOfDay = Date.parse(
            `${facts.today.date}T23:59:59`
        );
        const expiresAt = new Date(
            Math.min(
                lastHotHour.timestamp + oneHour,
                endOfDay
            )
        ).toISOString();
        const peakTime = new Intl.DateTimeFormat(
            "en-US",
            {
                hour: "numeric",
                minute: "2-digit",
                timeZone: facts.location?.timezone
            }
        ).format(new Date(peak.timestamp));

        return {
            id: `weather:hot-afternoon:${facts.today.date}`,
            source: "weather",
            type: "weather.hot-afternoon",
            priority: 60,
            emphasis: "significant",
            headline: "Hot afternoon ahead",
            summary:
                `It is ${facts.current.temperature}° now, ` +
                `but temperatures will reach about ` +
                `${peak.temperature}° around ${peakTime}.`,
            createdAt: new Date(now).toISOString(),
            expiresAt
        };
    }

}
