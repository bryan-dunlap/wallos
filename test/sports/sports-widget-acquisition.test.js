const test = require("node:test");
const assert = require("node:assert/strict");
const espnMlbScoreboardFixture = require(
  "../fixtures/sports/espn-mlb-scoreboard.json"
);
const {
  acquireMlbDailySchedule,
  acquireMlbGamecastSchedule,
  acquireSportsWidgetLeagues,
  buildSportsWidgetAcquisitionResponse,
  mlbDailyScheduleCache,
  mlbGamecastScheduleCache,
  sportsWidgetAcquisitionRegistry
} = require("../../backend/server");
const {
  nflDailyScheduleCache
} = require("../../backend/sports/nfl-sports-acquirer");

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

function createEspnNflEvent() {
  return {
    id: "7001",
    date: "2097-09-07T20:25:00.000Z",
    status: {
      period: 0,
      displayClock: "0:00",
      type: {
        name: "STATUS_SCHEDULED",
        state: "pre",
        shortDetail: "9/7 - 1:25 PM PDT"
      }
    },
    competitions: [{
      date: "2097-09-07T20:25:00.000Z",
      competitors: [
        {
          homeAway: "away",
          score: "0",
          team: {
            id: "26",
            abbreviation: "SEA",
            displayName: "Seattle Seahawks",
            shortDisplayName: "Seahawks"
          },
          linescores: []
        },
        {
          homeAway: "home",
          score: "0",
          team: {
            id: "25",
            abbreviation: "SF",
            displayName: "San Francisco 49ers",
            shortDisplayName: "49ers"
          },
          linescores: []
        }
      ]
    }]
  };
}

function installProductionSportsFetch(t, handler) {
  const originalFetch = global.fetch;

  global.fetch = handler;
  t.after(() => {
    global.fetch = originalFetch;
  });
}

