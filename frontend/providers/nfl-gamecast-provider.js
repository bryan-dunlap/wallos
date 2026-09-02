const NFL_GAMECAST_REFRESH_INTERVAL_MS = 5 * 1000;

class NflGamecastProvider {

    constructor(lifecycleState = null) {
        this.unsubscribers = [];
        this.factsByFavoriteId = new Map();
        this.displayedCandidate = null;
        this.activeLifecycleKey = null;
        this.refreshTimer = null;
        this.refreshInFlight = null;
        this.lifecycleVersion = 0;
        this.lifecycleState = lifecycleState ||
            (typeof nflGamecastLifecycleState !== "undefined"
                ? nflGamecastLifecycleState
                : null);
        this.handlePageHide = () => this.stop();
        this.handleVisibilityChange = () => {
            if (document.visibilityState === "hidden") {
                this.stopRefreshLoop();
            } else {
                this.reconcileRefreshLoop();
            }
        };
    }

    start() {
        this.stop();
        this.unsubscribers.push(
            window.mosaicApp.eventBus.subscribe(
                "sports-facts",
                (event) => this.handleSportsFacts(event.payload)
            ),
            window.mosaicApp.eventBus.subscribe(
                "hero-display",
                (event) => this.handleHeroDisplay(
                    event.payload?.candidate
                )
            ),
            window.mosaicApp.eventBus.subscribe(
                "sports-simulation-state",
                (event) => this.handleSimulationState(
                    event.payload?.active
                )
            )
        );
        window.addEventListener("pagehide", this.handlePageHide);
        document.addEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );
    }

    stop() {
        this.stopRefreshLoop();
        this.unsubscribers.forEach((unsubscribe) => unsubscribe());
        this.unsubscribers = [];
        this.factsByFavoriteId.clear();
        this.displayedCandidate = null;
        window.removeEventListener("pagehide", this.handlePageHide);
        document.removeEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );
    }

    handleSportsFacts(facts) {
        if (facts?.simulation === true) {
            this.factsByFavoriteId.clear();
            this.stopRefreshLoop();
            return;
        }

        const favoriteTeam = facts?.favoriteTeam;

        if (favoriteTeam?.league && favoriteTeam.league !== "NFL") {
            return;
        }

        if (!favoriteTeam?.id) {
            this.factsByFavoriteId.clear();
            this.stopRefreshLoop();
            return;
        }

        if (
            facts?.status !== "available" ||
            favoriteTeam.league !== "NFL" ||
            !facts.game?.eventId
        ) {
            this.factsByFavoriteId.delete(favoriteTeam.id);
            this.reconcileRefreshLoop();
            return;
        }

        this.factsByFavoriteId.set(favoriteTeam.id, facts);
        this.reconcileRefreshLoop();
    }

    getDisplayedFavoriteId() {
        const prefix = "sports:live:";
        const candidateId = this.displayedCandidate?.id;

        return typeof candidateId === "string" &&
            candidateId.startsWith(prefix)
            ? candidateId.slice(prefix.length)
            : null;
    }

    getDisplayedFacts() {
        const favoriteTeamId = this.getDisplayedFavoriteId();

        return favoriteTeamId
            ? this.factsByFavoriteId.get(favoriteTeamId) || null
            : null;
    }

    handleHeroDisplay(candidate) {
        this.displayedCandidate = this.isFootballGameCandidate(candidate)
            ? candidate
            : null;
        this.reconcileRefreshLoop();
    }

    handleSimulationState(active) {
        if (active === true) {
            this.factsByFavoriteId.clear();
            this.stopRefreshLoop();
        }
    }

    isFootballGameCandidate(candidate) {
        return Boolean(
            candidate?.source === "sports" &&
            candidate?.type === "sports.live-game" &&
            candidate?.mode === "active" &&
            candidate?.payload?.type === "football-game"
        );
    }

    getLifecycleKey() {
        const facts = this.getDisplayedFacts();
        const favoriteTeam = facts?.favoriteTeam;
        const eventId = facts?.game?.eventId;
        const candidate = this.displayedCandidate;

        if (
            !favoriteTeam?.id ||
            !eventId ||
            facts.game.status !== "live" ||
            candidate?.id !== `sports:live:${favoriteTeam.id}` ||
            String(candidate.payload?.eventId || "") !== String(eventId)
        ) {
            return null;
        }

        return `${favoriteTeam.id}:${eventId}`;
    }

    reconcileRefreshLoop() {
        if (
            typeof document !== "undefined" &&
            document.visibilityState === "hidden"
        ) {
            this.stopRefreshLoop();
            return;
        }

        const lifecycleKey = this.getLifecycleKey();

        if (!lifecycleKey) {
            this.stopRefreshLoop();
            return;
        }

        if (this.activeLifecycleKey === lifecycleKey) return;

        this.stopRefreshLoop();
        this.activeLifecycleKey = lifecycleKey;
        const lifecycleVersion = this.lifecycleVersion;
        this.refresh(lifecycleVersion);
    }

    async refresh(lifecycleVersion) {
        if (
            lifecycleVersion !== this.lifecycleVersion ||
            !this.getLifecycleKey() ||
            this.refreshInFlight
        ) {
            return;
        }

        const facts = this.getDisplayedFacts();
        const eventId = String(facts.game.eventId);
        const eventDate = facts.game.eventDate;

        if (!eventDate) {
            this.stopRefreshLoop();
            return;
        }

        const request = this.fetchGamecast(eventDate, eventId);
        this.refreshInFlight = request;

        try {
            const response = await request;

            if (
                lifecycleVersion !== this.lifecycleVersion ||
                request !== this.refreshInFlight ||
                this.getLifecycleKey() !== this.activeLifecycleKey ||
                !this.isValidResponse(response, eventId)
            ) {
                return;
            }

            const detailedFacts = this.createDetailedFacts(facts, response);
            this.factsByFavoriteId.set(
                facts.favoriteTeam.id,
                detailedFacts
            );

            if (response.gamecast.status === "final") {
                this.lifecycleState?.markFinalPresented(
                    facts.favoriteTeam.id,
                    response.gamecast.eventId
                );
            }

            this.publishSportsFacts(detailedFacts);

            if (response.gamecast.status === "final") {
                this.stopRefreshLoop();
                return;
            }
        } catch (error) {
            console.error("Unable to refresh NFL Gamecast:", error);
        } finally {
            if (request === this.refreshInFlight) {
                this.refreshInFlight = null;
            }

            if (
                lifecycleVersion !== this.lifecycleVersion &&
                this.getLifecycleKey()
            ) {
                this.activeLifecycleKey = null;
                this.reconcileRefreshLoop();
                return;
            }
        }

        if (
            lifecycleVersion === this.lifecycleVersion &&
            this.getLifecycleKey()
        ) {
            this.scheduleRefresh(lifecycleVersion);
        }
    }

    async fetchGamecast(eventDate, eventId) {
        const response = await fetch(
            "/api/sports/nfl/gamecast" +
            `?date=${encodeURIComponent(eventDate)}` +
            `&eventId=${encodeURIComponent(eventId)}`
        );
        const payload = await response.json();

        if (!response.ok) {
            throw new Error(
                `NFL Gamecast request failed: ${response.status}`
            );
        }

        return payload;
    }

    isValidResponse(response, eventId) {
        return Boolean(
            response?.gamecast &&
            typeof response.gamecast === "object" &&
            String(response.gamecast.eventId || "") === String(eventId)
        );
    }

    createDetailedFacts(facts, response) {
        const gamecast = response.gamecast;

        return {
            ...facts,
            game: {
                ...facts.game,
                status: gamecast.status,
                eventId: gamecast.eventId,
                teams: gamecast.teams,
                score: gamecast.score,
                quarter: gamecast.gameState?.quarter ?? null,
                gameClock: gamecast.gameState?.clock ?? null,
                lineScore: gamecast.lineScore,
                gamecast: {
                    type: "football-game",
                    ...gamecast
                }
            },
            gamecastUpdatedAt: response.updatedAt || null,
            gamecastStale: response.stale === true
        };
    }

    publishSportsFacts(facts) {
        window.mosaicApp.eventBus.publish({
            type: "sports-facts",
            source: "sports-gamecast",
            payload: facts
        });
    }

    scheduleRefresh(lifecycleVersion) {
        if (this.refreshTimer || this.refreshInFlight) return;

        this.refreshTimer = setTimeout(() => {
            this.refreshTimer = null;
            this.refresh(lifecycleVersion);
        }, NFL_GAMECAST_REFRESH_INTERVAL_MS);
    }

    stopRefreshLoop() {
        this.lifecycleVersion += 1;
        this.activeLifecycleKey = null;

        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

}
