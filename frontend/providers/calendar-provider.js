class CalendarProvider {

    start() {
        this.publishTestEvent();
    }

    publishTestEvent() {
        const event = createMosaicEvent({
            type: "calendar",
            title: "Calendar Event",
            subtitle: "Test event"
        });

        window.mosaicApp.eventBus.publish(event);
    }

}