test("production registry acquires an NFL-only widget configuration", async (t) => {
  const requestedDate = "2097-09-07";
  nflDailyScheduleCache.delete(requestedDate);
  installProductionSportsFetch(t, async (url) => {
    assert.match(url, /site\.api\.espn\.com\/.*\/scoreboard\?dates=20970907/);

    return new Response(JSON.stringify({
      events: [createEspnNflEvent()]
    }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  });
  t.after(() => nflDailyScheduleCache.delete(requestedDate));

  const response = await buildSportsWidgetAcquisitionResponse(
    { widget: { enabled: true, leagues: ["NFL"] } },
    requestedDate
  );

  assert.equal(
    sportsWidgetAcquisitionRegistry.get("NFL").id,
    "NFL"
  );
  assert.equal(response.leagues.length, 1);
  assert.equal(response.leagues[0].league, "NFL");
  assert.equal(response.leagues[0].availability, "available");
  assert.equal(response.leagues[0].sportsEvents.length, 1);
  assert.equal(response.leagues[0].sportsEvents[0].sport, "NFL");
});

test("production registry returns MLB and NFL together", async (t) => {
  const requestedDate = "2097-09-08";
  mlbDailyScheduleCache.delete(requestedDate);
  nflDailyScheduleCache.delete(requestedDate);
  installProductionSportsFetch(t, async (url) => {
    if (url.includes("/baseball/mlb/scoreboard")) {
      return new Response(JSON.stringify({
        events: [espnMlbScoreboardFixture.events[0]]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    if (url.includes("/football/nfl/scoreboard")) {
      return new Response(JSON.stringify({
        events: [createEspnNflEvent()]
      }), {
        status: 200,
        headers: { "content-type": "application/json" }
      });
    }

    throw new Error(`Unexpected sports URL: ${url}`);
  });
  t.after(() => {
    mlbDailyScheduleCache.delete(requestedDate);
    nflDailyScheduleCache.delete(requestedDate);
  });

  const response = await buildSportsWidgetAcquisitionResponse(
    { widget: { enabled: true, leagues: ["MLB", "NFL"] } },
    requestedDate
  );

  assert.deepEqual(
    response.leagues.map(({ league, availability }) => ({
      league,
      availability
    })),
    [
      { league: "MLB", availability: "available" },
      { league: "NFL", availability: "available" }
    ]
  );
  assert.equal(
    response.leagues[0].sportsEvents[0].awayTeam.logo,
    "https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/sea.png"
  );
});

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
      widget: { enabled: true, leagues: ["NBA", "NHL"] }
    },
    "2026-08-22"
  );

  assert.equal(response.sport, null);
  assert.deepEqual(response.sportsEvents, []);
  assert.deepEqual(
    response.leagues.map(({ league, availability }) => ({
      league,
      availability
    })),
    [
      { league: "NBA", availability: "unsupported" },
      { league: "NHL", availability: "unsupported" }
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
  global.fetch = async (url) => {
    requests += 1;
    assert.match(url, /\/baseball\/mlb\/scoreboard\?dates=20980822$/);
    return new Response(JSON.stringify({ events: [] }), {
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

test("MLB Gamecast acquisition remains on StatsAPI live detail", async (t) => {
  const requestedDate = "2098-08-23";
  const requests = [];

  mlbGamecastScheduleCache.delete(requestedDate);
  installProductionSportsFetch(t, async (url) => {
    requests.push(url);

    if (url.includes("/api/v1/schedule?")) {
      return new Response(JSON.stringify({
        dates: [{
          games: [{
            gamePk: 9001,
            officialDate: requestedDate,
            gameDate: "2098-08-23T20:10:00.000Z",
            status: {
              abstractGameState: "Live",
              detailedState: "In Progress"
            },
            teams: {
              away: {
                team: { id: 136, abbreviation: "SEA", name: "Seattle Mariners" },
                leagueRecord: { wins: 70, losses: 58 },
                score: 3
              },
              home: {
                team: { id: 108, abbreviation: "LAA", name: "Los Angeles Angels" },
                leagueRecord: { wins: 60, losses: 68 },
                score: 2
              }
            },
            linescore: {
              currentInning: 7,
              inningHalf: "Bottom",
              outs: 1,
              balls: 2,
              strikes: 1,
              teams: {
                away: { runs: 3, hits: 8, errors: 0 },
                home: { runs: 2, hits: 6, errors: 1 }
              },
              offense: { batter: { id: 1, fullName: "Current Batter" } },
              defense: { pitcher: { id: 2, fullName: "Current Pitcher" } },
              innings: []
            },
            venue: { id: 12, name: "Angel Stadium" }
          }]
        }]
      }), { status: 200 });
    }

    if (url.includes("/api/v1.1/game/9001/feed/live")) {
      return new Response(JSON.stringify({
        liveData: {
          boxscore: {
            teams: {
              away: {
                players: {
                  ID1: {
                    stats: { batting: { hits: 1, atBats: 3 } },
                    seasonStats: { batting: { avg: ".275" } }
                  }
                }
              },
              home: {
                players: {
                  ID2: {
                    stats: { pitching: { numberOfPitches: 84, strikes: 55 } },
                    seasonStats: { pitching: { era: "3.42" } }
                  }
                }
              }
            }
          }
        }
      }), { status: 200 });
    }

    throw new Error(`Unexpected Gamecast URL: ${url}`);
  });
  t.after(() => mlbGamecastScheduleCache.delete(requestedDate));

  const result = await acquireMlbGamecastSchedule(requestedDate);
  const [game] = result.sportsEvents;

  assert.equal(game.linescore.count.balls, 2);
  assert.equal(game.linescore.batter.hits, 1);
  assert.equal(game.linescore.pitcher.pitches, 84);
  assert.equal(requests.length, 2);
  assert.match(requests[0], /statsapi\.mlb\.com\/api\/v1\/schedule/);
  assert.match(requests[1], /statsapi\.mlb\.com\/api\/v1\.1\/game\/9001\/feed\/live/);
  assert.doesNotMatch(requests.join(" "), /site\.api\.espn\.com/);
});
