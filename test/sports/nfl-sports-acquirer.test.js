const test = require("node:test");
const assert = require("node:assert/strict");
const espnScoreboardFixture = require(
  "../fixtures/sports/espn-nfl-scoreboard.json"
);
const {
  acquireNflDailySchedule,
  NFL_LIVE_CACHE_MS,
  NFL_SCHEDULED_CACHE_MS
} = require("../../backend/sports/nfl-sports-acquirer");

function createFetch(payload, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  });
}

function fixtureWithEvents(...indexes) {
  return {
    events: indexes.map((index) =>
      structuredClone(espnScoreboardFixture.events[index])
    )
  };
}

test("acquires and normalizes a scheduled ESPN NFL game", async () => {
  const cache = new Map();
  let requestUrl = null;
  let requestOptions = null;
  const fetchImpl = async (url, options) => {
    requestUrl = url;
    requestOptions = options;
    return createFetch(fixtureWithEvents(0))();
  };
  const result = await acquireNflDailySchedule("2026-09-13", {
    cache,
    fetchImpl,
    now: () => Date.parse("2026-09-13T12:00:00.000Z")
  });
  const [game] = result.sportsEvents;

  assert.equal(result.sport, "NFL");
  assert.equal(result.date, "2026-09-13");
  assert.match(requestUrl, /scoreboard\?dates=20260913$/);
  assert.deepEqual(requestOptions.headers, { accept: "application/json" });
  assert.ok(requestOptions.signal instanceof AbortSignal);
  assert.equal(game.status.state, "scheduled");
  assert.equal(game.awayTeam.name, "Seattle Seahawks");
  assert.equal(game.awayTeam.id, "NFL:SEA");
  assert.equal(game.awayTeam.logo, "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png");
  assert.equal(game.awayTeam.record, "0-0");
  assert.equal(game.homeTeam.name, "San Francisco 49ers");
  assert.equal(game.venue.name, "Levi's Stadium");
  assert.equal(cache.get(result.date).ttl, NFL_SCHEDULED_CACHE_MS);
});

test("scheduled ESPN zero scores remain nullable", async () => {
  const result = await acquireNflDailySchedule("2026-09-13", {
    cache: new Map(),
    fetchImpl: createFetch(fixtureWithEvents(0))
  });
  const [game] = result.sportsEvents;

  assert.equal(game.awayTeam.score, null);
  assert.equal(game.homeTeam.score, null);
  assert.deepEqual(game.state.quarters.away, [null, null, null, null]);
  assert.deepEqual(game.state.quarters.home, [null, null, null, null]);
  assert.deepEqual(game.state.overtime, { away: null, home: null });
});

test("normalizes live halftime state and completed quarter scoring", async () => {
  const cache = new Map();
  const result = await acquireNflDailySchedule("2026-09-13", {
    cache,
    fetchImpl: createFetch(fixtureWithEvents(1))
  });
  const [game] = result.sportsEvents;

  assert.equal(game.status.state, "live");
  assert.equal(game.status.detail, "Halftime");
  assert.equal(game.state.period, 2);
  assert.equal(game.state.clock, "0:00");
  assert.equal(game.state.phase, "halftime");
  assert.deepEqual(game.state.quarters.away, [7, 3, null, null]);
  assert.deepEqual(game.state.quarters.home, [0, 7, null, null]);
  assert.equal(cache.get("2026-09-13").ttl, NFL_LIVE_CACHE_MS);
});

test("normalizes a live ESPN quarter and game clock", async () => {
  const payload = fixtureWithEvents(1);
  payload.events[0].status.period = 3;
  payload.events[0].status.clock = 501;
  payload.events[0].status.displayClock = "8:21";
  payload.events[0].status.type.name = "STATUS_IN_PROGRESS";
  payload.events[0].status.type.detail = "8:21 - 3rd Quarter";
  payload.events[0].status.type.shortDetail = "8:21 - 3rd";

  const result = await acquireNflDailySchedule("2026-09-13", {
    cache: new Map(),
    fetchImpl: createFetch(payload)
  });
  const [game] = result.sportsEvents;

  assert.equal(game.status.state, "live");
  assert.equal(game.status.detail, "8:21 - 3rd");
  assert.equal(game.state.period, 3);
  assert.equal(game.state.clock, "8:21");
  assert.equal(game.state.phase, null);
});

test("final overtime games retain totals and all scoring", async () => {
  const result = await acquireNflDailySchedule("2026-09-13", {
    cache: new Map(),
    fetchImpl: createFetch(fixtureWithEvents(2))
  });
  const [game] = result.sportsEvents;

  assert.equal(game.status.state, "final");
  assert.equal(game.status.detail, "Final/OT");
  assert.equal(game.awayTeam.score, 30);
  assert.equal(game.homeTeam.score, 27);
  assert.deepEqual(game.state.quarters.away, [7, 3, 7, 7]);
  assert.deepEqual(game.state.quarters.home, [3, 7, 7, 10]);
  assert.deepEqual(game.state.overtime, { away: 6, home: 0 });
  assert.equal(game.state.period, 5);
  assert.equal(game.state.phase, "overtime");
});

test("maps ESPN lifecycle and interruption statuses", async () => {
  const cases = [
    ["STATUS_SCHEDULED", "pre", "scheduled"],
    ["STATUS_IN_PROGRESS", "in", "live"],
    ["STATUS_FINAL", "post", "final"],
    ["STATUS_POSTPONED", "pre", "postponed"],
    ["STATUS_CANCELED", "post", "canceled"],
    ["STATUS_DELAYED", "pre", "delayed"],
    ["STATUS_SUSPENDED", "in", "suspended"]
  ];
  const baseEvent = espnScoreboardFixture.events[0];
  const payload = {
    events: cases.map(([name, state], index) => {
      const event = structuredClone(baseEvent);
      event.id = String(index + 1);
      event.status.type.name = name;
      event.status.type.state = state;
      event.competitions[0].status = event.status;
      return event;
    })
  };
  const result = await acquireNflDailySchedule("2026-09-13", {
    cache: new Map(),
    fetchImpl: createFetch(payload)
  });

  assert.deepEqual(
    result.sportsEvents.map((game) => game.status.state),
    cases.map(([, , expected]) => expected)
  );
});

test("returns stale last-known-good ESPN data after a transient failure", async (t) => {
  t.mock.method(console, "error", () => {});
  const cache = new Map();
  let currentTime = Date.parse("2026-09-13T12:00:00.000Z");

  const initial = await acquireNflDailySchedule("2026-09-13", {
    cache,
    fetchImpl: createFetch(fixtureWithEvents(0)),
    now: () => currentTime
  });

  currentTime += NFL_SCHEDULED_CACHE_MS + 1;

  const fallback = await acquireNflDailySchedule("2026-09-13", {
    cache,
    fetchImpl: createFetch({}, 503),
    now: () => currentTime
  });

  assert.deepEqual(fallback.sportsEvents, initial.sportsEvents);
  assert.equal(fallback.updatedAt, initial.updatedAt);
  assert.equal(fallback.stale, true);
});

test("throws safely when ESPN acquisition fails without cached data", async (t) => {
  t.mock.method(console, "error", () => {});

  await assert.rejects(
    acquireNflDailySchedule("2026-09-13", {
      cache: new Map(),
      fetchImpl: createFetch({}, 503)
    }),
    /ESPN NFL scoreboard request failed: 503/
  );
});
