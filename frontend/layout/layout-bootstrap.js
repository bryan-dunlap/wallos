function initializeMosaicLayout(app) {
    const heroSlot = document.querySelector(
        ".hero-container"
    );

    if (!heroSlot) return;

    const hero = app.widgetManager.create(
        "hero"
    );

    hero.mount(heroSlot);

    const weatherSlot = document.querySelector(
        ".weather-widget"
    );

    if (!weatherSlot) return;

    const weather = app.widgetManager.create(
        "weather"
    );

    weather.mount(weatherSlot);

    const sportsSlot = document.querySelector(
        ".sports-widget"
    );

    if (!sportsSlot) return;

    const sports = app.widgetManager.create(
        "sports"
    );

    sports.mount(sportsSlot);

    const discoverySlot = document.querySelector(
        ".discovery-card"
    );

    if (!discoverySlot) return;

    const discovery = app.widgetManager.create(
        "discovery"
    );

    discovery.mount(discoverySlot);
}
