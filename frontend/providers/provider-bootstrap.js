function registerMosaicProviders(registry) {
    registry.register(
        "calendar",
        CalendarProvider
    );

    registry.register(
        "weather-insights",
        WeatherInsightGenerator
    );

    registry.register(
        "weather",
        WeatherProvider
    );

    registry.register(
        "sports",
        SportsProvider
    );

    registry.register(
        "daily-summary",
        DailySummaryProvider
    );
}
