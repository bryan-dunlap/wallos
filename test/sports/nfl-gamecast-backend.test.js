const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createNflDailyScheduleHandler,
  createNflGamecastHandler,
  sportsWidgetAcquisitionRegistry
} = require("../../backend/server");
const {
  acquireNflDailySchedule
} = require("../../backend/sports/nfl-sports-acquirer");
const {
  acquireCachedNflGamecast,
  getNflGamecastCacheKey,
  getNflGamecastCacheTtl,
  NFL_GAMECAST_FINAL_CACHE_MS,
  NFL_GAMECAST_LIVE_CACHE_MS,
  NFL_GAMECAST_SCHEDULED_CACHE_MS
} = require("../../backend/sports/nfl-gamecast-cache");

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    }
  };
}

function createGamecast(status = "live", eventId = "401772831") {
  return {
    status,
    eventId,
    teams: {
      away: { providerId: "26", shortName: "Seahawks" },
      home: { providerId: "25", shortName: "49ers" }
    },
    score: { away: 24, home: 23 },
    gameState: { quarter: 4, clock: "2:48", phase: "regulation" },
    possession: { team: "away", providerTeamId: "26" },
    situation: { down: 3, distance: 4, yardLine: 82 },
    drive: { team: "away", plays: 6, yards: 42 },
    lastPlay: { description: "Pass complete for four yards." },
    lineScore: {
      periods: [1, 2, 3, 4],
      away: [7, 7, 3, 7],
      home: [3, 10, 3, 7],
      overtime: false
    }
  };
}

test("NFL daily route acquires a date independently of widget configuration", async () => {
  const calls = [];
  const schedule = {
    sport: "NFL",
    date: "2026-09-07",
    sportsEvents: [{ eventId: "401772831" }]
  };
  const handler = createNflDailyScheduleHandler(async (date) => {
    calls.push(date);
    return schedule;
  });
  const response = createResponse();

  await handler({ query: { date: "2026-09-07" } }, response);

  assert.deepEqual(calls, ["2026-09-07"]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body, schedule);
});

test("NFL daily route rejects a missing or invalid date", async () => {
  let calls = 0;
  const handler = createNflDailyScheduleHandler(async () => {
    calls += 1;
  });

  for (const date of [undefined, "09-07-2026", ["2026-09-07"]]) {
    const response = createResponse();
    await handler({ query: { date } }, response);
    assert.equal(response.statusCode, 400);
  }

  assert.equal(calls, 0);
});

test("NFL Gamecast route propagates date/event ID and returns the cache contract", async () => {
  const calls = [];
  const cache = new Map();
  const gamecast = createGamecast();
  const handler = createNflGamecastHandler({
    cache,
    requestsInFlight: new Map(),
    now: () => Date.UTC(2026, 8, 7, 20, 0, 0),
    acquire: async (date, eventId) => {
      calls.push({ date, eventId });
      return gamecast;
    }
  });
  const response = createResponse();

  await handler({
    query: { date: "2026-09-07", eventId: 401772831 }
  }, response);

  assert.deepEqual(calls, [{
    date: "2026-09-07",
    eventId: "401772831"
  }]);
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.body.gamecast, gamecast);
  assert.equal(response.body.stale, false);
  assert.equal(response.body.updatedAt, "2026-09-07T20:00:00.000Z");
  assert.equal("type" in response.body, false);
});

test("NFL Gamecast route validates date and scalar event ID", async () => {
  let calls = 0;
  const handler = createNflGamecastHandler({
    acquire: async () => {
      calls += 1;
      return createGamecast();
    }
  });
  const queries = [
    { date: "bad", eventId: "401772831" },
    { date: "2026-09-07" },
    { date: "2026-09-07", eventId: ["401772831"] },
    { date: "2026-09-07", eventId: {} }
  ];

  for (const query of queries) {
    const response = createResponse();
    await handler({ query }, response);
    assert.equal(response.statusCode, 400);
  }

  assert.equal(calls, 0);
});

