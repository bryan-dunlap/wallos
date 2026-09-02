const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  NflGamecastLifecycleState
} = require(
  "../../frontend/providers/nfl-gamecast-lifecycle-state"
);

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadProvider(overrides = {}) {
  const source = fs.readFileSync(
    path.join(
      PROJECT_ROOT,
      "frontend/providers/nfl-gamecast-provider.js"
    ),
    "utf8"
  );
  const timers = [];
  const windowListeners = new Map();
  const documentListeners = new Map();
  const published = [];
  const context = vm.createContext({
    console: { error: () => {} },
    encodeURIComponent,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => {
      timer.cleared = true;
    },
    window: {
      mosaicApp: {
        eventBus: {
          subscribe: () => () => {},
          publish: (event) => published.push(event)
        }
      },
      addEventListener: (type, callback) => {
        windowListeners.set(type, callback);
      },
      removeEventListener: (type) => windowListeners.delete(type)
    },
    document: {
      visibilityState: "visible",
      addEventListener: (type, callback) => {
        documentListeners.set(type, callback);
      },
      removeEventListener: (type) => documentListeners.delete(type)
    },
    ...overrides
  });

  vm.runInContext(
    source + "; this.LoadedClass = NflGamecastProvider;",
    context
  );

  return {
    Provider: context.LoadedClass,
    context,
    timers,
    windowListeners,
    documentListeners,
    published
  };
}

function facts(overrides = {}) {
  return {
    status: "available",
    favoriteTeam: {
      id: "NFL:SEA",
      name: "Seattle Seahawks",
      shortName: "Seahawks",
      league: "NFL",
      sport: "football"
    },
    game: {
      status: "live",
      eventId: "401772831",
      eventDate: "2026-09-07",
      teams: {
        away: { id: "NFL:SEA", name: "Seattle Seahawks" },
        home: { id: "NFL:SF", name: "San Francisco 49ers" }
      },
      score: { away: 24, home: 23 },
      gamecast: {
        type: "football-game",
        status: "live",
        eventId: "401772831"
      },
      ...overrides
    }
  };
}

function candidate(overrides = {}) {
  return {
    id: "sports:live:NFL:SEA",
    source: "sports",
    type: "sports.live-game",
    mode: "active",
    payload: {
      type: "football-game",
      eventId: "401772831"
    },
    ...overrides
  };
}

function detailedGamecast(status = "live") {
  return {
    status,
    eventId: "401772831",
    teams: {
      away: { id: "NFL:SEA", providerId: "26", name: "Seahawks" },
      home: { id: "NFL:SF", providerId: "25", name: "49ers" }
    },
    score: { away: 24, home: 23 },
    gameState: { quarter: 4, clock: "2:48", phase: status },
    possession: { team: "away", providerTeamId: "26" },
    situation: { down: 3, distance: 4, yardLine: 82 },
    drive: { team: "away", plays: 8, yards: 62 },
    lastPlay: { description: "Pass complete." },
    lineScore: {
      periods: [1, 2, 3, 4],
      away: [7, 3, 7, 7],
      home: [3, 7, 6, 7],
      overtime: { away: null, home: null }
    }
  };
}

async function settle() {
  await new Promise((resolve) => setImmediate(resolve));
}

test("matching display fetches immediately with exact event date and ID", async () => {
  const requests = [];
  const { Provider, published } = loadProvider();
  const provider = new Provider();
  const gamecast = detailedGamecast();

  provider.fetchGamecast = async (eventDate, eventId) => {
    requests.push({ eventDate, eventId });
    return {
      gamecast,
      updatedAt: "2026-09-07T20:00:00.000Z",
      stale: false
    };
  };

  provider.handleSportsFacts(facts());
  assert.equal(requests.length, 0);
  provider.handleHeroDisplay(candidate());
  assert.equal(requests.length, 1);
  await settle();

  assert.deepEqual(requests, [{
    eventDate: "2026-09-07",
    eventId: "401772831"
  }]);
  assert.equal(published.length, 1);
  assert.equal(published[0].payload.favoriteTeam.id, "NFL:SEA");
  assert.equal(published[0].payload.game.eventId, "401772831");
  assert.equal(published[0].payload.game.gamecast.type, "football-game");
  assert.deepEqual(
    JSON.parse(JSON.stringify({
      ...published[0].payload.game.gamecast,
      type: undefined
    })),
    JSON.parse(JSON.stringify(gamecast))
  );
});

