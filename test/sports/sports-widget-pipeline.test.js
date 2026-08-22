const test = require("node:test");
const assert = require("node:assert/strict");
const {
  createNormalizedSportsEvent,
  isNormalizedSportsEvent
} = require("../../frontend/sports/sports-event-contract");
const {
  MlbSportsEventAdapter
} = require("../../frontend/sports/mlb-sports-event-adapter");
const {
  SportsWidgetQueue
} = require("../../frontend/sports/sports-widget-queue");
const {
  filterSportsWidgetEvents
} = require(
  "../../frontend/sports/sports-widget-event-filter"
);
const {
  SportsWidgetRendererRegistry
} = require(
  "../../frontend/sports/sports-widget-renderer-registry"
);
const {
  MlbSportsWidgetRenderer
} = require("../../frontend/sports/mlb-sports-widget-renderer");
const {
  NflSportsEventAdapter
} = require("../../frontend/sports/nfl-sports-event-adapter");
const {
  NflSportsWidgetRenderer
} = require("../../frontend/sports/nfl-sports-widget-renderer");
const {
  sportsSimulationProfileRegistry
} = require(
  "../../frontend/providers/sports-simulation-profile-registry"
);
const {
  normalizeSportsScheduleLeagues
} = require("../../frontend/providers/sports-provider");
const {
  adaptSportsWidgetLeagueEvents,
  getSportsWidgetPayloadLeagues,
  getSportsWidgetRenderer
} = require("../../frontend/widgets/sports-widget");

function createLegacyMlbGame(overrides = {}) {
  return {
    eventId: 12345,
    scheduledAt: "2020-08-22T18:10:00.000Z",
    scheduledTime: "11:10 AM",
    status: {
      state: "Live",
      detail: "In Progress"
    },
    awayTeam: {
      name: "Seattle Mariners",
      abbreviation: "SEA",
      logo: "https://example.com/sea.svg",
      record: { wins: 70, losses: 58 },
      runs: 3,
      hits: 8,
      errors: 0
    },
    homeTeam: {
      name: "Los Angeles Angels",
      abbreviation: "LAA",
      logo: "https://example.com/laa.svg",
      record: { wins: 60, losses: 68 },
      runs: 2,
      hits: 6,
      errors: 1
    },
    linescore: {
      inning: { half: "Bottom", number: 7 },
      innings: [{ number: 1, away: 0, home: 0 }],
      outs: 1,
      count: { balls: 2, strikes: 1 },
      bases: { first: false, second: true, third: false },
      batter: { name: "Julio Rodríguez" },
      pitcher: { name: "Logan Gilbert" }
    },
    ...overrides
  };
}

function createNflFixture(scenarioId) {
  const facts = sportsSimulationProfileRegistry.createFacts(
    "NFL",
    scenarioId
  );
  const game = facts.game;
  const score = game.score || {};

  return {
    eventId: `simulation:NFL:${scenarioId}`,
    scheduledAt: game.startTime,
    scheduledTime: "7:10 PM",
    status: {
      state: game.status,
      detail: scenarioId
    },
    awayTeam: {
      ...game.teams.away,
      abbreviation: game.teams.away.id.replace("NFL:", ""),
      score: score.away ?? null
    },
    homeTeam: {
      ...game.teams.home,
      abbreviation: game.teams.home.id.replace("NFL:", ""),
      score: score.home ?? null
    },
    state: {
      quarter: game.quarter,
      gameClock: game.gameClock,
      phase: game.phase,
      possession: game.possession,
      down: game.down,
      distance: game.distance,
      yardLine: game.yardLine,
      redZone: game.redZone,
      timeouts: game.timeouts
    },
    result: game.result
  };
}

test("normalized Sports event contract stays league-neutral", () => {
  const event = createNormalizedSportsEvent({
    league: "mlb",
    id: "game-1",
    type: "game",
    status: "live",
    participants: {
      away: { name: "Away" },
      home: { name: "Home" }
    },
    scores: { away: 3, home: 2 },
    state: { clock: null },
    details: { baseball: { outs: 1 } }
  });

  assert.equal(event.league, "MLB");
  assert.equal(event.type, "game");
  assert.deepEqual(event.scores, { away: 3, home: 2 });
  assert.equal(event.details.baseball.outs, 1);
  assert.equal(isNormalizedSportsEvent(event), true);
  assert.equal(createNormalizedSportsEvent({ league: "MLB" }), null);
});

test("MLB adapter contains baseball interpretation behind the contract", () => {
  const [event] = new MlbSportsEventAdapter().adaptGames([
    createLegacyMlbGame()
  ]);

  assert.equal(event.league, "MLB");
  assert.equal(event.id, "12345");
  assert.equal(event.status, "live");
  assert.equal(event.participants.away.name, "Seattle Mariners");
  assert.deepEqual(event.scores, { away: 3, home: 2 });
  assert.deepEqual(event.details.baseball.inning, {
    half: "Bottom",
    number: 7
  });
  assert.deepEqual(event.details.baseball.count, {
    balls: 2,
    strikes: 1
  });
  assert.equal(event.details.baseball.batter.name, "Julio Rodríguez");
});

