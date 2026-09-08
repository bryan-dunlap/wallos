const {
  acquireStates
} = require("./home-assistant-client");
const {
  normalizeHomeAssistantEntity
} = require("./home-assistant-entity-normalizer");

const HOME_ASSISTANT_STATE_CACHE_TTL_MS = 30 * 1000;
const HOME_ASSISTANT_STATE_MAX_STALE_MS = 15 * 60 * 1000;
const MAX_HOME_ASSISTANT_ENTITIES = 2000;

class HomeAssistantStateCache {
  constructor({
    acquire = acquireStates,
    now = () => Date.now(),
    ttlMs = HOME_ASSISTANT_STATE_CACHE_TTL_MS,
    maxStaleMs = HOME_ASSISTANT_STATE_MAX_STALE_MS,
    maxEntities = MAX_HOME_ASSISTANT_ENTITIES
  } = {}) {
    this.acquire = acquire;
    this.now = now;
    this.ttlMs = ttlMs;
    this.maxStaleMs = maxStaleMs;
    this.maxEntities = maxEntities;
    this.configKey = null;
    this.lastKnownGood = null;
    this.requestInFlight = null;
  }

  async getSnapshot(config) {
    const configKey = createConfigKey(config);

    if (configKey !== this.configKey) {
      this.configKey = configKey;
      this.lastKnownGood = null;
      this.requestInFlight = null;
    }

    const cached = this.lastKnownGood;
    const age = cached ? this.now() - cached.timestamp : Infinity;

    if (cached && age < this.ttlMs) {
      return createPublicSnapshot(cached, false);
    }

    if (this.requestInFlight) return this.requestInFlight;

    const request = this.refresh(config, cached, configKey).finally(() => {
      if (this.requestInFlight === request) {
        this.requestInFlight = null;
      }
    });

    this.requestInFlight = request;
    return request;
  }

  async refresh(config, cached, configKey) {
    try {
      const rawStates = await this.acquire(config);

      if (!Array.isArray(rawStates)) {
        throw new Error("Home Assistant states response is invalid.");
      }

      const allEntities = rawStates
        .map(normalizeHomeAssistantEntity)
        .filter(Boolean)
        .sort((left, right) => left.entityId < right.entityId
          ? -1
          : left.entityId > right.entityId ? 1 : 0);
      const timestamp = this.now();
      const domainTotals = allEntities.reduce((totals, entity) => {
        totals[entity.domain] = (totals[entity.domain] || 0) + 1;
        return totals;
      }, Object.create(null));
      const entry = {
        timestamp,
        updatedAt: new Date(timestamp).toISOString(),
        entities: allEntities.slice(0, this.maxEntities),
        total: allEntities.length,
        truncated: allEntities.length > this.maxEntities,
        domainTotals
      };

      if (this.configKey === configKey) {
        this.lastKnownGood = entry;
      }
      return createPublicSnapshot(entry, false);
    } catch {
      if (cached && this.now() - cached.timestamp <= this.maxStaleMs) {
        return createPublicSnapshot(cached, true);
      }

      return createUnavailableSnapshot();
    }
  }
}

function createConfigKey(config) {
  return `${config?.baseUrl || ""}\u0000${config?.accessToken || ""}`;
}

function createPublicSnapshot(entry, stale) {
  const snapshot = {
    schemaVersion: 1,
    status: "available",
    entities: entry.entities.map((entity) => ({ ...entity })),
    updatedAt: entry.updatedAt,
    stale,
    total: entry.total,
    truncated: entry.truncated
  };

  Object.defineProperty(snapshot, "domainTotals", {
    value: { ...entry.domainTotals },
    enumerable: false
  });

  return snapshot;
}

function createUnavailableSnapshot(status = "unavailable") {
  return {
    schemaVersion: 1,
    status,
    entities: [],
    updatedAt: null,
    stale: false,
    total: 0,
    truncated: false
  };
}

module.exports = {
  createUnavailableSnapshot,
  HomeAssistantStateCache,
  HOME_ASSISTANT_STATE_CACHE_TTL_MS,
  HOME_ASSISTANT_STATE_MAX_STALE_MS,
  MAX_HOME_ASSISTANT_ENTITIES
};
