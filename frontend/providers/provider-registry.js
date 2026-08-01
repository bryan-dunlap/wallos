class ProviderRegistry {

    constructor() {
        this.providers = new Map();
    }

    register(name, Provider) {
        this.providers.set(name, Provider);
    }

}
