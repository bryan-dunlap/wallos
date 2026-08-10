class MosaicApp {

    constructor() {
        this.eventBus = new MosaicEventBus();
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
