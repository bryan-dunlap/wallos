const GAMECAST_PRIMARY_WINDOW_MS = 4 * 60 * 1000;
const GAMECAST_SECONDARY_WINDOW_MS = 60 * 1000;

class GamecastOwnershipCoordinator {

    constructor(eventBus, options = {}) {
        this.eventBus = eventBus;
        this.primaryWindowMs = options.primaryWindowMs ??
            GAMECAST_PRIMARY_WINDOW_MS;
        this.secondaryWindowMs = options.secondaryWindowMs ??
            GAMECAST_SECONDARY_WINDOW_MS;
        this.setTimer = options.setTimer ||
            ((callback, delay) => globalThis.setTimeout(callback, delay));
        this.clearTimer = options.clearTimer ||
            ((timer) => globalThis.clearTimeout(timer));
        this.now = options.now || Date.now;
        this.candidateEventType = options.candidateEventType ||
            "gamecast-ownership-candidate";
        this.withdrawEventType = options.withdrawEventType ||
            "gamecast-ownership-withdraw";
        this.stateEventType = options.stateEventType || null;
        this.allowSimulation = options.allowSimulation === true;
        this.candidates = new Map();
        this.ownedCandidateId = null;
        this.primaryCandidateId = null;
        this.secondaryCandidateId = null;
        this.window = null;
        this.timer = null;
        this.timerGeneration = 0;
        this.expiryTimer = null;
        this.expiryTimerGeneration = 0;
        this.unsubscribers = [];
    }

    start() {
        this.stop();
        this.unsubscribers = [
            this.eventBus.subscribe(
                this.candidateEventType,
                (event) => this.receiveCandidate(
                    event.payload?.candidate
                )
            ),
            this.eventBus.subscribe(
                this.withdrawEventType,
                (event) => this.withdrawCandidate(event.payload?.id)
            )
        ];
    }

    stop() {
        this.unsubscribers.forEach((unsubscribe) => unsubscribe());
        this.unsubscribers = [];
        this.cancelTimer();
        this.cancelExpiryTimer();
        if (this.ownedCandidateId) {
            this.publishWithdrawal(this.ownedCandidateId);
        }
        this.candidates.clear();
        this.ownedCandidateId = null;
        this.primaryCandidateId = null;
        this.secondaryCandidateId = null;
        this.window = null;
    }

    receiveCandidate(candidate) {
        if (!this.isEligibleCandidate(candidate)) return false;

        const previousCount = this.candidates.size;
        const previousPrimaryId = this.primaryCandidateId;
        this.candidates.set(candidate.id, candidate);
        this.reconcile({ previousCount, previousPrimaryId });
        return true;
    }

    withdrawCandidate(id) {
        if (typeof id !== "string" || !this.candidates.has(id)) {
            return false;
        }

        const previousCount = this.candidates.size;
        const previousPrimaryId = this.primaryCandidateId;
        this.candidates.delete(id);
        this.reconcile({ previousCount, previousPrimaryId });
        return true;
    }

    isEligibleCandidate(candidate) {
        return Boolean(
            candidate?.id &&
            candidate.source === "sports" &&
            candidate.mode === "active" &&
            (candidate.simulation !== true || this.allowSimulation) &&
            Number.isInteger(
                candidate.gamecastOwnership?.favoriteRank
            ) &&
            typeof candidate.gamecastOwnership?.critical === "boolean" &&
            typeof candidate.gamecastIdentity?.gameId === "string"
        );
    }

    reconcile({ previousCount, previousPrimaryId }) {
        this.removeExpiredCandidates();
        const count = this.candidates.size;

        if (count === 0) {
            this.cancelTimer();
            this.primaryCandidateId = null;
            this.secondaryCandidateId = null;
            this.window = null;
            this.selectOwnedCandidate(null);
            this.scheduleExpiryTimer();
            return;
        }

        const ordered = this.getPriorityOrder();
        const nextPrimaryId = ordered[0].id;

        if (count !== 2) {
            this.cancelTimer();
            this.primaryCandidateId = nextPrimaryId;
            this.secondaryCandidateId = null;
            this.window = "primary";
            this.selectOwnedCandidate(nextPrimaryId);
            this.scheduleExpiryTimer();
            return;
        }

        const nextSecondaryId = ordered[1].id;
        const primaryChanged = previousPrimaryId !== nextPrimaryId;
        const enteredRotation = previousCount !== 2;
        this.primaryCandidateId = nextPrimaryId;
        this.secondaryCandidateId = nextSecondaryId;

        if (primaryChanged || enteredRotation || !this.timer) {
            this.startPrimaryWindow();
            this.scheduleExpiryTimer();
            return;
        }

        this.selectOwnedCandidate(this.ownedCandidateId);
        this.scheduleExpiryTimer();
    }