test("NFL Gamecast cache uses state-specific freshness windows", () => {
  assert.equal(
    getNflGamecastCacheTtl(createGamecast("live")),
    NFL_GAMECAST_LIVE_CACHE_MS
  );
  assert.equal(
    getNflGamecastCacheTtl(createGamecast("scheduled")),
    NFL_GAMECAST_SCHEDULED_CACHE_MS
  );
  assert.equal(
    getNflGamecastCacheTtl(createGamecast("final")),
    NFL_GAMECAST_FINAL_CACHE_MS
  );
});

test("NFL Gamecast cache reuses fresh data and deduplicates in-flight requests", async () => {
  const cache = new Map();
  const requestsInFlight = new Map();
  let calls = 0;
  let release;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const options = {
    cache,
    requestsInFlight,
    now: () => 1000,
    acquire: async () => {
      calls += 1;
      await pending;
      return createGamecast();
    }
  };
  const first = acquireCachedNflGamecast(
    "2026-09-07",
    "401772831",
    options
  );
  const second = acquireCachedNflGamecast(
    "2026-09-07",
    "401772831",
    options
  );

  release();
  const [firstResult, secondResult] = await Promise.all([first, second]);
  const cachedResult = await acquireCachedNflGamecast(
    "2026-09-07",
    "401772831",
    options
  );

  assert.equal(calls, 1);
  assert.deepEqual(secondResult, firstResult);
  assert.deepEqual(cachedResult, firstResult);
});

test("NFL Gamecast cache serves last-known-good data stale after refresh failure", async () => {
  const cache = new Map();
  const requestsInFlight = new Map();
  let now = 0;
  let shouldFail = false;
  const options = {
    cache,
    requestsInFlight,
    now: () => now,
    acquire: async () => {
      if (shouldFail) throw new Error("ESPN unavailable");
      return createGamecast();
    }
  };
  const fresh = await acquireCachedNflGamecast(
    "2026-09-07",
    "401772831",
    options
  );
  now = NFL_GAMECAST_LIVE_CACHE_MS + 1;
  shouldFail = true;
  const stale = await acquireCachedNflGamecast(
    "2026-09-07",
    "401772831",
    options
  );

  assert.equal(stale.stale, true);
  assert.deepEqual(stale.gamecast, fresh.gamecast);
  assert.equal(stale.updatedAt, fresh.updatedAt);
});

test("malformed acquisition cannot replace last-known-good cache data", async () => {
  const cache = new Map();
  const requestsInFlight = new Map();
  let now = 0;
  let result = createGamecast();
  const options = {
    cache,
    requestsInFlight,
    now: () => now,
    acquire: async () => result
  };
  await acquireCachedNflGamecast(
    "2026-09-07",
    "401772831",
    options
  );
  const key = getNflGamecastCacheKey("2026-09-07", "401772831");
  const originalEntry = cache.get(key);
  now = NFL_GAMECAST_LIVE_CACHE_MS + 1;
  result = { status: "live", eventId: "401772831" };
  const stale = await acquireCachedNflGamecast(
    "2026-09-07",
    "401772831",
    options
  );

  assert.equal(stale.stale, true);
  assert.equal(cache.get(key), originalEntry);
});

test("malformed acquisition without cached data fails and is not cached", async () => {
  const cache = new Map();

  await assert.rejects(
    acquireCachedNflGamecast(
      "2026-09-07",
      "401772831",
      {
        cache,
        requestsInFlight: new Map(),
        acquire: async () => ({
          status: "live",
          eventId: "401772831"
        })
      }
    ),
    /malformed data/
  );
  assert.equal(cache.size, 0);
});

test("NFL Gamecast acquisition failure without cache becomes a backend error", async () => {
  const handler = createNflGamecastHandler({
    cache: new Map(),
    requestsInFlight: new Map(),
    acquire: async () => {
      throw new Error("ESPN unavailable");
    }
  });
  const response = createResponse();

  await handler({
    query: { date: "2026-09-07", eventId: "401772831" }
  }, response);

  assert.equal(response.statusCode, 500);
  assert.deepEqual(response.body, {
    error: "NFL Gamecast is temporarily unavailable."
  });
});

test("compact NFL aggregate keeps its existing acquisition provider", () => {
  assert.equal(
    sportsWidgetAcquisitionRegistry.get("NFL").acquire,
    acquireNflDailySchedule
  );
});
