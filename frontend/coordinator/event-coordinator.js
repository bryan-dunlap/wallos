class EventCoordinator {

    constructor(eventBus) {
        this.eventBus = eventBus;
        this.subscribers = new Map();
        this.activeEvents = new Map();
        this.currentDisplay = null;

        [
            "default",
            "weather",
            "sports",
            "calendar"
        ].forEach((type) => {
            this.eventBus.subscribe(
                type,
                (event) => this.forward(event)
            );
        });
    }

    subscribe(type, callback) {
        if (!this.subscribers.has(type)) {
            this.subscribers.set(type, new Set());
        }

        this.subscribers.get(type).add(callback);

        return () => {
            const callbacks = this.subscribers.get(type);

            if (!callbacks) return;

            callbacks.delete(callback);

            if (callbacks.size === 0) {
                this.subscribers.delete(type);
            }
        };
    }

    getActiveEvents() {
        return this.activeEvents;
    }

    getCurrentDisplay() {
        return this.currentDisplay;
    }

    forward(event) {
        this.activeEvents.set(
            event.type,
            event
        );

        const callbacks =
            this.subscribers.get(event.type);

        if (!callbacks) return;

        callbacks.forEach((callback) => callback(event));
    }

}