test("matching live display schedules five-second refresh without overlap", async () => {
  let release;
  let calls = 0;
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { Provider, timers } = loadProvider();
  const provider = new Provider();

  provider.fetchGamecast = async () => {
    calls += 1;
    await pending;
    return { gamecast: detailedGamecast(), stale: false };
  };
  provider.factsByFavoriteId.set("NFL:SEA", facts());
  provider.displayedCandidate = candidate();
  provider.activeLifecycleKey = provider.getLifecycleKey();
  const version = provider.lifecycleVersion;
  const cycle = provider.refresh(version);
  provider.refresh(version);

  assert.equal(calls, 1);
  release();
  await cycle;
  assert.equal(timers.length, 1);
  assert.equal(timers[0].delay, 5000);
});

test("unrelated or MLB Hero display stops the NFL timer", async () => {
  const { Provider, timers } = loadProvider();
  const provider = new Provider();
  provider.fetchGamecast = async () => ({
    gamecast: detailedGamecast(),
    stale: false
  });
  provider.handleSportsFacts(facts());
  provider.handleHeroDisplay(candidate());
  await settle();
  const timer = timers.at(-1);

  provider.handleHeroDisplay({
    id: "sports:live:SEA",
    source: "sports",
    type: "sports.live-game",
    mode: "active",
    payload: { type: "baseball-game" }
  });

  assert.equal(timer.cleared, true);
  assert.equal(provider.activeLifecycleKey, null);
});

test("event change invalidates late detail and starts the matching lifecycle", async () => {
  let release;
  const requests = [];
  const pending = new Promise((resolve) => {
    release = resolve;
  });
  const { Provider, published } = loadProvider();
  const provider = new Provider();
  provider.fetchGamecast = async (_date, eventId) => {
    requests.push(eventId);
    if (eventId === "401772831") {
      await pending;
      return { gamecast: detailedGamecast(), stale: false };
    }
    return {
      gamecast: {
        ...detailedGamecast(),
        eventId: "401772999"
      },
      stale: false
    };
  };

  provider.handleSportsFacts(facts());
  provider.handleHeroDisplay(candidate());
  provider.handleSportsFacts(facts({ eventId: "401772999" }));
  provider.handleHeroDisplay(candidate({
    payload: { type: "football-game", eventId: "401772999" }
  }));
  release();
  await settle();
  await settle();

  assert.deepEqual(requests, ["401772831", "401772999"]);
  assert.equal(published.length, 1);
  assert.equal(published[0].payload.game.eventId, "401772999");
});

test("two NFL favorites retain facts and only the displayed favorite polls", async () => {
  const requests = [];
  const { Provider, timers } = loadProvider();
  const provider = new Provider();
  const favoriteA = facts();
  const favoriteB = facts({ eventId: "401772999" });
  favoriteB.favoriteTeam = {
    ...favoriteA.favoriteTeam,
    id: "NFL:SF",
    name: "San Francisco 49ers",
    shortName: "49ers"
  };
  provider.fetchGamecast = async (_date, eventId) => {
    requests.push(eventId);
    return {
      gamecast: {
        ...detailedGamecast(),
        eventId
      },
      stale: false
    };
  };

  provider.handleSportsFacts(favoriteA);
  provider.handleSportsFacts(favoriteB);
  assert.equal(provider.factsByFavoriteId.size, 2);

  provider.handleHeroDisplay(candidate());
  await settle();
  assert.deepEqual(requests, ["401772831"]);
  const favoriteATimer = timers.at(-1);

  provider.handleSportsFacts({
    ...favoriteB,
    game: { ...favoriteB.game, score: { away: 24, home: 24 } }
  });
  assert.equal(favoriteATimer.cleared, false);
  assert.deepEqual(requests, ["401772831"]);

  provider.handleHeroDisplay(candidate({
    id: "sports:live:NFL:SF",
    payload: { type: "football-game", eventId: "401772999" }
  }));
  await settle();
  assert.equal(favoriteATimer.cleared, true);
  assert.deepEqual(requests, ["401772831", "401772999"]);

  provider.handleSportsFacts({
    ...favoriteA,
    game: { ...favoriteA.game, status: "final" }
  });
  assert.equal(provider.factsByFavoriteId.has("NFL:SF"), true);
  assert.equal(provider.factsByFavoriteId.get("NFL:SEA").game.status, "final");

  provider.handleSportsFacts({
    status: "unavailable",
    favoriteTeam: favoriteB.favoriteTeam,
    game: null
  });
  assert.equal(provider.factsByFavoriteId.has("NFL:SF"), false);
  assert.equal(provider.factsByFavoriteId.has("NFL:SEA"), true);
});

