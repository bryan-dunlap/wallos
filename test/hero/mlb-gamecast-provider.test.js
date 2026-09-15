const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadProvider() {
  const published = [];
  const timers = [];
  const source = fs.readFileSync(path.join(
    PROJECT_ROOT,
    "frontend/providers/mlb-gamecast-provider.js"
  ), "utf8");
  const context = vm.createContext({
    console: { error: () => {} },
    Date,
    Map,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => { timer.cleared = true; },
    MlbDataProvider: class {},
    window: {
      mosaicApp: {
        eventBus: {
          subscribe: () => () => {},
          publish: (event) => published.push(event)
        }
      },
      addEventListener: () => {},
      removeEventListener: () => {}
    }
  });

  vm.runInContext(
    source + "; this.LoadedClass = MlbGamecastProvider;",
    context
  );

  return { Provider: context.LoadedClass, published, timers };
}

function game(overrides = {}) {
  return {
    status: "live",
    eventId: "401816901",
    startTime: "2026-09-12T01:40Z",
    teams: {
      away: { id: "SEA", name: "Mariners" },
      home: { id: "ATH", name: "Athletics" }
    },
    score: { away: 2, home: 4 },
    inning: { half: "bottom", number: 5 },
    batter: null,
    pitcher: null,
    count: { balls: null, strikes: null },
    outs: null,
    bases: { first: false, second: false, third: false },
    ...overrides
  };
}

function facts(gameValue) {
  return {
    status: "available",
    favoriteRank: 0,
    favoriteTeam: {
      id: "SEA",
      name: "Seattle Mariners",
      league: "MLB",
      sport: "baseball"
    },
    game: gameValue,
    gamecastUpdatedAt: "2026-09-12T02:00:00.000Z",
    gamecastStale: false
  };
}

test("StatsAPI detail and detail-only changes replace an ESPN-ID snapshot", async () => {
  const { Provider, published } = loadProvider();
  const provider = new Provider();
  const initial = facts(game());
  const detailedA = facts(game({
    eventId: "824954",
    startTime: "2026-09-12T01:40:00Z",
    batter: { id: 1, name: "Batter A" },
    pitcher: { id: 2, name: "Pitcher A" },
    count: { balls: 0, strikes: 0 },
    outs: 1,
    bases: { first: false, second: false, third: false }
  }));
  const detailedB = facts(game({
    eventId: "824954",
    startTime: "2026-09-12T01:40:00Z",
    batter: { id: 1, name: "Batter B" },
    pitcher: { id: 3, name: "Pitcher B" },
    count: { balls: 0, strikes: 0 },
    outs: 2,
    bases: { first: true, second: false, third: true }
  }));

  const details = [detailedA, detailedB];
  provider.mlbDataProvider.getGamecastFacts = async () => details.shift();
  provider.handleSportsFacts(initial);
  provider.handleHeroDisplay({
    id: "sports:live:SEA",
    source: "sports",
    type: "sports.live-game",
    mode: "active",
    payload: { type: "baseball-game" }
  });
  provider.refreshTimer = null;
  await provider.refresh(provider.lifecycleVersion);
  provider.refreshTimer = null;
  await provider.refresh(provider.lifecycleVersion);

  assert.equal(published.length, 2);
  assert.equal(published[1].type, "sports-facts");
  assert.equal(published[1].payload.game.eventId, "401816901");
  assert.deepEqual(
    JSON.parse(JSON.stringify({
      batter: published[1].payload.game.batter,
      pitcher: published[1].payload.game.pitcher,
      count: published[1].payload.game.count,
      outs: published[1].payload.game.outs,
      bases: published[1].payload.game.bases
    })),
    {
      batter: { id: 1, name: "Batter B" },
      pitcher: { id: 3, name: "Pitcher B" },
      count: { balls: 0, strikes: 0 },
      outs: 2,
      bases: { first: true, second: false, third: true }
    }
  );
});

test("a different matchup cannot replace the displayed MLB game", async () => {
  const { Provider, published } = loadProvider();
  const provider = new Provider();

  provider.mlbDataProvider.getGamecastFacts = async () => facts(game({
    eventId: "999999",
    teams: {
      away: { id: "BOS" },
      home: { id: "NYY" }
    }
  }));
  provider.handleSportsFacts(facts(game()));
  provider.handleHeroDisplay({
    id: "sports:live:SEA",
    source: "sports",
    type: "sports.live-game",
    mode: "active",
    payload: { type: "baseball-game" }
  });
  provider.refreshTimer = null;
  await provider.refresh(provider.lifecycleVersion);

  assert.equal(published.length, 0);
});
