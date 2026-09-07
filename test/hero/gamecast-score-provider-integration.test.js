const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  ScoreEventDetector,
  createDetailedGamecastSnapshot
} = require(
  "../../frontend/sports/gamecast/score-event-detector"
);

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadProvider(file, name, additions = {}) {
  const published = [];
  const context = vm.createContext({
    console: { error: () => {} },
    Date,
    Map,
    encodeURIComponent,
    setTimeout: () => ({}),
    clearTimeout: () => {},
    ScoreEventDetector,
    createDetailedGamecastSnapshot,
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
    },
    document: {
      visibilityState: "visible",
      addEventListener: () => {},
      removeEventListener: () => {}
    },
    ...additions
  });
  const source = fs.readFileSync(path.join(PROJECT_ROOT, file), "utf8");
  vm.runInContext(`${source}; this.LoadedProvider = ${name};`, context);

  return { Provider: context.LoadedProvider, published };
}

function mlbFacts(score, revision, stale = false) {
  return {
    gamecastUpdatedAt: revision,
    gamecastStale: stale,
    game: {
      eventId: "777001",
      score,
      teams: {
        away: { id: "BOS", abbreviation: "BOS" },
        home: { id: "SEA", abbreviation: "SEA" }
      }
    }
  };
}

test("MLB detailed integration qualifies IDs, baselines loaded score, and emits runs", () => {
  const { Provider, published } = loadProvider(
    "frontend/providers/mlb-gamecast-provider.js",
    "MlbGamecastProvider"
  );
  const provider = new Provider();

  assert.deepEqual(
    provider.acceptDetailedSnapshot(
      mlbFacts({ away: 2, home: 5 }, "revision-1")
    ),
    []
  );
  provider.acceptDetailedSnapshot(
    mlbFacts({ away: 2, home: 6 }, "revision-2")
  );

  const scoreEvents = published.filter(
    (event) => event.type === "gamecast-score-event"
  );
  assert.equal(scoreEvents.length, 1);
  assert.equal(scoreEvents[0].payload.gameId, "MLB:777001");
  assert.equal(scoreEvents[0].payload.scoringTeamId, "MLB:SEA");
  assert.equal(scoreEvents[0].payload.eventType, "run");
  assert.notEqual(scoreEvents[0].payload.eventType, "home-run");
});

test("MLB stale detailed response cannot emit or advance baseline", () => {
  const { Provider, published } = loadProvider(
    "frontend/providers/mlb-gamecast-provider.js",
    "MlbGamecastProvider"
  );
  const provider = new Provider();
  provider.acceptDetailedSnapshot(
    mlbFacts({ away: 2, home: 5 }, "revision-1")
  );
  provider.acceptDetailedSnapshot(
    mlbFacts({ away: 2, home: 8 }, "stale-revision", true)
  );
  const [event] = provider.acceptDetailedSnapshot(
    mlbFacts({ away: 2, home: 6 }, "revision-2")
  );

  assert.equal(event.points, 1);
  assert.equal(published.filter(
    (item) => item.type === "gamecast-score-event"
  ).length, 1);
});

function nflFacts(score, revision, stale = false) {
  return {
    gamecastUpdatedAt: revision,
    gamecastStale: stale,
    game: {
      gamecast: {
        eventId: "401772831",
        score,
        teams: {
          away: { id: "NFL:SEA", abbreviation: "SEA" },
          home: { id: "NFL:SF", abbreviation: "SF" }
        },
        lastPlay: {
          id: "play-10",
          team: "away",
          providerTeamId: "26",
          type: "Rush",
          providerTypeId: "5",
          providerTypeAbbreviation: "RUSH",
          quarter: 4,
          clock: "1:12"
        }
      }
    }
  };
}

test("NFL detailed integration baselines, emits conservative score, and deduplicates", () => {
  const { Provider, published } = loadProvider(
    "frontend/providers/nfl-gamecast-provider.js",
    "NflGamecastProvider"
  );
  const provider = new Provider();
  provider.acceptDetailedSnapshot(
    nflFacts({ away: 24, home: 23 }, "revision-1")
  );
  provider.acceptDetailedSnapshot(
    nflFacts({ away: 30, home: 23 }, "revision-2")
  );
  provider.acceptDetailedSnapshot(
    nflFacts({ away: 30, home: 23 }, "revision-2")
  );

  const scoreEvents = published.filter(
    (event) => event.type === "gamecast-score-event"
  );
  assert.equal(scoreEvents.length, 1);
  assert.equal(scoreEvents[0].payload.gameId, "NFL:401772831");
  assert.equal(scoreEvents[0].payload.scoringTeamId, "NFL:SEA");
  assert.equal(scoreEvents[0].payload.eventType, "score");
  assert.equal(scoreEvents[0].payload.providerEventId, "play-10");
});

test("provider lifecycle reset prevents a loaded post-reconnect score from emitting", () => {
  const { Provider, published } = loadProvider(
    "frontend/providers/nfl-gamecast-provider.js",
    "NflGamecastProvider"
  );
  const provider = new Provider();
  provider.acceptDetailedSnapshot(
    nflFacts({ away: 24, home: 23 }, "revision-1")
  );
  provider.stopRefreshLoop();
  provider.acceptDetailedSnapshot(
    nflFacts({ away: 30, home: 23 }, "revision-2")
  );

  assert.equal(published.filter(
    (event) => event.type === "gamecast-score-event"
  ).length, 0);
});