test("Sports Widget queue owns ordering, advancement, and empty state", () => {
  const adapter = new MlbSportsEventAdapter();
  const events = adapter.adaptGames([
    createLegacyMlbGame({ eventId: 1 }),
    createLegacyMlbGame({ eventId: 2 })
  ]);
  const queue = new SportsWidgetQueue();

  assert.equal(queue.current(), null);
  queue.replace(events);
  assert.equal(queue.size(), 2);
  assert.equal(queue.current().id, "1");
  assert.equal(queue.next().id, "2");
  assert.equal(queue.next().id, "1");
  queue.clear();
  assert.equal(queue.size(), 0);
  assert.equal(queue.current(), null);
});

test("Sports Widget configuration filters normalized events before queueing", () => {
  const events = new MlbSportsEventAdapter().adaptGames([
    createLegacyMlbGame({ eventId: 1 })
  ]);

  assert.equal(filterSportsWidgetEvents(events, {
    enabled: true,
    leagues: new Set(["MLB"])
  }).length, 1);
  assert.deepEqual(filterSportsWidgetEvents(events, {
    enabled: true,
    leagues: new Set()
  }), []);
  assert.deepEqual(filterSportsWidgetEvents(events, {
    enabled: true,
    leagues: new Set(["NFL"])
  }), []);
  assert.deepEqual(filterSportsWidgetEvents(events, {
    enabled: false,
    leagues: new Set(["MLB"])
  }), []);
});

test("Sports Widget filtering safely handles future league events", () => {
  const futureEvent = createNormalizedSportsEvent({
    league: "FUTURE",
    id: "future-1",
    type: "game",
    status: "scheduled",
    participants: {
      away: { name: "Future Away" },
      home: { name: "Future Home" }
    },
    scores: {},
    state: {},
    details: {}
  });

  assert.deepEqual(filterSportsWidgetEvents([futureEvent], {
    enabled: true,
    leagues: ["MLB"]
  }), []);
  assert.deepEqual(filterSportsWidgetEvents([futureEvent], {
    enabled: true,
    leagues: ["future"]
  }), [futureEvent]);
});

test("SportsProvider maps aggregate MLB payloads and preserves metadata", () => {
  const leagues = normalizeSportsScheduleLeagues({
    leagues: [{
      league: "mlb",
      availability: "available",
      sportsEvents: [createLegacyMlbGame()],
      updatedAt: "2026-08-22T12:00:00.000Z",
      stale: true
    }]
  }, (game) => ({ ...game, providerNormalized: true }));

  assert.equal(leagues[0].league, "MLB");
  assert.equal(leagues[0].games[0].providerNormalized, true);
  assert.equal(leagues[0].availability, "available");
  assert.equal(leagues[0].updatedAt, "2026-08-22T12:00:00.000Z");
  assert.equal(leagues[0].stale, true);
});

test("SportsProvider treats an empty aggregate as authoritative", () => {
  assert.deepEqual(normalizeSportsScheduleLeagues({
    leagues: [],
    sport: "MLB",
    sportsEvents: [createLegacyMlbGame()]
  }), []);
});

test("SportsProvider temporarily supports the legacy schedule shape", () => {
  const leagues = normalizeSportsScheduleLeagues({
    sport: "MLB",
    sportsEvents: [createLegacyMlbGame()],
    updatedAt: "2026-08-22T12:00:00.000Z",
    stale: true
  });

  assert.equal(leagues.length, 1);
  assert.equal(leagues[0].league, "MLB");
  assert.equal(leagues[0].games.length, 1);
  assert.equal(leagues[0].stale, true);
});

test("SportsWidget flattens available leagues in league and game order", () => {
  const adapters = new Map([
    ["MLB", {
      adaptGames: (games) => games.map((game) => ({
        league: "MLB",
        id: game.id
      }))
    }],
    ["NFL", {
      adaptGames: (games) => games.map((game) => ({
        league: "NFL",
        id: game.id
      }))
    }]
  ]);
  const events = adaptSportsWidgetLeagueEvents([
    {
      league: "MLB",
      availability: "available",
      games: [{ id: "mlb-1" }, { id: "mlb-2" }]
    },
    {
      league: "NFL",
      availability: "available",
      games: [{ id: "nfl-1" }]
    }
  ], adapters);

  assert.deepEqual(events.map((event) => event.id), [
    "mlb-1",
    "mlb-2",
    "nfl-1"
  ]);
});

test("SportsWidget skips unsupported, unavailable, and missing adapters", () => {
  const adapters = new Map([
    ["MLB", { adaptGames: (games) => games }]
  ]);
  const events = adaptSportsWidgetLeagueEvents([
    { league: "MLB", availability: "available", games: [{ id: 1 }] },
    { league: "NFL", availability: "unsupported", games: [{ id: 2 }] },
    { league: "NBA", availability: "unavailable", games: [{ id: 3 }] },
    { league: "NHL", availability: "available", games: [{ id: 4 }] }
  ], adapters);

  assert.deepEqual(events, [{ id: 1 }]);
});

