class HeroCoordinator {

    constructor(eventBus) {
        this.eventBus = eventBus;
        this.activeCandidates = new Map();
        this.defaultCandidate = {
            id: "default:daily-briefing",
            source: "daily-summary",
            type: "default",
            priority: 0,
            headline: "Daily Briefing",
            summary: ""
        };
        this.expirationTimer = null;

        this.eventBus.subscribe(
            "hero-candidate",
            (event) => this.receiveCandidate(
                event.payload?.candidate
            )
        );
        this.eventBus.subscribe(
            "hero-candidate-withdraw",
            (event) => this.withdrawCandidate(
                event.payload?.id
            )
        );
        this.eventBus.subscribe(
            "default",
            (event) => this.receiveDefault(event)
        );
    }

    start() {
        this.publishDisplay(this.defaultCandidate);
    }

    receiveCandidate(candidate) {
        if (!this.isCandidateActive(candidate)) {
            return;
        }

        this.activeCandidates.set(candidate.id, candidate);
        this.selectDisplay();
    }

    withdrawCandidate(id) {
        if (!this.activeCandidates.delete(id)) {
            return;
        }

        this.selectDisplay();
    }

    receiveDefault(event) {
        this.defaultCandidate = {
            id: "default:daily-briefing",
            source: event.source || "daily-summary",
            type: "default",
            priority: 0,
            headline: event.title || "Daily Briefing",
            summary: event.subtitle || ""
        };

        if (this.activeCandidates.size === 0) {
            this.publishDisplay(this.defaultCandidate);
        }
    }

    isCandidateActive(candidate) {
        return Boolean(
            candidate?.id &&
            Number.isFinite(candidate.priority) &&
            Date.parse(candidate.expiresAt) > Date.now()
        );
    }

    selectDisplay() {
        this.removeExpiredCandidates();

        const selected = [...this.activeCandidates.values()]
            .sort((first, second) =>
                second.priority - first.priority
            )[0] || this.defaultCandidate;

        this.publishDisplay(selected);
        this.scheduleNextExpiration();
    }

    removeExpiredCandidates() {
        const now = Date.now();

        this.activeCandidates.forEach((candidate, id) => {
            if (Date.parse(candidate.expiresAt) <= now) {
                this.activeCandidates.delete(id);
            }
        });
    }

    scheduleNextExpiration() {
        if (this.expirationTimer) {
            clearTimeout(this.expirationTimer);
            this.expirationTimer = null;
        }

        const nextExpiration = [...this.activeCandidates.values()]
            .map((candidate) => Date.parse(candidate.expiresAt))
            .filter(Number.isFinite)
            .sort((first, second) => first - second)[0];

        if (!nextExpiration) return;

        const maximumDelay = 2 ** 31 - 1;
        const delay = Math.min(
            Math.max(nextExpiration - Date.now(), 0),
            maximumDelay
        );

        this.expirationTimer = setTimeout(
            () => this.selectDisplay(),
            delay
        );
    }

    publishDisplay(candidate) {
        this.eventBus.publish({
            type: "hero-display",
            source: "hero-coordinator",
            payload: {
                candidate
            }
        });
    }

}
