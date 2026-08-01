class LayoutManager {

    constructor(widgetManager) {
        this.widgetManager = widgetManager;
    }

    mount(slot, widgetName) {
        const widget =
            this.widgetManager.get(widgetName);

        if (!widget) return;

        widget.mount(slot);
    }

}
