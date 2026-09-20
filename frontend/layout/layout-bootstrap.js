async function initializeMosaicLayout(app) {
    const heroSlot = document.querySelector(
        ".hero-container"
    );

    if (!heroSlot) return;

    const hero = app.widgetManager.create(
        "hero"
    );

    hero.mount(heroSlot);

    const normalWidgetHost = document.querySelector(
        ".normal-widget-host"
    );
    const normalWidgetSlots = document.querySelectorAll(
        "[data-normal-widget-slot]"
    );

    app.normalWidgetCompositionCoordinator =
        new NormalWidgetCompositionCoordinator({
            widgetManager: app.widgetManager,
            host: normalWidgetHost,
            slots: normalWidgetSlots,
            document
        });
    await app.normalWidgetCompositionCoordinator.start();

    const discoverySlot = document.querySelector(
        ".discovery-card"
    );

    if (!discoverySlot) return;

    const discovery = app.widgetManager.create(
        "discovery"
    );

    discovery.mount(discoverySlot);
}
