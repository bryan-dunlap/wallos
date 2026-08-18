const DISCOVERY_REFRESH_INTERVAL_MS = 15 * 60 * 1000;

/*
 * Provider-neutral Discovery items require only id, type, and source.
 * Presentation fields are optional. Backend source adapters publish only
 * normalized presentation data; source configuration and raw responses never
 * cross into the browser-side Discovery lifecycle.
 */

class DiscoveryProvider {

    constructor() {
        this.refreshTimer = null;
        this.refreshInFlight = null;
        this.lastKnownGoodItems = [];
        this.started = false;
        this.lifecycleVersion = 0;
        this.handlePageHide = () => this.stop();
    }

    start() {
        if (this.started) return;

        this.started = true;
        this.lifecycleVersion += 1;
        window.addEventListener(
            "pagehide",
            this.handlePageHide
        );

        this.refresh();
        this.refreshTimer = setInterval(
            () => this.refresh(),
            DISCOVERY_REFRESH_INTERVAL_MS
        );
    }

    stop() {
        if (!this.started) return;

        this.started = false;
        this.lifecycleVersion += 1;

        if (this.refreshTimer) {
            clearInterval(this.refreshTimer);
            this.refreshTimer = null;
        }

        window.removeEventListener(
            "pagehide",
            this.handlePageHide
        );
    }

    refresh() {
        if (this.refreshInFlight) return this.refreshInFlight;

        const lifecycleVersion = this.lifecycleVersion;

        this.refreshInFlight = this.fetchItems(lifecycleVersion)
            .finally(() => {
                this.refreshInFlight = null;
            });

        return this.refreshInFlight;
    }

    async fetchItems(lifecycleVersion) {
        try {
            const response = await fetch("/api/discovery");

            if (!response.ok) {
                throw new Error(
                    `Discovery request failed: ${response.status}`
                );
            }

            const data = await response.json();
            const items = this.normalizeItems(data.items);

            if (data.status === "disabled") {
                this.lastKnownGoodItems = [];
                this.publishUnavailable();
                return;
            }

            if (items.length === 0) {
                throw new Error("No Discovery items were returned.");
            }

            if (
                !this.started ||
                lifecycleVersion !== this.lifecycleVersion
            ) {
                return;
            }

            this.lastKnownGoodItems = items;
            this.publishItems(items);
        } catch (error) {
            console.error("Unable to load Discovery content:", error);

            if (
                !this.started ||
                lifecycleVersion !== this.lifecycleVersion ||
                this.lastKnownGoodItems.length > 0
            ) {
                return;
            }

            this.publishUnavailable();
        }
    }

    normalizeItems(configuredItems) {
        if (!Array.isArray(configuredItems)) return [];

        return configuredItems.reduce((items, configuredItem) => {
            const id = this.normalizeText(configuredItem?.id);
            const type = ["text", "image"].includes(configuredItem?.type)
                ? configuredItem.type
                : "text";
            const source = this.normalizeText(configuredItem?.source);
            const eyebrow = this.normalizeText(configuredItem?.eyebrow);
            const title = this.normalizeText(configuredItem?.title);
            const body = this.normalizeText(configuredItem?.body);
            const imageUrl = type === "image"
                ? this.normalizeImageUrl(configuredItem?.media?.url)
                : "";

            if (!id || !source || !eyebrow || !title) return items;

            items.push({
                id,
                type: imageUrl ? "image" : "text",
                source,
                eyebrow,
                title,
                ...(body ? { body } : {}),
                ...(imageUrl ? {
                    media: {
                        url: imageUrl,
                        alt: this.normalizeText(
                            configuredItem?.media?.alt
                        ) || title
                    }
                } : {})
            });

            return items;
        }, []);
    }

    normalizeText(value) {
        return typeof value === "string" && value.trim()
            ? value.trim()
            : "";
    }

    normalizeImageUrl(value) {
        const imageUrl = this.normalizeText(value);

        if (!imageUrl) return "";

        try {
            const parsedUrl = new URL(imageUrl);

            return parsedUrl.protocol === "https:" ||
                parsedUrl.protocol === "http:"
                ? parsedUrl.href
                : "";
        } catch {
            return "";
        }
    }

    publishItems(items) {
        window.mosaicApp.eventBus.publish({
            type: "discovery-items",
            source: "discovery",
            payload: {
                status: "available",
                items
            }
        });
    }

    publishUnavailable() {
        window.mosaicApp.eventBus.publish({
            type: "discovery-items",
            source: "discovery",
            payload: {
                status: "unavailable",
                items: []
            }
        });
    }

}
