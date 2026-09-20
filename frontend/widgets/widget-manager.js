class WidgetManager {

    constructor(registry) {
        this.registry = registry;
        this.widgets = new Map();
    }

    register(name, widget) {
        this.widgets.set(name, widget);
    }

    get(name) {
        return this.widgets.get(name);
    }

    hasRegistration(name) {
        return this.registry?.has(name) === true;
    }

    create(name) {
        const Widget =
            this.registry.widgets.get(name);

        if (!Widget) return;

        const widget = new Widget();

        this.register(name, widget);

        return widget;
    }

    loadFromRegistry(registry) {
        this.registry = registry;
    }

}
