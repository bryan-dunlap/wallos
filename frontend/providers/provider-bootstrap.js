function registerMosaicProviders(registry) {
    registry.register(
        "calendar",
        CalendarProvider
    );

    registry.register(
        "weather",
        WeatherProvider
    );

    registry.register(
        "sports",
        SportsProvider
    );
}
