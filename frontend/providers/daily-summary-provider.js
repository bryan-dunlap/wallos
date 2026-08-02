class DailySummaryProvider {

    start() {
        this.publishTestEvent();
    }

    publishTestEvent() {
        const event = createMosaicEvent({
            type: "default",
            title: "Daily Briefing",
            subtitle: "Good morning",
            source: "daily-summary"
        });

        window.mosaicApp.eventBus.publish(event);
    }

}