    getPriorityOrder() {
        const candidates = [...this.candidates.values()];
        const criticalCandidates = candidates.filter(
            (candidate) => candidate.gamecastOwnership.critical
        );
        const useCriticalOverride = criticalCandidates.length === 1;

        return candidates.sort((first, second) => {
            if (useCriticalOverride) {
                const criticalDifference =
                    Number(second.gamecastOwnership.critical) -
                    Number(first.gamecastOwnership.critical);
                if (criticalDifference) return criticalDifference;
            }

            return first.gamecastOwnership.favoriteRank -
                second.gamecastOwnership.favoriteRank ||
                first.id.localeCompare(second.id);
        });
    }

    startPrimaryWindow() {
        this.window = "primary";
        this.selectOwnedCandidate(this.primaryCandidateId);
        this.scheduleWindow(this.primaryWindowMs, "secondary");
    }

    startSecondaryWindow() {
        this.window = "secondary";
        this.selectOwnedCandidate(this.secondaryCandidateId);
        this.scheduleWindow(this.secondaryWindowMs, "primary");
    }

    scheduleWindow(delay, nextWindow) {
        this.cancelTimer();
        const generation = this.timerGeneration;
        this.timer = this.setTimer(() => {
            if (generation !== this.timerGeneration) return;
            this.timer = null;

            if (this.candidates.size !== 2) {
                this.reconcile({
                    previousCount: this.candidates.size,
                    previousPrimaryId: this.primaryCandidateId
                });
                return;
            }

            if (nextWindow === "secondary") {
                this.startSecondaryWindow();
            } else {
                this.startPrimaryWindow();
            }
        }, delay);
    }

    cancelTimer() {
        this.timerGeneration += 1;
        if (this.timer !== null) this.clearTimer(this.timer);
        this.timer = null;
    }

    removeExpiredCandidates() {
        const now = this.now();
        for (const [id, candidate] of this.candidates) {
            const expiresAt = Date.parse(candidate.expiresAt);
            if (Number.isFinite(expiresAt) && expiresAt <= now) {
                this.candidates.delete(id);
            }
        }
    }

    scheduleExpiryTimer() {
        this.cancelExpiryTimer();
        const expirations = [...this.candidates.values()]
            .map((candidate) => Date.parse(candidate.expiresAt))
            .filter(Number.isFinite);
        if (!expirations.length) return;

        const generation = this.expiryTimerGeneration;
        const delay = Math.max(0, Math.min(...expirations) - this.now());
        this.expiryTimer = this.setTimer(() => {
            if (generation !== this.expiryTimerGeneration) return;
            this.expiryTimer = null;
            this.reconcile({
                previousCount: this.candidates.size,
                previousPrimaryId: this.primaryCandidateId
            });
        }, delay);
    }

    cancelExpiryTimer() {
        this.expiryTimerGeneration += 1;
        if (this.expiryTimer !== null) this.clearTimer(this.expiryTimer);
        this.expiryTimer = null;
    }

    selectOwnedCandidate(id) {
        if (id === this.ownedCandidateId) {
            const candidate = id ? this.candidates.get(id) : null;
            if (candidate) this.publishCandidate(candidate);
            this.publishState();
            return;
        }

        const previousId = this.ownedCandidateId;
        this.ownedCandidateId = id;
        if (previousId) this.publishWithdrawal(previousId);

        const candidate = id ? this.candidates.get(id) : null;
        if (candidate) this.publishCandidate(candidate);
        this.publishState();
    }

    publishState() {
        if (!this.stateEventType) return;

        this.eventBus.publish({
            type: this.stateEventType,
            source: "gamecast-ownership",
            payload: {
                primaryCandidateId: this.primaryCandidateId,
                secondaryCandidateId: this.secondaryCandidateId,
                displayedCandidateId: this.ownedCandidateId,
                window: this.window,
                candidates: [...this.candidates.values()].map(
                    (candidate) => ({
                        id: candidate.id,
                        favoriteRank:
                            candidate.gamecastOwnership.favoriteRank,
                        critical:
                            candidate.gamecastOwnership.critical,
                        gameId: candidate.gamecastIdentity.gameId
                    })
                )
            }
        });
    }

    publishCandidate(candidate) {
        this.eventBus.publish({
            type: "hero-candidate",
            source: "gamecast-ownership",
            payload: { candidate }
        });
    }

    publishWithdrawal(id) {
        this.eventBus.publish({
            type: "hero-candidate-withdraw",
            source: "gamecast-ownership",
            payload: { id }
        });
    }

}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        GamecastOwnershipCoordinator,
        GAMECAST_PRIMARY_WINDOW_MS,
        GAMECAST_SECONDARY_WINDOW_MS
    };
}
