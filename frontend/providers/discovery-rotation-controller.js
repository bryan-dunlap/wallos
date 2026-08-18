const DISCOVERY_ROTATION_INTERVAL_MS = 15 * 1000;

class DiscoveryRotationController {

    constructor() {
        this.items = [];
        this.currentItemIndex = 0;
        this.rotationTimer = null;
        this.unsubscribe = null;
        this.started = false;
        this.handlePageHide = () => this.stop();
    }

    start() {
        if (this.started) return;

        this.started = true;
        this.unsubscribe = window.mosaicApp.eventBus.subscribe(
            "discovery-items",
            (event) => this.receiveItems(event.payload)
        );
        window.addEventListener(
            "pagehide",
            this.handlePageHide
        );
    }

    stop() {
        if (!this.started) return;

        this.started = false;
        this.stopRotation();

        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        window.removeEventListener(
            "pagehide",
            this.handlePageHide
        );
    }

    receiveItems(payload) {
        if (
            payload?.status !== "available" ||
            !Array.isArray(payload.items) ||
            payload.items.length === 0
        ) {
            if (this.items.length === 0) {
                this.publishUnavailable();
            }
            return;
        }

        const currentItemId = this.items[this.currentItemIndex]?.id;

        this.items = payload.items.map((item) => ({ ...item }));
        this.currentItemIndex = Math.max(
            0,
            this.items.findIndex((item) => item.id === currentItemId)
        );

        this.publishCurrentItem();
        this.startRotation();
    }

    startRotation() {
        this.stopRotation();

        if (!this.started || this.items.length === 0) return;

        this.rotationTimer = setInterval(() => {
            this.currentItemIndex =
                (this.currentItemIndex + 1) % this.items.length;
            this.publishCurrentItem();
        }, DISCOVERY_ROTATION_INTERVAL_MS);
    }

    stopRotation() {
        if (!this.rotationTimer) return;

        clearInterval(this.rotationTimer);
        this.rotationTimer = null;
    }

    publishCurrentItem() {
        const item = this.items[this.currentItemIndex];

        if (!item) return;

        window.mosaicApp.eventBus.publish({
            type: "discovery-display",
            source: "discovery",
            payload: {
                status: "available",
                item: { ...item },
                position: {
                    index: this.currentItemIndex + 1,
                    total: this.items.length
                }
            }
        });
    }

    publishUnavailable() {
        window.mosaicApp.eventBus.publish({
            type: "discovery-display",
            source: "discovery",
            payload: {
                status: "unavailable",
                item: null,
                position: null
            }
        });
    }

}

