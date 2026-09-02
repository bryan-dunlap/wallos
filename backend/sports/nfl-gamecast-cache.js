const {
  acquireNflGamecast
} = require("./nfl-gamecast-acquirer");

const NFL_GAMECAST_LIVE_CACHE_MS = 5 * 1000;
const NFL_GAMECAST_SCHEDULED_CACHE_MS = 5 * 60 * 1000;
const NFL_GAMECAST_FINAL_CACHE_MS = 6 * 60 * 60 * 1000;

const nflGamecastCache = new Map();
const nflGamecastRequestsInFlight = new Map();

function getNflGamecastCacheKey(requestedDate, eventId) {
  return `${requestedDate}:${eventId}`;
}

function getNflGamecastCacheTtl(gamecast) {
  if (gamecast?.status === "live") return NFL_GAMECAST_LIVE_CACHE_MS;
  if (gamecast?.status === "final") return NFL_GAMECAST_FINAL_CACHE_MS;
  return NFL_GAMECAST_SCHEDULED_CACHE_MS;
}

function isValidNflGamecast(gamecast, eventId) {
  return Boolean(
    gamecast &&
    typeof gamecast === "object" &&
    ["scheduled", "live", "final", "unknown"].includes(gamecast.status) &&
    String(gamecast.eventId || "") === String(eventId) &&
    gamecast.teams?.away &&
    gamecast.teams?.home &&
    gamecast.score &&
    gamecast.gameState &&
    gamecast.lineScore
  );
}

async function acquireCachedNflGamecast(
  requestedDate,
  eventId,
  options = {}
) {
  const cache = options.cache || nflGamecastCache;
  const requestsInFlight = options.requestsInFlight ||
    nflGamecastRequestsInFlight;
  const acquire = options.acquire || acquireNflGamecast;
  const now = options.now || Date.now;
  const cacheKey = getNflGamecastCacheKey(requestedDate, eventId);
  const cached = cache.get(cacheKey);

  if (
    cached &&
    now() - cached.timestamp < cached.ttl &&
    isValidNflGamecast(cached.gamecast, eventId)
  ) {
    return {
      gamecast: cached.gamecast,
      updatedAt: cached.updatedAt,
      stale: false
    };
  }

  const existingRequest = requestsInFlight.get(cacheKey);

  if (existingRequest) return existingRequest;

  const acquisition = async () => {
    try {
      const gamecast = await acquire(requestedDate, eventId, options);

      if (!isValidNflGamecast(gamecast, eventId)) {
        throw new Error("NFL Gamecast acquisition returned malformed data.");
      }

      const timestamp = now();
      const updatedAt = new Date(timestamp).toISOString();

      cache.set(cacheKey, {
        timestamp,
        ttl: getNflGamecastCacheTtl(gamecast),
        gamecast,
        updatedAt
      });

      return { gamecast, updatedAt, stale: false };
    } catch (error) {
      if (cached && isValidNflGamecast(cached.gamecast, eventId)) {
        return {
          gamecast: cached.gamecast,
          updatedAt: cached.updatedAt,
          stale: true
        };
      }

      throw error;
    }
  };
  const request = acquisition().finally(() => {
      if (requestsInFlight.get(cacheKey) === request) {
        requestsInFlight.delete(cacheKey);
      }
  });

  requestsInFlight.set(cacheKey, request);
  return request;
}

module.exports = {
  acquireCachedNflGamecast,
  getNflGamecastCacheKey,
  getNflGamecastCacheTtl,
  isValidNflGamecast,
  nflGamecastCache,
  nflGamecastRequestsInFlight,
  NFL_GAMECAST_FINAL_CACHE_MS,
  NFL_GAMECAST_LIVE_CACHE_MS,
  NFL_GAMECAST_SCHEDULED_CACHE_MS
};
