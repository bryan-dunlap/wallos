class WeatherProvider {

    start() {
        this.publishTestEvent();
    }

    publishTestEvent() {
        const event = createMosaicEvent({
            type: "weather",
            title: "Weather Update",
            subtitle: "Clear skies",
            source: "weather"
        });

        window.mosaicApp.eventBus.publish(event);
    }

}
