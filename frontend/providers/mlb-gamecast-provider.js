const MLB_GAMECAST_REFRESH_INTERVAL_MS = 5 * 1000;

/*
 * Owns the fast MLB detail lifecycle only while a live baseball context is
 * actually selected in Hero. The normal SportsProvider remains responsible
 * for the slower Sports widget and schedule refresh.
 */
class MlbGamecastProvider {

    constructor(scoreEventDetector = null) {
        this.unsubscribers = [];
        this.favoriteTeam = null;
        this.favoriteRank = null;
        this.liveCandidateId = null;
        this.liveEventId = null;
        this.displayedCandidateId = null;
        this.refreshTimer = null;
        this.refreshInFlight = null;
        this.lifecycleVersion = 0;
        this.mlbDataProvider = new MlbDataProvider();
        this.scoreEventDetector = scoreEventDetector ||
            this.createScoreEventDetector();
        this.handlePageHide = () => this.stop();
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
            )
        );
        window.addEventListener("pagehide", this.handlePageHide);
    }

    stop() {
        this.stopRefreshLoop();
        this.unsubscribers.forEach((unsubscribe) => unsubscribe());
        this.unsubscribers = [];
        this.favoriteTeam = null;
        this.favoriteRank = null;
        this.liveCandidateId = null;
        this.liveEventId = null;
        this.displayedCandidateId = null;
        window.removeEventListener("pagehide", this.handlePageHide);
    }

    handleSportsFacts(facts) {
        const favoriteTeam = facts?.favoriteTeam;

        if (
            facts?.simulation !== true &&
            favoriteTeam?.league &&
            favoriteTeam.league !== "MLB"
        ) {
            return;
        }

        const gameIsLive =
            facts?.simulation !== true &&
            facts?.status === "available" &&
            favoriteTeam?.league === "MLB" &&
            favoriteTeam?.id &&
            facts.game?.status === "live";

        if (!gameIsLive) {
            this.favoriteTeam = null;
            this.favoriteRank = null;
            this.liveCandidateId = null;
            this.liveEventId = null;
            this.stopRefreshLoop();
            return;
        }

        const nextEventId = String(facts.game.eventId || "");

        if (this.liveEventId && this.liveEventId !== nextEventId) {
            this.stopRefreshLoop();
        }

        this.favoriteTeam = favoriteTeam;
        this.favoriteRank = Number.isInteger(facts.favoriteRank)
            ? facts.favoriteRank
            : null;
        this.liveCandidateId = `sports:live:${favoriteTeam.id}`;
        this.liveEventId = nextEventId;
        this.reconcileRefreshLoop();
    }

    handleHeroDisplay(candidate) {
        const isBaseballGamecast =
            candidate?.source === "sports" &&
            candidate?.type === "sports.live-game" &&
            candidate?.mode === "active" &&
            candidate?.payload?.type === "baseball-game";

        this.displayedCandidateId = isBaseballGamecast
            ? candidate.id
            : null;
        this.reconcileRefreshLoop();
    }

    reconcileRefreshLoop() {
        if (this.shouldRefresh()) {
            this.scheduleRefresh();
        } else {
            this.stopRefreshLoop();
        }
    }

    shouldRefresh() {
        return Boolean(
            this.favoriteTeam &&
            this.liveCandidateId &&
            this.liveEventId &&
            this.displayedCandidateId === this.liveCandidateId
        );
    }

    scheduleRefresh() {
        if (this.refreshTimer || this.refreshInFlight) return;

        const lifecycleVersion = this.lifecycleVersion;
        this.refreshTimer = setTimeout(
            () => this.refresh(lifecycleVersion),
            MLB_GAMECAST_REFRESH_INTERVAL_MS
        );
    }

    async refresh(lifecycleVersion) {
        this.refreshTimer = null;

        if (
            lifecycleVersion !== this.lifecycleVersion ||
            !this.shouldRefresh()
        ) {
            return;
        }

        this.refreshInFlight = this.mlbDataProvider.getGamecastFacts(
            this.favoriteTeam,
            this.getDateKey(new Date())
        );

        try {
            const facts = await this.refreshInFlight;

            if (
                lifecycleVersion === this.lifecycleVersion &&
                this.shouldRefresh() &&
                String(facts?.game?.eventId || "") === this.liveEventId
            ) {
                const rankedFacts = {
                    ...facts,
                    ...(Number.isInteger(this.favoriteRank)
                        ? { favoriteRank: this.favoriteRank }
                        : {})
                };
                this.acceptDetailedSnapshot(rankedFacts);
                window.mosaicApp.eventBus.publish({
                    type: "sports-facts",
                    source: "sports-gamecast",
                    payload: rankedFacts
                });
            }
        } catch (error) {
            console.error("Unable to refresh MLB Gamecast:", error);
        } finally {
            this.refreshInFlight = null;
        }

        if (this.shouldRefresh()) this.scheduleRefresh();
    }

    stopRefreshLoop() {
        this.lifecycleVersion += 1;
        this.scoreEventDetector?.reset();

        if (this.refreshTimer) {
            clearTimeout(this.refreshTimer);
            this.refreshTimer = null;
        }
    }

    getDateKey(date) {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, "0");
        const day = String(date.getDate()).padStart(2, "0");

        return `${year}-${month}-${day}`;
    }

    createScoreEventDetector() {
        if (typeof ScoreEventDetector === "undefined") return null;

        return new ScoreEventDetector({
            onEvent: (scoreEvent) => {
                window.mosaicApp.eventBus.publish({
                    type: "gamecast-score-event",
                    source: "sports-gamecast",
                    payload: scoreEvent
                });
            }
        });
    }

    acceptDetailedSnapshot(facts) {
        if (
            !this.scoreEventDetector ||
            typeof createDetailedGamecastSnapshot === "undefined"
        ) {
            return [];
        }

        return this.scoreEventDetector.accept(
            createDetailedGamecastSnapshot({
                gameId: facts.game.eventId,
                sport: "baseball",
                league: "MLB",
                score: facts.game.score,
                teams: facts.game.teams,
                stale: facts.gamecastStale,
                sourceRevision: facts.gamecastUpdatedAt
            })
        );
    }

}
