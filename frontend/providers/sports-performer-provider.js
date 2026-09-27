class SportsPerformerProvider {
    constructor() {
        this.unsubscribe = null;
        this.requests = new Map();
    }

    start() {
        this.stop();
        this.unsubscribe = window.mosaicApp.eventBus.subscribe(
            "sports-feature-request",
            (event) => this.handleRequest(event.payload)
        );
    }

    stop() {
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = null;
    }

    handleRequest(request = {}) {
        const eventId = String(request.eventId || "");
        const status = request.status;
        if (request.league !== "MLB" || !["live", "final"].includes(status)) {
            this.publish(eventId, null);
            return Promise.resolve(null);
        }
        const key = `${eventId}:${status}`;
        if (this.requests.has(key)) return this.requests.get(key);
        const pending = fetch(
            "/api/sports/mlb/performers?" + new URLSearchParams({
                eventId,
                status,
                date: request.date || "",
                awayTeamId: request.awayTeamId ?? "",
                homeTeamId: request.homeTeamId ?? ""
            })
        )
            .then((response) => response.ok ? response.json() : null)
            .catch(() => null)
            .then((summary) => {
                this.publish(eventId, summary);
                return summary;
            })
            .finally(() => this.requests.delete(key));
        this.requests.set(key, pending);
        return pending;
    }

    publish(eventId, featuredPerformers) {
        window.mosaicApp.eventBus.publish({
            type: "sports-featured-performers",
            source: "sports-performer",
            payload: { eventId, featuredPerformers }
        });
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { SportsPerformerProvider };
}
