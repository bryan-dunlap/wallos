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
        const normalizedEvents = adaptSportsWidgetLeagueEvents(
            getSportsWidgetPayloadLeagues(payload),
            this.adapters
        );
        const configuredEvents = filterSportsWidgetEvents(
            normalizedEvents,
            this.widgetConfig
        );

        this.queue.replace(configuredEvents);
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
        const sport = currentEvent?.league || "Sports";
        const hasSelectedLeagues =
            this.widgetConfig.enabled &&
            this.widgetConfig.leagues.size > 0;
        const status = isLoading
            ? "Loading"
            : !isAvailable
                ? "Unavailable"
                : "Idle";

        if (!hasSelectedLeagues) {
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

        const renderer = getSportsWidgetRenderer(
            this.rendererRegistry,
            currentEvent
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

function getSportsWidgetPayloadLeagues(payload = {}) {
    if (Array.isArray(payload.leagues)) {
        return payload.leagues;
    }

    return [{
        league: payload.sport || "",
        availability: payload.availability || "unavailable",
        games: Array.isArray(payload.games) ? payload.games : []
    }];
}

function adaptSportsWidgetLeagueEvents(leagues, adapters) {
    if (!Array.isArray(leagues) || !(adapters instanceof Map)) {
        return [];
    }

    return leagues.flatMap((entry) => {
        if (entry?.availability !== "available") return [];

        const league = String(entry.league || "")
            .trim()
            .toUpperCase();
        const adapter = adapters.get(league);

        return adapter && typeof adapter.adaptGames === "function"
            ? adapter.adaptGames(
                Array.isArray(entry.games) ? entry.games : []
            )
            : [];
    });
}

function getSportsWidgetRenderer(registry, currentEvent) {
    return currentEvent?.league && typeof registry?.get === "function"
        ? registry.get(currentEvent.league)
        : null;
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        adaptSportsWidgetLeagueEvents,
        getSportsWidgetPayloadLeagues,
        getSportsWidgetRenderer
    };
}
