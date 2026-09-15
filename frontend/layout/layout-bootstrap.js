function initializeMosaicLayout(app) {
    const heroSlot = document.querySelector(
        ".hero-container"
    );

    if (!heroSlot) return;

    const hero = app.widgetManager.create(
        "hero"
    );

    hero.mount(heroSlot);

    const normalWidgetAssignments = [
        ["weather", "1"],
        ["sports", "2"]
    ];

    for (const [widgetName, slotId] of normalWidgetAssignments) {
        const slot = document.querySelector(
            `[data-normal-widget-slot="${slotId}"] ` +
            ".normal-widget-mount"
        );

        if (!slot) return;

        const widget = app.widgetManager.create(widgetName);

        widget.mount(slot);
    }

    const discoverySlot = document.querySelector(
        ".discovery-card"
    );

    if (!discoverySlot) return;

    const discovery = app.widgetManager.create(
        "discovery"
    );

    discovery.mount(discoverySlot);
}
