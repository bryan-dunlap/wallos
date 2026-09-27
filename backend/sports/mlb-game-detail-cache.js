const MLB_DETAIL_LIVE_TTL_MS = 4 * 1000;
const MLB_DETAIL_FINAL_TTL_MS = 6 * 60 * 60 * 1000;
const MLB_DETAIL_CACHE_LIMIT = 64;
const MLB_SCHEDULE_LOOKUP_TTL_MS = 5 * 60 * 1000;
const MLB_SCHEDULE_LOOKUP_CACHE_LIMIT = 16;

class MlbGameIdResolver {
  constructor(options = {}) {
    this.fetch = options.fetch || ((...args) => global.fetch(...args));
    this.now = options.now || Date.now;
    this.cache = new Map();
    this.inFlight = new Map();
  }

  async resolve({ date, awayTeamId, homeTeamId }) {
    const games = await this.acquireDate(date);
    const matches = games.filter((game) =>
      String(game?.teams?.away?.team?.id) === String(awayTeamId) &&
      String(game?.teams?.home?.team?.id) === String(homeTeamId)
    );
    if (matches.length !== 1 || matches[0]?.gamePk == null) return null;
    return String(matches[0].gamePk);
  }

  async acquireDate(date) {
    const cached = this.cache.get(date);
    if (cached && this.now() - cached.timestamp < MLB_SCHEDULE_LOOKUP_TTL_MS) {
      return cached.games;
    }
    if (this.inFlight.has(date)) return this.inFlight.get(date);
    const request = this.fetch(
      `https://statsapi.mlb.com/api/v1/schedule?sportId=1&date=${encodeURIComponent(date)}&hydrate=team`
    ).then(async (response) => {
      if (!response.ok) throw new Error(`MLB game lookup failed: ${response.status}`);
      const payload = await response.json();
      const games = (payload.dates || []).flatMap((group) => group.games || []);
      this.cache.set(date, { games, timestamp: this.now() });
      while (this.cache.size > MLB_SCHEDULE_LOOKUP_CACHE_LIMIT) {
        this.cache.delete(this.cache.keys().next().value);
      }
      return games;
    }).finally(() => this.inFlight.delete(date));
    this.inFlight.set(date, request);
    return request;
  }
}

class MlbGameDetailCache {
  constructor(options = {}) {
    this.fetch = options.fetch || ((...args) => global.fetch(...args));
    this.now = options.now || Date.now;
    this.liveTtlMs = options.liveTtlMs || MLB_DETAIL_LIVE_TTL_MS;
    this.finalTtlMs = options.finalTtlMs || MLB_DETAIL_FINAL_TTL_MS;
    this.limit = options.limit || MLB_DETAIL_CACHE_LIMIT;
    this.cache = options.cache || new Map();
    this.inFlight = new Map();
  }

  async acquire(gameId, options = {}) {
    const id = String(gameId || "").trim();
    if (!id) throw new Error("MLB game ID is required.");
    const status = options.status === "final" ? "final" : "live";
    const cached = this.cache.get(id);
    const ttl = status === "final" ? this.finalTtlMs : this.liveTtlMs;

    const cacheMatchesLifecycle = status !== "final" || cached?.status === "final";
    if (cached && cacheMatchesLifecycle && this.now() - cached.timestamp < ttl) {
      return { data: cached.data, stale: false, cached: true };
    }
    if (this.inFlight.has(id)) return this.inFlight.get(id);

    const request = this.fetchDetail(id)
      .then((data) => {
        this.cache.set(id, { data, timestamp: this.now(), status });
        this.trim();
        return { data, stale: false, cached: false };
      })
      .catch((error) => {
        if (cached?.data) {
          return { data: cached.data, stale: true, cached: true };
        }
        throw error;
      })
      .finally(() => this.inFlight.delete(id));
    this.inFlight.set(id, request);
    return request;
  }

  async fetchDetail(gameId) {
    const response = await this.fetch(
      `https://statsapi.mlb.com/api/v1.1/game/${encodeURIComponent(gameId)}/feed/live`
    );
    if (!response.ok) {
      throw new Error(`MLB game detail request failed: ${response.status}`);
    }
    return response.json();
  }

  trim() {
    while (this.cache.size > this.limit) {
      this.cache.delete(this.cache.keys().next().value);
    }
  }
}

module.exports = {
  MLB_DETAIL_CACHE_LIMIT,
  MLB_DETAIL_FINAL_TTL_MS,
  MLB_DETAIL_LIVE_TTL_MS,
  MlbGameIdResolver,
  MlbGameDetailCache
};
