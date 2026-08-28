class DiscoveryWidget {

    constructor() {
        this.element = null;
        this.unsubscribe = null;
        this.imageResizeObserver = null;
        this.titleResizeObserver = null;
        this.titleResizeHandler = null;
        this.titleLayoutFrame = null;
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
        this.disconnectImageResizeObserver();
        this.disconnectTitleLineClipping();

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

        this.disconnectImageResizeObserver();
        this.disconnectTitleLineClipping();

        if (
            this.state.status === "available" &&
            this.state.item
        ) {
            this.element.innerHTML = this.renderItem(
                this.state.item,
                this.state.position
            );
            this.bindImageFallback();
            this.bindTitleLineClipping();
            return;
        }

        this.element.innerHTML = this.state.status === "loading"
            ? this.renderStatus("Loading Discovery", "Fetching sources…")
            : this.renderStatus(
                "Discovery unavailable",
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
        return `
            <div class="discovery-feed discovery-feed-text">
                <article class="discovery-item discovery-item-text">
                    ${this.renderSource(
                        item.eyebrow || item.source || "Discovery"
                    )}

                    <div class="discovery-content discovery-text-content">
                        <div class="discovery-headline discovery-text-headline">
                            ${this.escape(item.title)}
                        </div>

                    </div>

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
                        ${this.renderSource(
                            item.eyebrow || item.source || "Discovery"
                        )}

                        <div class="discovery-content discovery-image-content">
                            <div class="discovery-headline discovery-image-headline">
                                ${this.escape(item.title)}
                            </div>

                        </div>

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

        const sizeImageToVisibleMedia = () => {
            const media = image.parentElement;

            if (
                !media ||
                !media.clientWidth ||
                !media.clientHeight ||
                !image.naturalWidth ||
                !image.naturalHeight
            ) {
                return;
            }

            const mediaRatio = media.clientWidth / media.clientHeight;
            const imageRatio = image.naturalWidth / image.naturalHeight;
            const constrainedByWidth = imageRatio >= mediaRatio;

            image.style.width = constrainedByWidth ? "100%" : "auto";
            image.style.height = constrainedByWidth ? "auto" : "100%";
        };

        if (image.complete) {
            sizeImageToVisibleMedia();
        } else {
            image.addEventListener("load", sizeImageToVisibleMedia, {
                once: true
            });
        }

        if (typeof ResizeObserver === "function") {
            this.imageResizeObserver = new ResizeObserver(
                sizeImageToVisibleMedia
            );
            this.imageResizeObserver.observe(image.parentElement);
        }

        image.addEventListener("error", () => {
            if (!itemId || this.state.item?.id !== itemId) return;

            this.failedImageItemIds.add(itemId);
            this.render();
        }, { once: true });
    }

    disconnectImageResizeObserver() {
        if (!this.imageResizeObserver) return;

        this.imageResizeObserver.disconnect();
        this.imageResizeObserver = null;
    }

    calculateWholeLineHeight(allocatedHeight, lineHeight) {
        if (
            !Number.isFinite(allocatedHeight) ||
            !Number.isFinite(lineHeight) ||
            allocatedHeight <= 0 ||
            lineHeight <= 0
        ) {
            return 0;
        }

        return Math.floor(allocatedHeight / lineHeight) * lineHeight;
    }

    bindTitleLineClipping() {
        const titles = Array.from(this.element?.querySelectorAll(
            ".discovery-text-headline, .discovery-image-headline"
        ) || []);

        if (titles.length === 0) return;

        const applyWholeLineHeights = () => {
            this.titleLayoutFrame = null;

            titles.forEach((title) => {
                title.style.maxHeight = "";

                const allocatedHeight = title.getBoundingClientRect().height;
                const lineHeight = Number.parseFloat(
                    window.getComputedStyle(title).lineHeight
                );

                if (
                    !Number.isFinite(lineHeight) ||
                    title.scrollHeight <= allocatedHeight + 0.5
                ) {
                    return;
                }

                const visibleHeight = this.calculateWholeLineHeight(
                    allocatedHeight,
                    lineHeight
                );
                title.style.maxHeight = visibleHeight + "px";
            });
        };

        const scheduleWholeLineHeights = () => {
            if (this.titleLayoutFrame !== null) return;

            this.titleLayoutFrame = window.requestAnimationFrame(
                applyWholeLineHeights
            );
        };

        scheduleWholeLineHeights();

        if (typeof ResizeObserver === "function") {
            this.titleResizeObserver = new ResizeObserver(
                scheduleWholeLineHeights
            );
            this.titleResizeObserver.observe(this.element);
            titles.forEach((title) => {
                if (title.parentElement) {
                    this.titleResizeObserver.observe(title.parentElement);
                }
            });
        } else {
            this.titleResizeHandler = scheduleWholeLineHeights;
            window.addEventListener("resize", this.titleResizeHandler);
        }

        const renderedElement = this.element;

        if (document.fonts?.ready) {
            document.fonts.ready.then(() => {
                if (this.element === renderedElement) {
                    scheduleWholeLineHeights();
                }
            });
        }
    }

    disconnectTitleLineClipping() {
        if (this.titleResizeObserver) {
            this.titleResizeObserver.disconnect();
            this.titleResizeObserver = null;
        }

        if (this.titleResizeHandler) {
            window.removeEventListener("resize", this.titleResizeHandler);
            this.titleResizeHandler = null;
        }

        if (this.titleLayoutFrame !== null) {
            window.cancelAnimationFrame(this.titleLayoutFrame);
            this.titleLayoutFrame = null;
        }
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
