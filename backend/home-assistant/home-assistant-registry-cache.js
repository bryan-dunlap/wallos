const { acquireRegistries } = require("./home-assistant-websocket-client");

const HOME_ASSISTANT_REGISTRY_CACHE_TTL_MS = 5 * 60 * 1000;
const HOME_ASSISTANT_REGISTRY_MAX_STALE_MS = 24 * 60 * 60 * 1000;

class HomeAssistantRegistryCache {
  constructor({
    acquire = acquireRegistries,
    now = () => Date.now(),
    ttlMs = HOME_ASSISTANT_REGISTRY_CACHE_TTL_MS,
    maxStaleMs = HOME_ASSISTANT_REGISTRY_MAX_STALE_MS
  } = {}) {
    this.acquire = acquire;
    this.now = now;
    this.ttlMs = ttlMs;
    this.maxStaleMs = maxStaleMs;
    this.configKey = null;
    this.lastKnownGood = null;
    this.requestInFlight = null;
  }

  async getSnapshot(config, { forceRefresh = false } = {}) {
    const configKey = `${config?.baseUrl || ""}\u0000${config?.accessToken || ""}`;
    if (configKey !== this.configKey) {
      this.configKey = configKey;
      this.lastKnownGood = null;
      this.requestInFlight = null;
    }
    const cached = this.lastKnownGood;
    if (!forceRefresh && cached && this.now() - cached.timestamp < this.ttlMs) {
      return publicSnapshot(cached, false);
    }
    if (this.requestInFlight) return this.requestInFlight;
    const request = this.refresh(config, cached, configKey).finally(() => {
      if (this.requestInFlight === request) this.requestInFlight = null;
    });
    this.requestInFlight = request;
    return request;
  }

  async refresh(config, cached, configKey) {
    try {
      const registries = await this.acquire(config);
      if (!validRegistries(registries)) throw new Error("invalid registries");
      const timestamp = this.now();
      const entry = { timestamp, registries };
      if (this.configKey === configKey) this.lastKnownGood = entry;
      return publicSnapshot(entry, false);
    } catch {
      if (cached && this.now() - cached.timestamp <= this.maxStaleMs) {
        return publicSnapshot(cached, true);
      }
      return { status: "unavailable", stale: false, registries: null };
    }
  }
}

function validRegistries(value) {
  return value && [value.entities, value.devices, value.areas].every(Array.isArray);
}

function publicSnapshot(entry, stale) {
  return { status: "available", stale, registries: entry.registries };
}

module.exports = {
  HomeAssistantRegistryCache,
  HOME_ASSISTANT_REGISTRY_CACHE_TTL_MS,
  HOME_ASSISTANT_REGISTRY_MAX_STALE_MS
};