test("SportsWidget treats empty aggregate payloads as authoritative", () => {
  assert.deepEqual(getSportsWidgetPayloadLeagues({
    leagues: [],
    sport: "MLB",
    games: [createLegacyMlbGame()]
  }), []);
});

test("SportsWidget temporarily supports legacy event payloads", () => {
  const games = [createLegacyMlbGame()];
  const leagues = getSportsWidgetPayloadLeagues({
    sport: "MLB",
    games,
    availability: "available"
  });

  assert.deepEqual(leagues, [{
    league: "MLB",
    games,
    availability: "available"
  }]);
});

test("aggregate events continue through configuration filtering", () => {
  const events = adaptSportsWidgetLeagueEvents([
    {
      league: "MLB",
      availability: "available",
      games: [createLegacyMlbGame()]
    }
  ], new Map([["MLB", new MlbSportsEventAdapter()]]));

  assert.equal(filterSportsWidgetEvents(events, {
    enabled: true,
    leagues: ["MLB"]
  }).length, 1);
  assert.deepEqual(filterSportsWidgetEvents(events, {
    enabled: true,
    leagues: ["NFL"]
  }), []);
});

test("renderer registry selects MLB without league logic in the queue", () => {
  const registry = new SportsWidgetRendererRegistry();
  const renderer = new MlbSportsWidgetRenderer();

  assert.equal(registry.get("MLB"), null);
  assert.equal(registry.register("mlb", renderer), true);
  assert.equal(registry.get("MLB"), renderer);
  assert.equal(registry.get("NFL"), null);
  assert.equal(
    getSportsWidgetRenderer(registry, { league: "MLB" }),
    renderer
  );
});

test("MLB widget renderer preserves scoreboard presentation", () => {
  const [event] = new MlbSportsEventAdapter().adaptGames([
    createLegacyMlbGame()
  ]);
  const presentation = new MlbSportsWidgetRenderer().render(event);

  assert.equal(presentation.status, "Bottom 7th");
  assert.match(presentation.content, /Seattle Mariners/);
  assert.match(presentation.content, /Los Angeles Angels/);
  assert.match(presentation.content, /sports-scoreboard-heading">R/);
  assert.match(presentation.content, /sports-scoreboard-team-away/);
  assert.match(presentation.content, /sports-scoreboard-team-home/);
});

test("NFL adapter normalizes scheduled, live, final, and overtime fixtures", () => {
  const adapter = new NflSportsEventAdapter();
  const scheduled = adapter.adaptGame(createNflFixture("scheduled"));
  const live = adapter.adaptGame(createNflFixture("q4"));
  const overtime = adapter.adaptGame(createNflFixture("overtime"));
  const final = adapter.adaptGame(createNflFixture("final"));

  assert.equal(scheduled.status, "scheduled");
  assert.equal(live.status, "live");
  assert.equal(live.details.football.quarter, 4);
  assert.equal(live.details.football.possession, "home");
  assert.equal(overtime.details.football.phase, "overtime");
  assert.equal(overtime.details.football.quarter, 5);
  assert.equal(final.status, "final");
  assert.deepEqual(final.scores, { away: 30, home: 27 });
});

test("NFL renderer supports scheduled, live fallback, overtime, and final", () => {
  const adapter = new NflSportsEventAdapter();
  const renderer = new NflSportsWidgetRenderer();
  const scheduled = renderer.render(
    adapter.adaptGame(createNflFixture("scheduled"))
  );
  const live = renderer.render(
    adapter.adaptGame(createNflFixture("q1"))
  );
  const overtime = renderer.render(
    adapter.adaptGame(createNflFixture("overtime"))
  );
  const final = renderer.render(
    adapter.adaptGame(createNflFixture("final"))
  );

  assert.equal(scheduled.status, "7:10 PM");
  assert.equal(live.status, "Q1 08:42");
  assert.equal(overtime.status, "OT 07:22");
  assert.equal(final.status, "Final");
  assert.match(final.content, /Seattle Seahawks/);
  assert.match(final.content, />30</);
});

test("NFL renderer registers through the existing league registry", () => {
  const registry = new SportsWidgetRendererRegistry();
  const renderer = new NflSportsWidgetRenderer();

  assert.equal(registry.register("NFL", renderer), true);
  assert.equal(registry.get("NFL"), renderer);
});

test("normalized MLB and NFL events coexist in the existing queue", () => {
  const mlbEvent = new MlbSportsEventAdapter().adaptGame(
    createLegacyMlbGame({ eventId: 1 })
  );
  const nflEvent = new NflSportsEventAdapter().adaptGame(
    createNflFixture("q2")
  );
  const queue = new SportsWidgetQueue();

  queue.replace([mlbEvent, nflEvent]);

  assert.equal(queue.size(), 2);
  assert.equal(queue.current().league, "MLB");
  assert.equal(queue.next().league, "NFL");
});
