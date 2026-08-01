class CalendarProvider {

    start() {
        this.publishTestEvent();
    }

    publishTestEvent() {
        const event = createMosaicEvent({
            type: "calendar",
            title: "Calendar Event",
            subtitle: "Test event",
            source: "calendar"
        });

        window.mosaicApp.eventBus.publish(event);
    }

}
