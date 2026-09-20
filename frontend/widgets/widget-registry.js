class WidgetRegistry {

    constructor() {
        this.widgets = new Map();
    }

    register(name, Widget) {
        this.widgets.set(name, Widget);
    }

    has(name) {
        return this.widgets.has(name);
    }

}
