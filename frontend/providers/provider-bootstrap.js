function registerMosaicProviders(registry) {
    registry.register(
        "discovery-rotation",
        DiscoveryRotationController
    );

    registry.register(
        "discovery",
        DiscoveryProvider
    );

    registry.register(
        "daily-snapshot",
        DailySnapshotGenerator
    );

    // Temporary provider for manually testing Hero context modes.
    registry.register(
        "demo-context",
        DemoContextProvider
    );

    registry.register(
        "calendar-reminders",
        CalendarReminderGenerator
    );

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
        "mlb-gamecast",
        MlbGamecastProvider
    );

    registry.register(
        "nfl-gamecast",
        NflGamecastProvider
    );

    registry.register(
        "sports-active-context",
        SportsActiveContextGenerator
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
