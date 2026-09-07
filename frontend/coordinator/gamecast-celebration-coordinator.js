const GAMECAST_CELEBRATION_DURATION_MS = 4000;
const GAMECAST_CELEBRATION_QUEUE_LIMIT = 3;
const GAMECAST_CELEBRATION_QUEUE_MAX_AGE_MS = 10000;

class GamecastCelebrationCoordinator {

    constructor(eventBus, options = {}) {
        this.eventBus = eventBus;
        this.durationMs = options.durationMs ??
            GAMECAST_CELEBRATION_DURATION_MS;
        this.queueLimit = options.queueLimit ??
            GAMECAST_CELEBRATION_QUEUE_LIMIT;
        this.queueMaxAgeMs = options.queueMaxAgeMs ??
            GAMECAST_CELEBRATION_QUEUE_MAX_AGE_MS;
        this.now = options.now || Date.now;
        this.setTimer = options.setTimer || setTimeout;
        this.clearTimer = options.clearTimer || clearTimeout;
        this.unsubscribers = [];
        this.displayedGamecast = null;
        this.active = null;
        this.queue = [];
        this.timer = null;
        this.recentEventIds = new Set();
    }

    start() {
        this.stop();
        this.unsubscribers = [
            this.eventBus.subscribe(
                "gamecast-score-event",
                (event) => this.accept(event.payload)
            ),
            this.eventBus.subscribe(
                "hero-display",
                (event) => this.handleHeroDisplay(
                    event.payload?.candidate
                )
            ),
            this.eventBus.subscribe(
                "sports-simulation-state",
                (event) => {
                    if (event.payload?.active === false) this.clear();
                }
            )
        ];
    }

    stop() {
        this.unsubscribers.forEach((unsubscribe) => unsubscribe());
        this.unsubscribers = [];
        this.displayedGamecast = null;
        this.clear();
        this.recentEventIds.clear();
    }

    handleHeroDisplay(candidate) {
        const next = this.getDisplayedGamecast(candidate);
        const sameDisplay = Boolean(
            next &&
            this.displayedGamecast &&
            next.candidateId === this.displayedGamecast.candidateId &&
            next.gameId === this.displayedGamecast.gameId
        );

        if (!sameDisplay) this.clear();
        this.displayedGamecast = next;
    }

    getDisplayedGamecast(candidate) {
        const payload = candidate?.payload;
        const identity = candidate?.gamecastIdentity;

        if (
            candidate?.mode !== "active" ||
            candidate?.source !== "sports" ||
            !["baseball-game", "football-game"].includes(payload?.type) ||
            typeof identity?.gameId !== "string" ||
            !identity.gameId
        ) {
            return null;
        }

        return {
            candidateId: candidate.id,
            gameId: identity.gameId,
            favoriteTeamId: identity.favoriteTeamId || null,
            teams: identity.teams || null
        };
    }

    accept(scoreEvent) {
        if (!this.isEligible(scoreEvent)) return false;
        if (this.recentEventIds.has(scoreEvent.id)) return false;

        this.rememberEventId(scoreEvent.id);
        const queued = {
            event: scoreEvent,
            acceptedAt: this.now()
        };

        if (scoreEvent.simulation === true && this.active) {
            if (this.timer) this.clearTimer(this.timer);
            this.timer = null;
            this.active = null;
            this.queue = [];
            this.activate(queued);
            return true;
        }

        if (!this.active) {
            this.activate(queued);
            return true;
        }

        if (this.queue.length >= this.queueLimit) return false;
        this.queue.push(queued);
        return true;
    }

    isEligible(scoreEvent) {
        const display = this.displayedGamecast;

        return Boolean(
            display &&
            scoreEvent?.schemaVersion === 1 &&
            typeof scoreEvent.id === "string" &&
            scoreEvent.id &&
            scoreEvent.gameId === display.gameId &&
            (
                scoreEvent.simulation === true ||
                scoreEvent.scoringTeamId === display.favoriteTeamId
            )
        );
    }

    activate(queued) {
        const startedAt = this.now();
        this.active = {
            event: queued.event,
            label: this.getDisplayLabel(queued.event.eventType),
            startedAt,
            endsAt: startedAt + this.durationMs,
            colors: queued.event.colors || null,
            logo: this.resolveScoringTeamLogo(queued.event)
        };
        this.publishState();
        this.timer = this.setTimer(
            () => this.completeActive(),
            this.durationMs
        );
    }

    completeActive() {
        this.timer = null;
        this.active = null;
        const now = this.now();

        while (
            this.queue.length > 0 &&
            now - this.queue[0].acceptedAt > this.queueMaxAgeMs
        ) {
            this.queue.shift();
        }

        const next = this.queue.shift();

        if (next && this.displayedGamecast) {
            this.activate(next);
        } else {
            this.publishState();
        }
    }

    clear() {
        if (this.timer) this.clearTimer(this.timer);
        const hadPresentation = Boolean(this.active || this.queue.length);
        this.timer = null;
        this.active = null;
        this.queue = [];
        if (hadPresentation) this.publishState();
    }

    getCurrentPresentation() {
        return this.active ? { ...this.active } : null;
    }

    publishState() {
        this.eventBus.publish({
            type: "gamecast-celebration-state",
            source: "gamecast-celebration-coordinator",
            payload: {
                presentation: this.getCurrentPresentation()
            }
        });
    }

    rememberEventId(id) {
        this.recentEventIds.add(id);
        if (this.recentEventIds.size <= 50) return;
        this.recentEventIds.delete(this.recentEventIds.values().next().value);
    }

    resolveScoringTeamLogo(scoreEvent) {
        const teams = this.displayedGamecast?.teams;
        const side = scoreEvent.scoringSide;
        const sideTeam = ["away", "home"].includes(side)
            ? teams?.[side]
            : null;

        if (
            sideTeam?.id === scoreEvent.scoringTeamId &&
            typeof sideTeam.logo === "string"
        ) {
            return sideTeam.logo.trim();
        }

        for (const team of [teams?.away, teams?.home]) {
            if (
                team?.id === scoreEvent.scoringTeamId &&
                typeof team.logo === "string"
            ) {
                return team.logo.trim();
            }
        }

        return "";
    }

    getDisplayLabel(eventType) {
        return {
            run: "RUN SCORED",
            "home-run": "HOME RUN",
            touchdown: "TOUCHDOWN",
            "field-goal": "FIELD GOAL",
            score: "SCORE"
        }[eventType] || "SCORE";
    }

}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        GamecastCelebrationCoordinator,
        GAMECAST_CELEBRATION_DURATION_MS,
        GAMECAST_CELEBRATION_QUEUE_LIMIT,
        GAMECAST_CELEBRATION_QUEUE_MAX_AGE_MS
    };
}
