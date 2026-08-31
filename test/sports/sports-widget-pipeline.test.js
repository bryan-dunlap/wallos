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
  normalizeSportsProviderTeam,
  normalizeSportsScheduleLeagues
} = require("../../frontend/providers/sports-provider");
const {
  adaptSportsWidgetLeagueEvents,
  getSportsWidgetPayloadLeagues,
  getSportsWidgetRenderer,
  normalizeSportsWidgetConfig
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
      shortName: "Mariners",
      abbreviation: "SEA",
      logo: "https://example.com/sea.svg",
      record: { wins: 70, losses: 58 },
      runs: 3,
      hits: 8,
      errors: 0
    },
    homeTeam: {
      name: "Los Angeles Angels",
      shortName: "Angels",
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
  const teams = {
    away: {
      id: "NFL:SEA",
      name: "Seattle Seahawks",
      shortName: "Seahawks",
      logo: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png"
    },
    home: {
      id: "NFL:SF",
      name: "San Francisco 49ers",
      shortName: "49ers",
      logo: "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png"
    }
  };
  const scenarios = {
    scheduled: {
      status: "scheduled",
      score: { away: null, home: null },
      quarter: null,
      gameClock: null
    },
    q1: {
      status: "live",
      score: { away: 7, home: 3 },
      quarter: 1,
      gameClock: "08:42",
      possession: "away",
      down: 2,
      distance: 6,
      yardLine: "SF 38",
      redZone: false
    },
    q2: {
      status: "live",
      score: { away: 10, home: 10 },
      quarter: 2,
      gameClock: "06:18",
      possession: "home",
      down: 3,
      distance: 4,
      yardLine: "SF 46",
      redZone: false
    },
    q4: {
      status: "live",
      score: { away: 24, home: 23 },
      quarter: 4,
      gameClock: "04:09",
      possession: "home",
      down: 2,
      distance: 8,
      yardLine: "SF 42",
      redZone: false
    },
    overtime: {
      status: "live",
      score: { away: 27, home: 27 },
      quarter: 5,
      gameClock: "07:22",
      possession: "home",
      down: 1,
      distance: 10,
      yardLine: "SF 25",
      phase: "overtime"
    },
    final: {
      status: "final",
      score: { away: 30, home: 27 },
      quarter: 4,
      gameClock: "0:00",
      phase: "final",
      result: "Seahawks win 30-27"
    }
  };
  const game = {
    startTime: "2026-09-13T02:10:00.000Z",
    teams,
    ...scenarios[scenarioId]
  };
  const score = game.score || {};
  const quarterScoring = {
    q1: { away: [7], home: [3] },
    q2: { away: [7, 3], home: [3, 7] },
    halftime: { away: [7, 10], home: [3, 10] },
    q3: { away: [7, 3, 10], home: [3, 7, 6] },
    q4: { away: [7, 3, 7, 7], home: [3, 7, 6, 7] },
    "red-zone": { away: [7, 3, 7, 7], home: [3, 7, 6, 7] },
    "two-minute": { away: [7, 3, 7, 7], home: [3, 7, 7, 10] },
    overtime: { away: [7, 3, 7, 10, 0], home: [3, 7, 7, 10, 0] },
    final: { away: [7, 3, 7, 13], home: [3, 7, 7, 10] }
  }[scenarioId] || { away: [], home: [] };

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
      period: game.quarter,
      clock: game.gameClock,
      quarters: quarterScoring,
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
  assert.equal(event.participants.away.name, "Mariners");
  assert.equal(event.participants.away.fullName, "Seattle Mariners");
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

test("MLB provider path preserves compact nicknames through every widget state", () => {
  const cases = [
    {
      status: { state: "Scheduled", detail: "Scheduled" },
      scheduledAt: "2099-08-22T18:10:00.000Z",
      fullName: "Seattle Mariners",
      shortName: "Mariners"
    },
    {
      status: { state: "Live", detail: "Bottom 7th" },
      fullName: "Boston Red Sox",
      shortName: "Red Sox"
    },
    {
      status: { state: "Final", detail: "Final" },
      fullName: "Toronto Blue Jays",
      shortName: "Blue Jays"
    }
  ];
  const adapter = new MlbSportsEventAdapter();
  const renderer = new MlbSportsWidgetRenderer();

  for (const entry of cases) {
    const sourceGame = createLegacyMlbGame({
      scheduledAt: entry.scheduledAt ||
        "2020-08-22T18:10:00.000Z",
      status: entry.status
    });
    sourceGame.awayTeam = normalizeSportsProviderTeam({
      ...sourceGame.awayTeam,
      name: entry.fullName,
      shortName: entry.shortName
    });
    sourceGame.homeTeam = normalizeSportsProviderTeam(
      sourceGame.homeTeam
    );

    const event = adapter.adaptGame(sourceGame);
    const presentation = renderer.render(event);

    assert.equal(event.participants.away.name, entry.shortName);
    assert.equal(event.participants.away.fullName, entry.fullName);
    assert.match(
      presentation.content,
      new RegExp(`>\\s*${entry.shortName}\\s*<`)
    );
    assert.doesNotMatch(
      presentation.content,
      new RegExp(entry.fullName)
    );
  }
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

test("SportsWidget configuration has no transient MLB default", () => {
  const initial = normalizeSportsWidgetConfig(null, false);
  const missingLeagues = normalizeSportsWidgetConfig({ enabled: true });
  const nflOnly = normalizeSportsWidgetConfig({
    enabled: true,
    leagues: ["NFL"]
  });

  assert.equal(initial.available, false);
  assert.equal(initial.enabled, false);
  assert.deepEqual([...initial.leagues], []);
  assert.deepEqual([...missingLeagues.leagues], []);
  assert.deepEqual([...nflOnly.leagues], ["NFL"]);
  assert.equal(nflOnly.leagues.has("MLB"), false);
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

test("MLB widget renderer uses shared compact team identities", () => {
  const adapter = new MlbSportsEventAdapter();
  const [event] = adapter.adaptGames([
    createLegacyMlbGame()
  ]);
  const renderer = new MlbSportsWidgetRenderer();
  event.participants.away.record = "70-58";
  event.participants.home.record = {
    wins: 60,
    losses: 68
  };
  const presentation = renderer.render(event);
  const scheduledEvent = adapter.adaptGame(createLegacyMlbGame({
    eventId: 54321,
    scheduledAt: "2099-08-22T18:10:00.000Z",
    status: { state: "Scheduled", detail: "Scheduled" },
    awayTeam: {
      ...createLegacyMlbGame().awayTeam,
      record: { wins: null, losses: null }
    },
    homeTeam: {
      ...createLegacyMlbGame().homeTeam,
      record: { wins: null, losses: null }
    }
  }));
  const scheduled = renderer.render(scheduledEvent);
  const finalEvent = adapter.adaptGame(createLegacyMlbGame({
    eventId: 54322,
    status: { state: "Final", detail: "Final" }
  }));
  const final = renderer.render(finalEvent);

  assert.equal(presentation.status, "Bottom 7th");
  assert.match(presentation.content, />\s*Mariners\s*</);
  assert.match(presentation.content, />\s*Angels\s*</);
  assert.doesNotMatch(presentation.content, /Seattle Mariners/);
  assert.doesNotMatch(presentation.content, /Los Angeles Angels/);
  assert.match(presentation.content, /sports-widget-team/);
  assert.match(presentation.content, /Mariners\s*<\/span>\s*<span class="team-identity-record">\s*\(70-58\)/);
  assert.match(presentation.content, /Angels\s*<\/span>\s*<span class="team-identity-record">\s*\(60-68\)/);
  assert.match(presentation.content, /sports-scoreboard-heading">R/);
  assert.doesNotMatch(
    presentation.content,
    /sports-widget-scheduled-scoreboard/
  );
  assert.match(presentation.content, /mlb-widget-team-away/);
  assert.match(presentation.content, /mlb-widget-team-home/);
  assert.equal(scheduled.status, "11:10 AM");
  assert.match(
    scheduled.content,
    /sports-widget-scheduled-scoreboard/
  );
  assert.match(scheduled.content, /sports-widget-team-away/);
  assert.match(scheduled.content, /sports-widget-team-home/);
  assert.match(scheduled.content, />\s*Mariners\s*</);
  assert.match(scheduled.content, />\s*Angels\s*</);
  assert.doesNotMatch(scheduled.content, /team-identity-record/);
  assert.equal(final.status, "Final");
  assert.doesNotMatch(
    final.content,
    /sports-widget-scheduled-scoreboard/
  );
  assert.match(final.content, /sports-scoreboard-heading">R/);
});

test("NFL adapter normalizes scheduled, live, final, and overtime fixtures", () => {
  const adapter = new NflSportsEventAdapter();
  const scheduled = adapter.adaptGame(createNflFixture("scheduled"));
  const live = adapter.adaptGame(createNflFixture("q4"));
  const overtime = adapter.adaptGame(createNflFixture("overtime"));
  const final = adapter.adaptGame(createNflFixture("final"));

  assert.equal(scheduled.status, "scheduled");
  assert.equal(live.status, "live");
  assert.equal(live.state.period, 4);
  assert.equal(live.state.clock, "04:09");
  assert.deepEqual(live.details.football.quarters.away, [7, 3, 7, 7]);
  assert.equal(live.details.football.possession, "home");
  assert.equal(overtime.details.football.phase, "overtime");
  assert.equal(overtime.state.period, 5);
  assert.equal(final.status, "final");
  assert.deepEqual(final.scores, { away: 30, home: 27 });
});

test("NFL adapter safely maps every backend lifecycle state", () => {
  const adapter = new NflSportsEventAdapter();
  const lifecycleStates = [
    ["scheduled", "scheduled"],
    ["in_progress", "live"],
    ["final", "final"],
    ["postponed", "scheduled"],
    ["canceled", "unknown"],
    ["delayed", "scheduled"],
    ["suspended", "unknown"],
    ["abandoned", "unknown"],
    ["unknown", "unknown"]
  ];

  for (const [backendStatus, expectedStatus] of lifecycleStates) {
    const fixture = createNflFixture("scheduled");
    fixture.status = {
      state: backendStatus,
      detail: `Provider status: ${backendStatus}`
    };
    const event = adapter.adaptGame(fixture);

    assert.ok(event, `${backendStatus} should remain renderable`);
    assert.equal(event.status, expectedStatus);
    assert.equal(
      event.state.statusDetail,
      `Provider status: ${backendStatus}`
    );
  }
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
  const finalEvent = adapter.adaptGame(createNflFixture("final"));
  finalEvent.participants.away.record = "11-6";
  finalEvent.participants.home.record = {
    wins: 12,
    losses: 5,
    ties: 0
  };
  const final = renderer.render(finalEvent);

  assert.equal(scheduled.status, "7:10 PM");
  assert.match(scheduled.content, /sports-widget-scheduled-scoreboard/);
  assert.doesNotMatch(
    scheduled.content,
    /nfl-widget-scoreboard-with-quarters/
  );
  assert.doesNotMatch(scheduled.content, /team-identity-record/);
  assert.equal(live.status, "Q1 08:42");
  assert.doesNotMatch(live.content, /sports-widget-scheduled-scoreboard/);
  assert.match(live.content, /nfl-widget-scoreboard-with-quarters/);
  assert.match(live.content, />\s*Q1\s*</);
  assert.match(live.content, />\s*TOT\s*</);
  assert.equal(overtime.status, "OT 07:22");
  assert.equal(final.status, "Final");
  assert.doesNotMatch(final.content, /sports-widget-scheduled-scoreboard/);
  assert.match(final.content, /nfl-widget-scoreboard-with-quarters/);
  assert.match(final.content, />\s*Seahawks\s*</);
  assert.doesNotMatch(final.content, /Seattle Seahawks/);
  assert.match(
    final.content,
    /Seahawks\s*<\/span>\s*<span class="team-identity-record">\s*\(11-6\)/
  );
  assert.match(
    final.content,
    /49ers\s*<\/span>\s*<span class="team-identity-record">\s*\(12-5\)/
  );
  assert.match(final.content, /team-identity-record/);
  assert.match(final.content, /sports-widget-team/);
  assert.match(final.content, />\s*30\s*</);
  assert.match(final.content, />\s*Q1\s*</);
  assert.match(final.content, />\s*TOT\s*</);
});

test("MLB and NFL scheduled games use the identical shared presentation", () => {
  const mlbEvent = new MlbSportsEventAdapter().adaptGame(
    createLegacyMlbGame({
      scheduledAt: "2099-08-22T18:10:00.000Z",
      status: { state: "Scheduled", detail: "Scheduled" }
    })
  );
  const nflEvent = new NflSportsEventAdapter().adaptGame(
    createNflFixture("scheduled")
  );
  const participants = {
    away: {
      name: "Seattle Mariners",
      logo: "https://example.com/away.svg",
      record: { wins: 70, losses: 58 }
    },
    home: {
      name: "Los Angeles Angels",
      logo: "https://example.com/home.svg",
      record: "60-68"
    }
  };

  mlbEvent.participants = participants;
  nflEvent.participants = participants;

  const mlb = new MlbSportsWidgetRenderer().render(mlbEvent);
  const nfl = new NflSportsWidgetRenderer().render(nflEvent);

  assert.equal(mlb.content, nfl.content);
  assert.match(mlb.content, /sports-widget-scheduled-scoreboard/);
  assert.match(mlb.content, /sports-widget-team-away/);
  assert.match(mlb.content, /sports-widget-team-home/);
  assert.match(mlb.content, /team-identity-logo-image/);
  assert.match(mlb.content, /team-identity-name/);
  assert.match(mlb.content, /team-identity-record/);
  assert.doesNotMatch(mlb.content, /mlb-widget-scoreboard/);
  assert.doesNotMatch(mlb.content, /nfl-widget-scoreboard/);
});

test("shared presentation uses complete nicknames without team locations", () => {
  const game = createNflFixture("scheduled");
  game.awayTeam = {
    ...game.awayTeam,
    name: "Kansas City Chiefs",
    shortName: "Chiefs"
  };
  game.homeTeam = {
    ...game.homeTeam,
    name: "New York Yankees",
    shortName: "Yankees"
  };
  const event = new NflSportsEventAdapter().adaptGame(game);

  const presentation = new NflSportsWidgetRenderer().render(event);

  assert.equal(event.participants.away.name, "Chiefs");
  assert.equal(event.participants.away.fullName, "Kansas City Chiefs");
  assert.equal(event.participants.home.name, "Yankees");
  assert.equal(event.participants.home.fullName, "New York Yankees");
  assert.match(presentation.content, />\s*Chiefs\s*</);
  assert.match(presentation.content, />\s*Yankees\s*</);
  assert.doesNotMatch(presentation.content, /Kansas City Chiefs/);
  assert.doesNotMatch(presentation.content, /New York Yankees/);
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
