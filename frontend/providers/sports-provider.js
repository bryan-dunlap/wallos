class SportsProvider {

    start() {
        this.publishTestEvent();
    }

    publishTestEvent() {
        const event = createMosaicEvent({
            type: "sports",
            title: "Sports Update",
            subtitle: "Mariners game tonight",
            source: "sports",
            payload: {
                sport: "MLB",
                status: {
                    state: "Scheduled",
                    detail: "Scheduled"
                },
                scheduledTime: "7:10 PM",
                awayTeam: {
                    name: "Texas Rangers",
                    abbreviation: "TEX",
                    logo: "https://www.mlbstatic.com/team-logos/140.svg",
                    record: {
                        wins: 60,
                        losses: 50
                    },
                    runs: null,
                    hits: null,
                    errors: null
                },
                homeTeam: {
                    name: "Seattle Mariners",
                    abbreviation: "SEA",
                    logo: "https://www.mlbstatic.com/team-logos/136.svg",
                    record: {
                        wins: 62,
                        losses: 48
                    },
                    runs: null,
                    hits: null,
                    errors: null
                },
                availability: "available"
            }
        });

        window.mosaicApp.eventBus.publish(event);
    }

}
