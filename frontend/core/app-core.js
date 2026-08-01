class MosaicApp {

    constructor() {
        this.eventBus = new MosaicEventBus();
    }

}

window.mosaicApp = new MosaicApp();
