class DiscoveryWidget {

    constructor() {
        this.element = null;
        this.unsubscribe = null;
        this.failedImageItemIds = new Set();
        this.renderers = new Map([
            ["text", (item, position) =>
                this.renderTextItem(item, position)],
            ["image", (item, position) =>
                this.renderImageItem(item, position)]
        ]);
        this.state = {
            status: "loading",
            item: null,
            position: null
        };
    }

    mount(element) {
        this.unmount();
        this.element = element;
        this.unsubscribe = window.mosaicApp.eventBus.subscribe(
            "discovery-display",
            (event) => this.showItem(event.payload)
        );
        this.render();
    }

    unmount() {
        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        this.element = null;
    }

    showItem(payload) {
        this.state = payload || {
            status: "unavailable",
            item: null,
            position: null
        };
        this.render();
    }

    render() {
        if (!this.element) return;

        if (
            this.state.status === "available" &&
            this.state.item
        ) {
            this.element.innerHTML = this.renderItem(
                this.state.item,
                this.state.position
            );
            this.bindImageFallback();
            return;
        }

        this.element.innerHTML = this.state.status === "loading"
            ? this.renderStatus("Loading Reddit", "Fetching top posts…")
            : this.renderStatus(
                "Reddit unavailable",
                "The feed could not be loaded."
            );
    }

    renderItem(item, position) {
        const renderer = this.failedImageItemIds.has(item.id)
            ? this.renderers.get("text")
            : this.renderers.get(item.type) ||
                this.renderers.get("text");

        return renderer(item, position);
    }

    renderTextItem(item, position) {
        const hasBody = Boolean(item.body);

        return `
            <div class="discovery-feed discovery-feed-text">
                <article class="discovery-item discovery-item-text${
                    hasBody ? " discovery-item-text-has-body" : ""
                }">
                    ${this.renderSource(item.eyebrow)}

                    <div class="discovery-headline discovery-text-headline">
                        ${this.escape(item.title)}
                    </div>

                    ${this.renderBody(item.body, "discovery-text-body")}

                    ${this.renderPosition(position)}
                </article>
            </div>
        `;
    }

    renderImageItem(item, position) {
        if (!item.media?.url) {
            return this.renderTextItem(item, position);
        }

        return `
            <div class="discovery-feed discovery-feed-image">
                <article class="discovery-item discovery-item-image">
                    <div class="discovery-media">
                        <img
                            class="discovery-media-image"
                            src="${this.escape(item.media.url)}"
                            alt="${this.escape(item.media.alt || item.title)}"
                        >
                    </div>

                    <div class="discovery-image-caption">
                        ${this.renderSource(item.eyebrow)}

                        <div class="discovery-headline discovery-image-headline">
                            ${this.escape(item.title)}
                        </div>

                        ${this.renderBody(item.body, "discovery-image-body")}

                        ${this.renderPosition(position)}
                    </div>
                </article>
            </div>
        `;
    }

    renderSource(eyebrow) {
        if (!eyebrow) return "";

        return `
            <div class="discovery-source">
                ${this.escape(eyebrow)}
            </div>
        `;
    }

    renderBody(body, className) {
        if (!body) return "";

        return `
            <div class="discovery-body ${className}">
                ${this.escape(body)}
            </div>
        `;
    }

    renderPosition(position) {
        const current = Number.isInteger(position?.index)
            ? position.index
            : 1;
        const total = Number.isInteger(position?.total)
            ? position.total
            : 1;

        return `
            <div class="discovery-position">
                ${current} / ${total}
            </div>
        `;
    }

    bindImageFallback() {
        const image = this.element?.querySelector(
            ".discovery-media-image"
        );

        if (!image) return;

        const itemId = this.state.item?.id;

        image.addEventListener("error", () => {
            if (!itemId || this.state.item?.id !== itemId) return;

            this.failedImageItemIds.add(itemId);
            this.render();
        }, { once: true });
    }

    renderStatus(eyebrow, title) {
        return `
            <div class="discovery-feed">
                <div class="discovery-item">
                    <div class="discovery-source">
                        ${this.escape(eyebrow)}
                    </div>

                    <div class="discovery-headline">
                        ${this.escape(title)}
                    </div>
                </div>
            </div>
        `;
    }

    escape(value = "") {
        return String(value).replace(/[&<>"']/g, (character) => ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#039;"
        })[character]);
    }

}
