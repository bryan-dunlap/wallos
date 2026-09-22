const HOME_ASSISTANT_REFRESH_INTERVAL_MS = 30 * 1000;

/*
 * Normalized `home-assistant` Mosaic event payload (schemaVersion 1):
 * {
 *   status: available|disabled|unconfigured|empty|unavailable,
 *   stale, updatedAt, selectedCount,
 *   entities: [{ domain, displayName, mosaicDisplayName, state, unit,
 *     deviceClass, availability }]
 * }
 * Entity order is the saved selection order. HTTP details, entity IDs,
 * attributes, registry metadata, and credentials do not cross this boundary.
 */

class HomeAssistantProvider {

    constructor(options = {}) {
        this.fetch = options.fetch || ((...args) => fetch(...args));
        this.document = options.document || document;
        this.scheduleTimeout = options.setTimeout ||
            ((callback, delay) => setTimeout(callback, delay));
        this.cancelTimeout = options.clearTimeout ||
            ((timer) => clearTimeout(timer));
        this.publish = options.publish || ((event) =>
            window.mosaicApp.eventBus.publish(event)
        );
        this.refreshIntervalMs = options.refreshIntervalMs ||
            HOME_ASSISTANT_REFRESH_INTERVAL_MS;
        this.refreshTimer = null;
        this.refreshInFlight = null;
        this.started = false;
        this.lifecycleVersion = 0;
        this.handleVisibilityChange = () => this.onVisibilityChange();
    }

    start() {
        if (this.started) return;

        this.started = true;
        const lifecycleVersion = ++this.lifecycleVersion;
        this.document.addEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );
        this.runRefreshCycle(lifecycleVersion);
    }

    stop() {
        this.started = false;
        this.lifecycleVersion += 1;
        this.clearRefreshTimer();
        this.document.removeEventListener(
            "visibilitychange",
            this.handleVisibilityChange
        );
    }

    runRefreshCycle(lifecycleVersion = this.lifecycleVersion) {
        if (this.refreshInFlight) return this.refreshInFlight;

        this.refreshInFlight = this.refresh()
            .catch(() => this.publishSnapshot(
                createHomeAssistantSourceSnapshot("unavailable")
            ))
            .finally(() => {
                this.refreshInFlight = null;

                if (
                    this.started &&
                    lifecycleVersion === this.lifecycleVersion &&
                    !this.document.hidden &&
                    this.runtimeEnabled
                ) {
                    this.scheduleRefresh(lifecycleVersion);
                }
            });

        return this.refreshInFlight;
    }

    async refresh() {
        const config = await this.loadConfig();
        if (!config.available) {
            this.runtimeEnabled = false;
            this.publishSnapshot(
                createHomeAssistantSourceSnapshot("unavailable")
            );
            return;
        }

        this.runtimeEnabled = Boolean(
            config.enabled && config.widgetEnabled
        );

        if (!this.runtimeEnabled) {
            this.publishSnapshot(createHomeAssistantSourceSnapshot(
                config.enabled ? "disabled" : "disabled"
            ));
            return;
        }

        const response = await this.fetch(
            "/api/home-assistant/selected-states"
        );

        if (!response.ok) {
            throw new Error(
                `Home Assistant request failed: ${response.status}`
            );
        }

        this.publishSnapshot(normalizeHomeAssistantSnapshot(
            await response.json()
        ));
    }

    async loadConfig() {
        try {
            const response = await this.fetch("/api/config");

            if (!response.ok) throw new Error("Config unavailable");

            const config = await response.json();

            return {
                available: true,
                enabled: config.homeAssistant?.enabled === true,
                widgetEnabled:
                    config.homeAssistant?.widget?.enabled === true
            };
        } catch {
            return {
                available: false,
                enabled: false,
                widgetEnabled: false
            };
        }
    }

    scheduleRefresh(lifecycleVersion) {
        this.clearRefreshTimer();
        this.refreshTimer = this.scheduleTimeout(() => {
            this.refreshTimer = null;
            this.runRefreshCycle(lifecycleVersion);
        }, this.refreshIntervalMs);
    }

    clearRefreshTimer() {
        if (this.refreshTimer === null) return;

        this.cancelTimeout(this.refreshTimer);
        this.refreshTimer = null;
    }

    onVisibilityChange() {
        this.clearRefreshTimer();

        if (!this.started || this.document.hidden) return;

        this.runRefreshCycle(this.lifecycleVersion);
    }

    publishSnapshot(snapshot) {
        this.publish({
            type: "home-assistant",
            title: "Home",
            subtitle: "",
            source: "home-assistant",
            payload: snapshot
        });
    }
}

function normalizeHomeAssistantSnapshot(snapshot) {
    const supportedStatuses = new Set([
        "available",
        "disabled",
        "unconfigured",
        "empty",
        "unavailable"
    ]);
    const status = supportedStatuses.has(snapshot?.status) &&
        snapshot?.schemaVersion === 1 &&
        (snapshot.status !== "available" || Array.isArray(snapshot.entities))
        ? snapshot.status
        : "unavailable";
    const entities = status === "available" &&
        Array.isArray(snapshot?.entities)
        ? snapshot.entities.map(normalizeHomeAssistantEntity)
        : [];

    return {
        schemaVersion: 1,
        status,
        stale: status === "available" && snapshot?.stale === true,
        updatedAt: typeof snapshot?.updatedAt === "string"
            ? snapshot.updatedAt
            : null,
        selectedCount: Number.isInteger(snapshot?.selectedCount)
            ? Math.max(0, snapshot.selectedCount)
            : entities.length,
        entities
    };
}

function normalizeHomeAssistantEntity(entity) {
    const availability = [
        "available", "unavailable", "unknown", "missing"
    ].includes(entity?.availability)
        ? entity.availability
        : "unknown";

    return {
        domain: normalizeHomeAssistantToken(entity?.domain),
        displayName: normalizeHomeAssistantText(entity?.displayName),
        mosaicDisplayName: normalizeHomeAssistantText(
            entity?.mosaicDisplayName
        ),
        state: normalizeHomeAssistantText(entity?.state),
        unit: normalizeHomeAssistantText(entity?.unit),
        deviceClass: normalizeHomeAssistantToken(entity?.deviceClass),
        availability
    };
}

function normalizeHomeAssistantText(value) {
    return typeof value === "string" ? value.trim().slice(0, 200) : null;
}

function normalizeHomeAssistantToken(value) {
    const token = normalizeHomeAssistantText(value);
    return token && /^[a-z0-9_]+$/.test(token) ? token : null;
}

function createHomeAssistantSourceSnapshot(status) {
    return {
        schemaVersion: 1,
        status,
        stale: false,
        updatedAt: null,
        selectedCount: 0,
        entities: []
    };
}

if (typeof module !== "undefined" && module.exports) {
    module.exports = {
        HOME_ASSISTANT_REFRESH_INTERVAL_MS,
        HomeAssistantProvider,
        createHomeAssistantSourceSnapshot,
        normalizeHomeAssistantSnapshot
    };
}
