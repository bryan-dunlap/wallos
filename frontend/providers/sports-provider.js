class SportsProvider {

    start() {
        this.publishTestEvent();
    }

    publishTestEvent() {
        const event = createMosaicEvent({
            type: "sports",
            title: "Sports Update",
            subtitle: "Mariners game tonight",
            source: "sports"
        });

        window.mosaicApp.eventBus.publish(event);
    }

}
