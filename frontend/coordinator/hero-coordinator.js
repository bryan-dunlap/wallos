class HeroCoordinator {

    /*
     * Providers publish facts. Context generators interpret those facts
     * into candidates. This coordinator manages generic attention modes;
     * the Hero widget only displays the context selected here.
     */

    constructor(eventBus) {
        this.eventBus = eventBus;
        this.activeCandidates = new Map();
        this.defaultCandidate = {
            id: "default:daily-briefing",
            source: "daily-summary",
            type: "default",
            mode: "resting",
            behavior: {
                sticky: false,
                durationSeconds: null
            },
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
        const normalizedCandidate =
            this.normalizeCandidate(candidate);

        if (!this.isCandidateActive(normalizedCandidate)) {
            return;
        }

        this.activeCandidates.set(
            normalizedCandidate.id,
            normalizedCandidate
        );
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
            mode: "resting",
            behavior: {
                sticky: false,
                durationSeconds: null
            },
            priority: 0,
            headline: event.title || "Daily Briefing",
            summary: event.subtitle || ""
        };

        if (this.activeCandidates.size === 0) {
            this.publishDisplay(this.defaultCandidate);
        }
    }

    isCandidateActive(candidate) {
        const expiration = Date.parse(candidate?.expiresAt);

        return Boolean(
            candidate?.id &&
            Number.isFinite(candidate.priority) &&
            (
                expiration > Date.now() ||
                !Number.isFinite(expiration)
            )
        );
    }

    normalizeCandidate(candidate) {
        if (!candidate || typeof candidate !== "object") {
            return candidate;
        }

        const supportedModes = new Set([
            "resting",
            "active",
            "interrupt"
        ]);
        const mode = supportedModes.has(candidate.mode)
            ? candidate.mode
            : "resting";
        const durationSeconds =
            Number.isFinite(candidate.behavior?.durationSeconds) &&
            candidate.behavior.durationSeconds >= 0
                ? candidate.behavior.durationSeconds
                : null;
        const durationStart = Number.isFinite(
            Date.parse(candidate.createdAt)
        )
            ? Date.parse(candidate.createdAt)
            : Date.now();
        const expiresAt = candidate.expiresAt ||
            (durationSeconds == null
                ? null
                : new Date(
                    durationStart + durationSeconds * 1000
                ).toISOString());

        return {
            ...candidate,
            mode,
            expiresAt,
            behavior: {
                sticky: candidate.behavior?.sticky === true,
                durationSeconds
            }
        };
    }

    selectDisplay() {
        this.removeExpiredCandidates();

        const selected = [...this.activeCandidates.values()]
            .sort((first, second) => {
                const modeDifference =
                    this.getModeRank(second.mode) -
                    this.getModeRank(first.mode);

                return modeDifference ||
                    second.priority - first.priority;
            })[0] || this.defaultCandidate;

        this.publishDisplay(selected);
        this.scheduleNextExpiration();
    }

    getModeRank(mode) {
        return {
            resting: 1,
            active: 2,
            interrupt: 3
        }[mode] || 1;
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