test("unavailable facts and simulation takeover stop polling", async () => {
  const { Provider, timers } = loadProvider();
  const provider = new Provider();
  provider.fetchGamecast = async () => ({
    gamecast: detailedGamecast(),
    stale: false
  });
  provider.handleSportsFacts(facts());
  provider.handleHeroDisplay(candidate());
  await settle();
  const firstTimer = timers.at(-1);

  provider.handleSportsFacts({
    status: "unavailable",
    favoriteTeam: { id: "NFL:SEA", league: "NFL" },
    game: null
  });
  assert.equal(firstTimer.cleared, true);

  provider.handleSportsFacts(facts());
  provider.handleHeroDisplay(candidate());
  await settle();
  const secondTimer = timers.at(-1);
  provider.handleSportsFacts({
    status: "available",
    favoriteTeam: { id: "SEA", league: "MLB" },
    game: { status: "live", eventId: "mlb-game" }
  });
  assert.equal(secondTimer.cleared, false);
  provider.handleSimulationState(true);
  assert.equal(secondTimer.cleared, true);
  assert.equal(provider.factsByFavoriteId.size, 0);
});

test("visibility, page hide, and provider stop invalidate polling", async () => {
  const { Provider, context, timers } = loadProvider();
  const provider = new Provider();
  provider.fetchGamecast = async () => ({
    gamecast: detailedGamecast(),
    stale: false
  });
  provider.handleSportsFacts(facts());
  provider.handleHeroDisplay(candidate());
  await settle();
  const visibilityTimer = timers.at(-1);
  context.document.visibilityState = "hidden";
  provider.handleVisibilityChange();
  assert.equal(visibilityTimer.cleared, true);

  context.document.visibilityState = "visible";
  provider.reconcileRefreshLoop();
  await settle();
  const pageTimer = timers.at(-1);
  provider.handlePageHide();
  assert.equal(pageTimer.cleared, true);

  provider.factsByFavoriteId.set("NFL:SEA", facts());
  provider.displayedCandidate = candidate();
  provider.reconcileRefreshLoop();
  await settle();
  const stopTimer = timers.at(-1);
  provider.stop();
  assert.equal(stopTimer.cleared, true);
  assert.equal(provider.factsByFavoriteId.size, 0);
});

test("final detail publishes once and immediately stops polling", async () => {
  const { Provider, timers, published } = loadProvider();
  const lifecycleState = new NflGamecastLifecycleState();
  const provider = new Provider(lifecycleState);
  provider.fetchGamecast = async () => ({
    gamecast: detailedGamecast("final"),
    updatedAt: "2026-09-07T23:00:00.000Z",
    stale: false
  });

  provider.handleSportsFacts(facts());
  provider.handleHeroDisplay(candidate());
  await settle();

  assert.equal(published.length, 1);
  assert.equal(published[0].payload.game.status, "final");
  assert.equal(published[0].payload.game.eventId, "401772831");
  assert.equal(timers.length, 0);
  assert.equal(provider.activeLifecycleKey, null);
  assert.equal(
    lifecycleState.wasFinalPresented("NFL:SEA", "401772831"),
    true
  );
});

test("valid stale detail publishes and continues live polling", async () => {
  const { Provider, timers, published } = loadProvider();
  const provider = new Provider();
  provider.fetchGamecast = async () => ({
    gamecast: detailedGamecast(),
    updatedAt: "2026-09-07T20:00:00.000Z",
    stale: true
  });

  provider.handleSportsFacts(facts());
  provider.handleHeroDisplay(candidate());
  await settle();

  assert.equal(published[0].payload.gamecastStale, true);
  assert.equal(timers.at(-1).delay, 5000);
});

test("failed detail keeps existing facts and retries on the interval", async () => {
  const { Provider, timers, published } = loadProvider();
  const provider = new Provider();
  const originalFacts = facts();
  provider.fetchGamecast = async () => {
    throw new Error("backend unavailable");
  };

  provider.handleSportsFacts(originalFacts);
  provider.handleHeroDisplay(candidate());
  await settle();

  assert.equal(
    provider.factsByFavoriteId.get("NFL:SEA"),
    originalFacts
  );
  assert.equal(published.length, 0);
  assert.equal(timers.at(-1).delay, 5000);
});

test("bootstrap registers the dedicated NFL detailed provider", () => {
  const source = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/providers/provider-bootstrap.js"),
    "utf8"
  );
  const html = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/index.html"),
    "utf8"
  );

  assert.match(source, /"nfl-gamecast",\s*NflGamecastProvider/);
  assert.match(html, /providers\/nfl-gamecast-provider\.js/);
});
