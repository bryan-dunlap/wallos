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

test("renderer registry selects MLB without league logic in the queue", () => {
  const registry = new SportsWidgetRendererRegistry();
  const renderer = new MlbSportsWidgetRenderer();

  assert.equal(registry.get("MLB"), null);
  assert.equal(registry.register("mlb", renderer), true);
  assert.equal(registry.get("MLB"), renderer);
  assert.equal(registry.get("NFL"), null);
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
