class NormalWidgetCompositionCoordinator {

    constructor(options = {}) {
        this.widgetManager = options.widgetManager;
        this.host = options.host || null;
        this.slots = Array.from(options.slots || []);
        this.document = options.document || document;
        this.loadConfig = options.loadConfig || (() =>
            fetch("/api/config").then((response) => {
                if (!response.ok) {
                    throw new Error(
                        `Config request failed: ${response.status}`
                    );
                }

                return response.json();
            })
        );
        this.scheduleTimeout = options.setTimeout ||
            ((callback, delay) => setTimeout(callback, delay));
        this.cancelTimeout = options.clearTimeout ||
            ((timer) => clearTimeout(timer));
        const policy = typeof require === "function"
            ? require("./normal-widget-composition-policy")
            : null;
        this.compose = options.compose ||
            policy?.composeNormalWidgets || composeNormalWidgets;
        this.reconcile = options.reconcile ||
            policy?.reconcileNormalWidgetComposition ||
            reconcileNormalWidgetComposition;
        this.composition = null;
        this.rotationSeconds = 15;
        this.rotationTimer = null;
        this.lifecycleGeneration = 0;
        this.mounts = new Map();
        this.widgets = new Map();
        this.started = false;
        this.handleVisibilityChange = () => this.onVisibilityChange();
    }

    async start() {
        if (this.started) return;

        this.started = true;
        this.document.addEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );

        try {
            this.applyConfiguration(await this.loadConfig());
        } catch (error) {
            console.error(
                "Unable to load normal widget composition:",
                error
            );
            this.applyConfiguration({ normalWidgets: {} });
        }
    }

    stop() {
        this.started = false;
        this.invalidateRotation();
        this.document.removeEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );
    }

    applyConfiguration(config = {}) {
        this.invalidateRotation();

        const normalWidgets = config.normalWidgets || {};
        const order = Array.isArray(normalWidgets.order)
            ? normalWidgets.order
            : [];
        const enabledIds = order.filter((id) =>
            config[id]?.enabled !== false &&
            config[id]?.widget?.enabled !== false
        );

        this.rotationSeconds = Number.isFinite(
            normalWidgets.rotationSeconds
        )
            ? normalWidgets.rotationSeconds
            : 15;

        enabledIds.forEach((id) => this.ensureWidget(id));

        const input = {
            mode: normalWidgets.mode,
            orderedEnabledWidgetIds: enabledIds
        };

        this.composition = this.composition
            ? this.reconcile(this.composition, input)
            : this.compose(input);

        this.renderComposition();
        this.scheduleRotation();
    }

    ensureWidget(id) {
        if (this.widgets.has(id)) return this.widgets.get(id);

        const widget = this.widgetManager.create(id);

        if (!widget) return null;

        const mount = this.document.createElement("section");
        mount.className =
            `widget small normal-widget-mount ${id}-widget`;
        mount.dataset.normalWidgetId = id;
        mount.hidden = true;
        this.host.append(mount);
        widget.mount(mount);
        this.widgets.set(id, widget);
        this.mounts.set(id, mount);

        return widget;
    }

    renderComposition() {
        const density = this.composition?.density || "neutral";
        const visibleIds = this.composition?.visibleIds || [];

        this.mounts.forEach((mount) => {
            mount.hidden = true;
            mount.classList.remove(
                "normal-widget-mount--primary",
                "normal-widget-mount--secondary",
                "normal-widget-mount--expanded"
            );
        });

        this.slots.forEach((slot, index) => {
            const id = visibleIds[index];
            const isVisible = Boolean(id && this.mounts.has(id));
            const surface = slot.querySelector(
                ".normal-widget-surface"
            );

            slot.hidden = !isVisible;
            if (surface) surface.hidden = !isVisible;
            slot.classList.toggle(
                "normal-widget-slot--expanded",
                isVisible && density === "expanded"
            );
            slot.dataset.normalWidgetDensity = density;

            if (!isVisible) return;

            const mount = this.mounts.get(id);
            const position = index === 0 ? "primary" : "secondary";
            mount.dataset.normalWidgetDensity = density;
            mount.hidden = false;
            mount.classList.add(
                `normal-widget-mount--${density === "expanded"
                    ? "expanded"
                    : position}`
            );

            const widget = this.widgets.get(id);

            if (typeof widget?.setPresentationContext === "function") {
                widget.setPresentationContext({ density });
            }
        });

        if (this.host) {
            this.host.dataset.normalWidgetDensity = density;
        }
    }

    scheduleRotation() {
        if (
            !this.started ||
            this.document.hidden ||
            !this.composition?.rotationRequired
        ) {
            return;
        }

        const generation = this.lifecycleGeneration;

        this.rotationTimer = this.scheduleTimeout(() => {
            if (
                generation !== this.lifecycleGeneration ||
                this.document.hidden
            ) {
                return;
            }

            this.rotationTimer = null;
            this.composition = this.compose({
                mode: this.composition.mode,
                orderedEnabledWidgetIds: this.composition.enabledIds,
                currentIndex: this.composition.nextIndex
            });
            this.renderComposition();
            this.scheduleRotation();
        }, this.rotationSeconds * 1000);
    }

    invalidateRotation() {
        this.lifecycleGeneration += 1;

        if (this.rotationTimer !== null) {
            this.cancelTimeout(this.rotationTimer);
            this.rotationTimer = null;
        }
    }

    onVisibilityChange() {
        this.invalidateRotation();

        if (!this.document.hidden) {
            this.renderComposition();
            this.scheduleRotation();
        }
    }
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { NormalWidgetCompositionCoordinator };
}
