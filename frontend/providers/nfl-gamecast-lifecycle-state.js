class NflGamecastLifecycleState {

    constructor() {
        this.presentedFinalEvents = new Map();
    }

    markFinalPresented(favoriteTeamId, eventId) {
        if (!favoriteTeamId || eventId === null || eventId === undefined) {
            return;
        }

        this.presentedFinalEvents.set(
            favoriteTeamId,
            String(eventId)
        );
    }

    wasFinalPresented(favoriteTeamId, eventId) {
        if (!favoriteTeamId || eventId === null || eventId === undefined) {
            return false;
        }

        return this.presentedFinalEvents.get(favoriteTeamId) ===
            String(eventId);
    }

}

const nflGamecastLifecycleState = new NflGamecastLifecycleState();

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        NflGamecastLifecycleState,
        nflGamecastLifecycleState
    };
}
