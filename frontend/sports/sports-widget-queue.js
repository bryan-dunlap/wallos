const validateNormalizedSportsEvent =
    typeof isNormalizedSportsEvent === "function"
        ? isNormalizedSportsEvent
        : require("./sports-event-contract").isNormalizedSportsEvent;

class SportsWidgetQueue {

    constructor() {
        this.items = [];
        this.currentIndex = 0;
    }

    replace(items) {
        this.items = Array.isArray(items)
            ? items.filter((item) => validateNormalizedSportsEvent(item))
            : [];
        this.currentIndex = 0;

        return this.current();
    }

    clear() {
        this.items = [];
        this.currentIndex = 0;
    }

    current() {
        return this.items[this.currentIndex] || null;
    }

    next() {
        if (this.items.length === 0) return null;

        this.currentIndex =
            (this.currentIndex + 1) % this.items.length;

        return this.current();
    }

    size() {
        return this.items.length;
    }

}

if (typeof module !== "undefined" && module.exports) {
    module.exports = { SportsWidgetQueue };
}
