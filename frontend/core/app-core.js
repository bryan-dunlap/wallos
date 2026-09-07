class MosaicApp {

    constructor() {
        this.eventBus = new MosaicEventBus();
        this.teamPaletteStore = new TeamPaletteStore({
            fetch: window.fetch.bind(window)
        });
        this.gamecastCelebrationCoordinator =
            new GamecastCelebrationCoordinator(this.eventBus, {
                teamPaletteStore: this.teamPaletteStore
            });
        this.gamecastOwnershipCoordinator =
            new GamecastOwnershipCoordinator(this.eventBus);
        this.gamecastOwnershipSimulationCoordinator =
            new GamecastOwnershipCoordinator(this.eventBus, {
                primaryWindowMs: 8 * 1000,
                secondaryWindowMs: 2 * 1000,
                candidateEventType:
                    "gamecast-ownership-simulation-candidate",
                withdrawEventType:
                    "gamecast-ownership-simulation-withdraw",
                stateEventType:
                    "gamecast-ownership-simulation-state",
                allowSimulation: true
            });
        this.eventCoordinator = new EventCoordinator(
            this.eventBus
        );
        this.heroCoordinator = new HeroCoordinator(
            this.eventBus
        );
        this.providerManager = new ProviderManager();
        this.providerRegistry = new ProviderRegistry();
        this.widgetRegistry = new WidgetRegistry();
        this.widgetManager = new WidgetManager(
            this.widgetRegistry
        );
    }

    start() {
        this.gamecastOwnershipCoordinator.start();
        this.gamecastOwnershipSimulationCoordinator.start();
        this.gamecastCelebrationCoordinator.start();
        registerMosaicWidgets(this.widgetRegistry);
        initializeMosaicLayout(this);
        this.heroCoordinator.start();
        registerMosaicProviders(this.providerRegistry);
        this.providerManager.loadFromRegistry(
            this.providerRegistry
        );
        this.providerManager.start();
    }

}

window.mosaicApp = new MosaicApp();
