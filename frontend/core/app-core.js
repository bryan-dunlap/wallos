class MosaicApp {

    constructor() {
        this.eventBus = new MosaicEventBus();
        this.providerManager = new ProviderManager();
    }

}

window.mosaicApp = new MosaicApp();
