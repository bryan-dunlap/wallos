class WeatherProvider {

    start() {
        this.publishTestEvent();
    }

    publishTestEvent() {
        const event = createMosaicEvent({
            type: "weather",
            title: "Weather Update",
            subtitle: "Clear skies",
            source: "weather",
            payload: {
                location: "Tacoma, WA",
                temperature: 72,
                condition: "Clear skies",
                icon: "sunny",
                high: 78,
                low: 55,
                precipitation: 10,
                status: "available"
            }
        });

        window.mosaicApp.eventBus.publish(event);
    }

}
