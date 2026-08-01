function initializeMosaicLayout(app) {
    const heroSlot = document.querySelector(
        ".hero-container"
    );

    if (!heroSlot) return;

    const hero = app.widgetManager.create(
        "hero"
    );

    hero.mount(heroSlot);
}
