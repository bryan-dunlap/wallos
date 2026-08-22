const test = require("node:test");
const assert = require("node:assert/strict");
const {
  acquireMlbDailySchedule,
  acquireSportsWidgetLeagues,
  buildSportsWidgetAcquisitionResponse,
  mlbDailyScheduleCache
} = require("../../backend/server");

function createRegistry(acquirers = {}) {
  return new Map(
    Object.entries(acquirers).map(([league, acquire]) => [
      league,
      { id: league, acquire }
    ])
  );
}

function createMlbSchedule(date = "2026-08-22") {
  return {
    sport: "MLB",
    date,
    sportsEvents: [{ eventId: 1, sport: "MLB" }],
    updatedAt: "2026-08-22T12:00:00.000Z"
  };
}

test("MLB compatibility fields remain available beside aggregate leagues", async () => {
  const schedule = createMlbSchedule();
  const response = await buildSportsWidgetAcquisitionResponse(
    {
      primaryLeague: "NFL",
      widget: { enabled: true, leagues: ["MLB"] }
    },
    schedule.date,
    createRegistry({ MLB: async () => schedule })
  );

  assert.equal(response.sport, "MLB");
  assert.deepEqual(response.sportsEvents, schedule.sportsEvents);
  assert.equal(response.leagues.length, 1);
  assert.equal(response.leagues[0].league, "MLB");
  assert.deepEqual(
    response.leagues[0].sportsEvents,
    schedule.sportsEvents
  );
});

test("widget acquisition is independent from primaryLeague", async () => {
  let mlbRequests = 0;
  const response = await buildSportsWidgetAcquisitionResponse(
    {
      primaryLeague: "NHL",
      widget: { enabled: true, leagues: ["MLB"] }
    },
    "2026-08-22",
    createRegistry({
      MLB: async () => {
        mlbRequests += 1;
        return createMlbSchedule();
      }
    })
  );

  assert.equal(mlbRequests, 1);
  assert.equal(response.sport, "MLB");
});

test("unsupported leagues return successful empty aggregate entries", async () => {
  const response = await buildSportsWidgetAcquisitionResponse(
    {
      primaryLeague: "MLB",
      widget: { enabled: true, leagues: ["NFL", "NBA"] }
    },
    "2026-08-22",
    createRegistry()
  );

  assert.equal(response.sport, null);
  assert.deepEqual(response.sportsEvents, []);
  assert.deepEqual(
    response.leagues.map(({ league, availability }) => ({
      league,
      availability
    })),
    [
      { league: "NFL", availability: "unsupported" },
      { league: "NBA", availability: "unsupported" }
    ]
  );
});

test("empty league selections do not acquire providers", async () => {
  let requests = 0;
  const response = await buildSportsWidgetAcquisitionResponse(
    {
      widget: { enabled: true, leagues: [] }
    },
    "2026-08-22",
    createRegistry({
      MLB: async () => {
        requests += 1;
        return createMlbSchedule();
      }
    })
  );

  assert.equal(requests, 0);
  assert.deepEqual(response.leagues, []);
  assert.deepEqual(response.sportsEvents, []);
});

test("disabled widget does not acquire configured leagues", async () => {
  let requests = 0;
  const response = await buildSportsWidgetAcquisitionResponse(
    {
      widget: { enabled: false, leagues: ["MLB"] }
    },
    "2026-08-22",
    createRegistry({
      MLB: async () => {
        requests += 1;
        return createMlbSchedule();
      }
    })
  );

  assert.equal(requests, 0);
  assert.deepEqual(response.leagues, []);
  assert.equal(response.sport, null);
});

test("provider failures remain isolated from successful leagues", async (t) => {
  t.mock.method(console, "error", () => {});

  const results = await acquireSportsWidgetLeagues(
    ["MLB", "NFL"],
    "2026-08-22",
    createRegistry({
      MLB: async () => createMlbSchedule(),
      NFL: async () => {
        throw new Error("offline");
      }
    })
  );

  assert.equal(results[0].availability, "available");
  assert.equal(results[1].availability, "unavailable");
});

test("direct and aggregate MLB acquisition share the existing cache", async (t) => {
  const requestedDate = "2098-08-22";
  const originalFetch = global.fetch;
  let requests = 0;

  mlbDailyScheduleCache.delete(requestedDate);
  global.fetch = async () => {
    requests += 1;
    return new Response(JSON.stringify({ dates: [] }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  };
  t.after(() => {
    global.fetch = originalFetch;
    mlbDailyScheduleCache.delete(requestedDate);
  });

  const direct = await acquireMlbDailySchedule(requestedDate);
  const aggregate = await buildSportsWidgetAcquisitionResponse(
    { widget: { enabled: true, leagues: ["MLB"] } },
    requestedDate
  );

  assert.equal(requests, 1);
  assert.deepEqual(aggregate.sportsEvents, direct.sportsEvents);
  assert.equal(aggregate.sport, "MLB");
});
