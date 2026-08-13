class ActiveRendererRegistry {

    constructor() {
        this.renderers = new Map();
    }

    register(payloadType, renderer) {
        if (
            typeof payloadType !== "string" ||
            !payloadType ||
            typeof renderer?.render !== "function"
        ) {
            return;
        }

        this.renderers.set(payloadType, renderer);
    }

    getForPayload(payload) {
        if (!payload || typeof payload.type !== "string") {
            return null;
        }

        return this.renderers.get(payload.type) || null;
    }

}

window.mosaicActiveRendererRegistry =
    new ActiveRendererRegistry();
