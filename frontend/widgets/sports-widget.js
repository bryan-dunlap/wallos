class SportsWidget {

    constructor() {
        this.element = null;
        this.state = {
            title: "Sports",
            subtitle: "",
            payload: {
                availability: "loading"
            }
        };
        this.queue = new SportsWidgetQueue();
        this.adapters = new Map([
            ["MLB", new MlbSportsEventAdapter()]
        ]);
        this.rendererRegistry =
            window.mosaicSportsWidgetRendererRegistry;
        this.rotationTimer = null;
        this.unsubscribe = null;
        this.configRequest = null;
        this.widgetConfig = {
            enabled: true,
            leagues: new Set(["MLB"])
        };
    }

    mount(element) {
        this.stopRotation();

        if (this.unsubscribe) {
            this.unsubscribe();
        }

        this.element = element;
        this.subscribeToEvents();
        this.render();
        this.refreshWidgetConfig().then(() => {
            if (this.element) this.applyEventState();
        });
    }

    subscribeToEvents() {
        this.unsubscribe =
            window.mosaicApp.eventCoordinator.subscribe(
            "sports",
            (event) => this.showEvent(event)
        );
    }

    async showEvent(event) {
        this.stopRotation();
        this.state = event;
        await this.refreshWidgetConfig();

        if (!this.element || this.state !== event) return;

        this.applyEventState();
    }

    applyEventState() {
        const payload = this.state.payload || {};

        if (!this.isLeagueAllowed(payload.sport)) {
            this.queue.clear();
            this.render();
            return;
        }

        const games = Array.isArray(payload.games)
            ? payload.games
            : [];
        const adapter = this.adapters.get(
            String(payload.sport || "").toUpperCase()
        );
        const normalizedEvents = adapter
            ? adapter.adaptGames(games)
            : [];

        this.queue.replace(normalizedEvents);
        this.render();

        if (this.queue.size() > 1) {
            this.startRotation();
        }
    }

    async refreshWidgetConfig() {
        if (this.configRequest) return this.configRequest;

        this.configRequest = fetch("/api/config")
            .then((response) => {
                if (!response.ok) {
                    throw new Error(
                        `Config request failed: ${response.status}`
                    );
                }

                return response.json();
            })
            .then((config) => {
                const widgetConfig = config.sports?.widget;
                const leagues = Array.isArray(widgetConfig?.leagues)
                    ? widgetConfig.leagues
                    : ["MLB"];

                this.widgetConfig = {
                    enabled: widgetConfig?.enabled !== false,
                    leagues: new Set(leagues)
                };
            })
            .catch((error) => {
                console.error(
                    "Unable to load Sports Widget configuration:",
                    error
                );
            })
            .finally(() => {
                this.configRequest = null;
            });

        return this.configRequest;
    }

    isLeagueAllowed(league) {
        if (!this.widgetConfig.enabled) return false;
        if (typeof league !== "string") return true;

        return this.widgetConfig.leagues.has(
            league.toUpperCase()
        );
    }

    startRotation() {
        this.stopRotation();

        if (this.queue.size() < 2) return;

        this.rotationTimer = setInterval(
            () => this.advanceGame(),
            8000
        );
    }

    stopRotation() {
        if (!this.rotationTimer) return;

        clearInterval(this.rotationTimer);
        this.rotationTimer = null;
    }

    advanceGame() {
        if (this.queue.size() < 2) return;

        this.queue.next();
        this.render();
    }

    unmount() {
        this.stopRotation();

        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }

        this.element = null;
    }

    render() {
        const payload = this.state.payload || {};
        const currentEvent = this.queue.current();
        const isLoading =
            payload.availability === "loading";
        const isAvailable =
            payload.availability === "available";
        const sport = payload.sport || "Sports";
        const isLeagueAllowed = this.isLeagueAllowed(payload.sport);
        const status = isLoading
            ? "Loading"
            : !isAvailable
                ? "Unavailable"
                : "Idle";

        if (!isLeagueAllowed) {
            this.element.innerHTML = `
                <div class="widget-header">
                    <div class="widget-title">Sports</div>
                    <div class="widget-status">Unavailable</div>
                </div>
                <div class="widget-body">
                    Select leagues in Control
                </div>
                <div class="widget-footer">
                    <span>—</span>
                </div>
            `;
            return;
        }

        if (!isAvailable || this.queue.size() === 0) {
            this.element.innerHTML = `
                <div class="widget-header">
                    <div class="widget-title">${sport}</div>
                    <div class="widget-status">${status}</div>
                </div>
                <div class="widget-body">
                    ${isLoading
                        ? "Loading game"
                        : isAvailable
                            ? "No games scheduled"
                            : "No Data"}
                </div>
                <div class="widget-footer">
                    <span>—</span>
                </div>
            `;
            return;
        }

        const renderer = this.rendererRegistry.get(
            currentEvent.league
        );

        if (renderer) {
            const presentation = renderer.render(currentEvent);

            this.element.innerHTML = `
                <div class="widget-header">
                    <div class="widget-title">${sport}</div>
                    <div class="widget-status">${presentation.status}</div>
                </div>

                <div class="widget-body sports-matchup-layout">
                    ${presentation.content}
                </div>

                <div class="widget-footer">
                    <span></span>
                </div>
            `;
            return;
        }

        this.element.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">${sport}</div>
                <div class="widget-status">Unavailable</div>
            </div>
            <div class="widget-body">No Data</div>
            <div class="widget-footer"><span>—</span></div>
        `;
    }

}
