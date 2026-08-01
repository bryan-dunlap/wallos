class ProviderManager {

    constructor() {
        this.providers = [];
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
