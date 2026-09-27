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
            ["MLB", new MlbSportsEventAdapter()],
            ["NFL", new NflSportsEventAdapter()]
        ]);
        this.rendererRegistry =
            window.mosaicSportsWidgetRendererRegistry;
        this.rotationTimer = null;
        this.unsubscribe = null;
        this.unsubscribePerformers = null;
        this.configRequest = null;
        this.widgetConfig = normalizeSportsWidgetConfig(null, false);
        this.density = "compact";
        this.featuredPerformers = new Map();
    }

    mount(element) {
        this.stopRotation();

        if (this.unsubscribe) {
            this.unsubscribe();
        }
        if (this.unsubscribePerformers) {
            this.unsubscribePerformers();
        }

        this.element = element;
        this.subscribeToEvents();
        this.unsubscribePerformers =
            window.mosaicApp.eventBus.subscribe(
                "sports-featured-performers",
                (event) => this.receiveFeaturedPerformers(event.payload)
            );
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
        this.pruneFeaturedPerformers(configuredEvents);
        this.render();

        if (this.queue.size() > 1) {
            this.startRotation();
        }
        this.requestFeaturedPerformers();
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
                    : [];

                this.widgetConfig = normalizeSportsWidgetConfig({
                    ...widgetConfig,
                    leagues
                });
            })
            .catch((error) => {
                this.widgetConfig = normalizeSportsWidgetConfig(null, false);
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
        this.requestFeaturedPerformers();
    }

    setPresentationContext(context = {}) {
        const density = context.density === "expanded"
            ? "expanded"
            : "compact";

        if (this.density === density) return;
        this.density = density;
        this.stopRotation();
        this.render();

        if (this.queue.size() > 1) {
            this.startRotation();
        }
        this.requestFeaturedPerformers();
    }

    unmount() {
        this.stopRotation();

        if (this.unsubscribe) {
            this.unsubscribe();
            this.unsubscribe = null;
        }
        if (this.unsubscribePerformers) this.unsubscribePerformers();
        this.unsubscribePerformers = null;

        this.element = null;
    }

    render() {
        if (!this.element) return;

        this.element.dataset.normalWidgetDensity = this.density;
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

        if (!this.widgetConfig.available) {
            this.element.innerHTML = `
                <div class="widget-header">
                    <div class="widget-title">Sports</div>
                    <div class="widget-status">Unavailable</div>
                </div>
                <div class="widget-body">No Data</div>
                <div class="widget-footer"><span>—</span></div>
            `;
            return;
        }

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

        if (this.density === "expanded") {
            this.renderExpanded();
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

    renderExpanded() {
        const event = this.queue.current();
        const presentation = getSportsWidgetRenderer(
            this.rendererRegistry,
            event
        )?.render(event);
        const featured = this.featuredPerformers.get(String(event.id));
        const headerStatus = presentation?.status || "Unavailable";
        const primaryStatus = String(event.status || "");
        const statusIsDuplicated = primaryStatus.toLowerCase() ===
            String(headerStatus).toLowerCase();

        this.element.innerHTML = `
            <div class="widget-header">
                <div class="widget-title">Sports</div>
                <div class="widget-status">${headerStatus}</div>
            </div>
            <div class="normal-widget-expanded-content sports-expanded">
                <div class="normal-widget-expanded-primary sports-expanded-primary">
                    <div class="sports-expanded-meta">
                        <span>${event.league}</span>
                        ${statusIsDuplicated
                            ? ""
                            : `<span>${event.status}</span>`}
                    </div>
                    <div class="sports-matchup-layout sports-expanded-scoreboard">
                        ${presentation?.content || "No Data"}
                    </div>
                </div>
                ${renderFeaturedPerformers(featured)}
            </div>
        `;
    }

    requestFeaturedPerformers() {
        if (this.density !== "expanded") return;
        const event = this.queue.current();
        if (!event) return;
        window.mosaicApp.eventBus.publish({
            type: "sports-feature-request",
            source: "sports-widget",
            payload: {
                league: event.league,
                eventId: event.id,
                status: event.status,
                date: event.state?.date || null,
                awayTeamId: event.participants.away?.providerId ?? null,
                homeTeamId: event.participants.home?.providerId ?? null
            }
        });
    }

    receiveFeaturedPerformers(payload = {}) {
        const eventId = String(payload.eventId || "");
        if (!eventId || !this.hasConfiguredEvent(eventId)) return;
        this.featuredPerformers.set(eventId, payload.featuredPerformers || null);
        if (String(this.queue.current()?.id || "") === eventId) this.render();
    }

    hasConfiguredEvent(eventId) {
        return this.queue.items.some(
            (event) => String(event?.id || "") === eventId
        );
    }

    pruneFeaturedPerformers(events) {
        const activeIds = new Set(
            events.map((event) => String(event?.id || ""))
        );
        for (const eventId of this.featuredPerformers.keys()) {
            if (!activeIds.has(eventId)) {
                this.featuredPerformers.delete(eventId);
            }
        }
    }

}

function normalizeSportsWidgetConfig(widgetConfig, available = true) {
    const leagues = Array.isArray(widgetConfig?.leagues)
        ? widgetConfig.leagues
        : [];

    return {
        available,
        enabled: available && widgetConfig?.enabled !== false,
        leagues: new Set(leagues)
    };
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

function renderFeaturedPerformers(featured) {
    const teams = featured?.teams;
    if (!teams) return "";
    const groups = [teams.away, teams.home].filter(
        (team) => Array.isArray(team?.entries) && team.entries.length
    );
    if (!groups.length) return "";
    return `
        <div class="normal-widget-expanded-secondary sports-performers">
            <div class="sports-performers-title">Top performers</div>
            <div class="sports-performer-teams">
                ${groups.map(renderPerformerTeam).join("")}
            </div>
        </div>
    `;
}

function renderPerformerTeam(team) {
    return `
        <div class="sports-performer-team">
            <div class="sports-performer-team-name">${escapeSportsText(team.name)}</div>
            ${team.entries.map((entry) => `
                <div class="sports-performer-row">
                    <span class="sports-performer-role">${escapeSportsText(entry.role?.charAt(0) || "")}</span>
                    <span class="sports-performer-name">${escapeSportsText(entry.name || "—")}</span>
                    <span class="sports-performer-line">${escapeSportsText(entry.summary || "")}</span>
                </div>
            `).join("")}
        </div>
    `;
}

function escapeSportsText(value) {
    return String(value ?? "")
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        SportsWidget,
        adaptSportsWidgetLeagueEvents,
        getSportsWidgetPayloadLeagues,
        getSportsWidgetRenderer,
        normalizeSportsWidgetConfig,
        escapeSportsText,
        renderFeaturedPerformers,
        renderPerformerTeam
    };
}
