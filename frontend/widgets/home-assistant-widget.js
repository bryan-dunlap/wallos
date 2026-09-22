const HOME_ASSISTANT_WIDGET_CAPACITY = Object.freeze({
    compact: 4,
    expanded: 8
});

class HomeAssistantWidget {

    constructor() {
        this.element = null;
        this.unsubscribe = null;
        this.density = "compact";
        this.state = {
            status: "loading",
            stale: false,
            selectedCount: 0,
            rows: []
        };
    }

    mount(element) {
        this.unmount();
        this.element = element;
        this.unsubscribe = window.mosaicApp.eventCoordinator.subscribe(
            "home-assistant",
            (event) => this.showEvent(event)
        );
        this.render();
    }

    unmount() {
        if (this.unsubscribe) this.unsubscribe();
        this.unsubscribe = null;
        this.element = null;
    }

    showEvent(event) {
        this.state = projectHomeAssistantPresentation(event?.payload);
        this.render();
    }

    setPresentationContext(context = {}) {
        const density = context.density === "expanded"
            ? "expanded"
            : "compact";

        if (this.density === density) return;

        this.density = density;
        this.render();
    }

    render() {
        if (!this.element) return;

        this.element.dataset.normalWidgetDensity = this.density;
        this.element.replaceChildren(this.createContent());
    }

    createContent() {
        const root = document.createElement("div");
        root.className = "home-assistant-content";
        root.append(this.createHeader());

        const sourceMessage = getHomeAssistantSourceMessage(
            this.state.status,
            this.state.rows.length
        );

        if (sourceMessage) {
            const empty = document.createElement("div");
            empty.className = "home-assistant-empty";
            empty.textContent = sourceMessage;
            root.append(empty);
            return root;
        }

        const list = document.createElement("div");
        list.className = "home-assistant-status-list";
        const capacity = HOME_ASSISTANT_WIDGET_CAPACITY[this.density];
        const visibleRows = this.state.rows.slice(0, capacity);

        visibleRows.forEach((row) => list.append(
            this.createStatusRow(row)
        ));
        root.append(list);

        const remaining = this.state.rows.length - visibleRows.length;
        if (remaining > 0) {
            const overflow = document.createElement("div");
            overflow.className = "home-assistant-overflow";
            overflow.textContent = `+${remaining} more`;
            root.append(overflow);
        }

        return root;
    }

    createHeader() {
        const header = document.createElement("div");
        header.className = "widget-header";
        const title = document.createElement("div");
        title.className = "widget-title";
        title.textContent = "Home";
        const status = document.createElement("div");
        status.className = "widget-status";
        status.textContent = this.state.stale ? "Last known" : "Status";
        header.append(title, status);
        return header;
    }

    createStatusRow(row) {
        const item = document.createElement("div");
        item.className = "home-assistant-status-row";
        const name = document.createElement("span");
        name.className = "home-assistant-status-name";
        name.textContent = row.name;
        const value = document.createElement("span");
        value.className = "home-assistant-status-value";
        value.textContent = row.value;
        item.append(name, value);
        return item;
    }
}

function getHomeAssistantSourceMessage(status, rowCount) {
    if (status === "loading") return "Loading status";
    if (status === "empty" || (status === "available" && rowCount === 0)) {
        return "Choose what to keep an eye on";
    }
    if (status === "unconfigured") return "Setup needed";
    if (status === "disabled") return "Home status is off";
    if (status !== "available") return "Status unavailable";
    return "";
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        HOME_ASSISTANT_WIDGET_CAPACITY,
        HomeAssistantWidget,
        getHomeAssistantSourceMessage
    };
}
