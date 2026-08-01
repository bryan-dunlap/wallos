class ProviderManager {

    constructor() {
        this.providers = [];
    }

    loadFromRegistry(registry) {
        registry.providers.forEach((Provider) => {
            this.register(new Provider());
        });
    }

    register(provider) {
        this.providers.push(provider);
    }

    start() {
        this.providers.forEach((provider) => {
            if (typeof provider.start === "function") {
                provider.start();
            }
        });
    }

}
