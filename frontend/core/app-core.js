class MosaicApp {

    constructor() {
        this.eventBus = new MosaicEventBus();
        this.providerManager = new ProviderManager();
        this.providerRegistry = new ProviderRegistry();
    }

    start() {
        registerMosaicProviders(this.providerRegistry);
        this.providerManager.loadFromRegistry(
            this.providerRegistry
        );
        this.providerManager.start();
    }

}

window.mosaicApp = new MosaicApp();
