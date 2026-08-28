class DiscoveryWidget {

    constructor() {
        this.element = null;
        this.unsubscribe = null;
        this.imageResizeObserver = null;
        this.titleResizeObserver = null;
        this.titleResizeHandler = null;
        this.titleLayoutFrame = null;
        this.titleContainerSizeKey = null;
        this.titleFitCache = new Map();
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
        this.disconnectTitleFitting();

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
        this.disconnectTitleFitting();

        if (
            this.state.status === "available" &&
            this.state.item
        ) {
            this.element.innerHTML = this.renderItem(
                this.state.item,
                this.state.position
            );
            this.bindImageFallback();
            this.bindTitleFitting();
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

    findLargestFittingFontSize(preferredSize, minimumSize, fits) {
        let low = Math.ceil(minimumSize);
        let high = Math.floor(preferredSize);
        let largestFit = low;

        while (low <= high) {
            const candidate = Math.floor((low + high) / 2);

            if (fits(candidate)) {
                largestFit = candidate;
                low = candidate + 1;
            } else {
                high = candidate - 1;
            }
        }

        return largestFit;
    }

    fitTitleToRegion(title) {
        const region = title.parentElement;

        title.style.fontSize = "";
        title.style.maxHeight = "";

        const initialStyle = window.getComputedStyle(title);
        const availableWidth = region?.clientWidth || 0;
        const availableHeight = region?.clientHeight || 0;
        const preferredSize = Number.parseFloat(
            initialStyle.getPropertyValue(
                "--discovery-title-preferred-size"
            )
        );
        const minimumSize = Number.parseFloat(
            initialStyle.getPropertyValue(
                "--discovery-title-minimum-size"
            )
        );

        if (
            !availableWidth ||
            !availableHeight ||
            !Number.isFinite(preferredSize) ||
            !Number.isFinite(minimumSize) ||
            minimumSize <= 0 ||
            preferredSize < minimumSize
        ) {
            return;
        }

        const cacheKey = [
            title.textContent,
            title.className,
            availableWidth,
            availableHeight,
            initialStyle.fontFamily,
            initialStyle.fontWeight,
            initialStyle.letterSpacing,
            preferredSize,
            minimumSize
        ].join("|");
        const measure = (fontSize) => {
            title.style.fontSize = fontSize + "px";
            title.style.maxHeight = "";

            return title.scrollWidth <= availableWidth + 0.5 &&
                title.scrollHeight <= availableHeight + 0.5;
        };
        let result = this.titleFitCache.get(cacheKey);

        if (!result) {
            const fontSize = this.findLargestFittingFontSize(
                preferredSize,
                minimumSize,
                measure
            );
            result = {
                fontSize,
                fits: measure(fontSize)
            };

            if (this.titleFitCache.size >= 100) {
                this.titleFitCache.clear();
            }
            this.titleFitCache.set(cacheKey, result);
        } else {
            title.style.fontSize = result.fontSize + "px";
        }

        if (result.fits) return;

        const fittedStyle = window.getComputedStyle(title);
        const lineHeight = Number.parseFloat(fittedStyle.lineHeight);
        const visibleHeight = this.calculateWholeLineHeight(
            availableHeight,
            lineHeight
        );

        title.style.maxHeight = visibleHeight + "px";
    }

    bindTitleFitting() {
        const titles = Array.from(this.element?.querySelectorAll(
            ".discovery-text-headline, .discovery-image-headline"
        ) || []);

        if (titles.length === 0) return;

        const applyTitleFits = () => {
            this.titleLayoutFrame = null;

            titles.forEach((title) => this.fitTitleToRegion(title));
        };

        const scheduleTitleFits = () => {
            if (this.titleLayoutFrame !== null) return;

            this.titleLayoutFrame = window.requestAnimationFrame(
                applyTitleFits
            );
        };

        scheduleTitleFits();

        const getContainerSizeKey = () => [
            this.element?.clientWidth || 0,
            this.element?.clientHeight || 0
        ].join("x");
        const scheduleForContainerResize = () => {
            const sizeKey = getContainerSizeKey();

            if (sizeKey === this.titleContainerSizeKey) return;

            this.titleContainerSizeKey = sizeKey;
            scheduleTitleFits();
        };

        this.titleContainerSizeKey = getContainerSizeKey();

        if (typeof ResizeObserver === "function") {
            this.titleResizeObserver = new ResizeObserver(
                scheduleForContainerResize
            );
            this.titleResizeObserver.observe(this.element);
        } else {
            this.titleResizeHandler = scheduleForContainerResize;
            window.addEventListener("resize", this.titleResizeHandler);
        }

        const renderedElement = this.element;

        if (document.fonts?.ready) {
            document.fonts.ready.then(() => {
                if (this.element === renderedElement) {
                    this.titleFitCache.clear();
                    scheduleTitleFits();
                }
            });
        }
    }

    disconnectTitleFitting() {
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

        this.titleContainerSizeKey = null;
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
