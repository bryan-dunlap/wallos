class MosaicEventBus {

    constructor() {
        this.subscribers = new Map();
    }

    subscribe(type, callback) {
        if (!this.subscribers.has(type)) {
            this.subscribers.set(type, new Set());
        }

        this.subscribers.get(type).add(callback);

        return () => this.unsubscribe(type, callback);
    }

    unsubscribe(type, callback) {
        const callbacks = this.subscribers.get(type);

        if (!callbacks) return;

        callbacks.delete(callback);

        if (callbacks.size === 0) {
            this.subscribers.delete(type);
        }
    }

    publish(event) {
        const callbacks = this.subscribers.get(event.type);

        if (!callbacks) return;

        callbacks.forEach((callback) => callback(event));
    }

}
window.MosaicEventBus = MosaicEventBus;