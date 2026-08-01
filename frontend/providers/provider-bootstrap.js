function registerMosaicProviders(registry) {
    registry.register(
        "calendar",
        CalendarProvider
    );

    registry.register(
        "weather",
        WeatherProvider
    );
}
