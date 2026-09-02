const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadClass(relativePath, className, globals = {}) {
  const source = fs.readFileSync(
    path.join(PROJECT_ROOT, relativePath),
    "utf8"
  );
  const context = vm.createContext({ ...globals });

  vm.runInContext(
    source + `; this.LoadedClass = ${className};`,
    context
  );

  return context.LoadedClass;
}

function favorite(id = "NFL:SEA") {
  return {
    id,
    abbreviation: id.split(":")[1],
    name: id === "NFL:SEA" ? "Seattle Seahawks" : "San Francisco 49ers",
    shortName: id === "NFL:SEA" ? "Seahawks" : "49ers",
    league: "NFL",
    sport: "football"
  };
}

function scheduleGame(overrides = {}) {
  return {
    eventId: "401772831",
    scheduledAt: "2026-09-07T20:25:00.000Z",
    status: { state: "live", detail: "2:48 - 4th Quarter" },
    awayTeam: {
      id: "NFL:SEA",
      providerId: "26",
      abbreviation: "SEA",
      name: "Seattle Seahawks",
      shortName: "Seahawks",
      score: 24,
      logo: "https://example.test/sea.png"
    },
    homeTeam: {
      id: "NFL:SF",
      providerId: "25",
      abbreviation: "SF",
      name: "San Francisco 49ers",
      shortName: "49ers",
      score: 23,
      logo: "https://example.test/sf.png"
    },
    state: {
      period: 4,
      clock: "2:48",
      quarters: {
        away: [7, 3, 7, 7],
        home: [3, 7, 6, 7]
      },
      overtime: { away: null, home: null },
      phase: null
    },
    ...overrides
  };
}

function footballFacts(id = "NFL:SEA", status = "live") {
  const game = scheduleGame({
    status: { state: status },
    state: {
      ...scheduleGame().state,
      phase: status === "final" ? "final" : null
    }
  });
  const teams = {
    away: game.awayTeam,
    home: game.homeTeam
  };
  const gamecast = {
    type: "football-game",
    status,
    eventId: game.eventId,
    teams,
    score: { away: 24, home: 23 },
    gameState: { quarter: 4, clock: "2:48", phase: "regulation" },
    possession: null,
    situation: null,
    drive: null,
    lastPlay: null,
    lineScore: {
      periods: [1, 2, 3, 4],
      away: [7, 3, 7, 7],
      home: [3, 7, 6, 7],
      overtime: { away: null, home: null }
    }
  };

  return {
    status: "available",
    favoriteTeam: favorite(id),
    game: {
      status,
      eventId: game.eventId,
      teams,
      score: gamecast.score,
      quarter: 4,
      gameClock: "2:48",
      gamecast
    }
  };
}

test("NflDataProvider matches qualified identity and builds a schedule seed", async () => {
  const requests = [];
  const NflDataProvider = loadClass(
    "frontend/providers/nfl-data-provider.js",
    "NflDataProvider",
    {
      Map,
      encodeURIComponent,
      fetch: async (url) => {
        requests.push(url);
        return {
          ok: true,
          json: async () => ({ sportsEvents: [scheduleGame()] })
        };
      }
    }
  );
  const facts = await new NflDataProvider().getScheduleFacts(
    favorite(),
    "2026-09-07"
  );
  const payload = facts.game.gamecast;

  assert.deepEqual(requests, ["/api/sports/nfl?date=2026-09-07"]);
  assert.equal(facts.favoriteTeam.id, "NFL:SEA");
  assert.equal(facts.game.eventId, "401772831");
  assert.equal(facts.game.eventDate, "2026-09-07");
  assert.equal(payload.type, "football-game");
  assert.equal(payload.eventId, "401772831");
  assert.equal(payload.teams.away.id, "NFL:SEA");
  assert.equal(payload.teams.home.id, "NFL:SF");
  assert.equal(payload.teams.away.providerId, "26");
  assert.equal(payload.teams.home.providerId, "25");
  assert.equal(payload.possession, null);
  assert.equal(payload.situation, null);
  assert.equal(payload.drive, null);
  assert.equal(payload.lastPlay, null);
  assert.deepEqual(
    JSON.parse(JSON.stringify(payload.lineScore)),
    {
      periods: [1, 2, 3, 4],
      away: [7, 3, 7, 7],
      home: [3, 7, 6, 7],
      overtime: { away: null, home: null }
    }
  );
});

test("NFL favorite matching does not use names or provider IDs", () => {
  const NflDataProvider = loadClass(
    "frontend/providers/nfl-data-provider.js",
    "NflDataProvider",
    { Map }
  );
  const provider = new NflDataProvider();
  const game = scheduleGame();

  assert.equal(provider.includesTeam(game, "NFL:SEA"), true);
  assert.equal(provider.includesTeam(game, "26"), false);
  assert.equal(provider.includesTeam(game, "Seattle Seahawks"), false);
  assert.equal(provider.includesTeam(game, "SEA"), false);
});

test("favorite identity does not change away/home payload ordering", () => {
  const NflDataProvider = loadClass(
    "frontend/providers/nfl-data-provider.js",
    "NflDataProvider",
    { Map }
  );
  const game = scheduleGame();
  const normalized = new NflDataProvider().normalizeGame(
    game,
    favorite("NFL:SF")
  );

  assert.equal(normalized.teams.away.id, "NFL:SEA");
  assert.equal(normalized.teams.home.id, "NFL:SF");
  assert.equal(normalized.gamecast.score.away, 24);
  assert.equal(normalized.gamecast.score.home, 23);
});

test("SportsProvider dispatches MLB and NFL favorites independently", async () => {
  class FakeMlbDataProvider {}
  class FakeNflDataProvider {}
  const SportsProvider = loadClass(
    "frontend/providers/sports-provider.js",
    "SportsProvider",
    { MlbDataProvider: FakeMlbDataProvider, NflDataProvider: FakeNflDataProvider }
  );
  const provider = new SportsProvider();
  const mlb = {
    status: "available",
    favoriteTeam: { id: "SEA", league: "MLB" },
    game: { status: "live" }
  };
  const nfl = footballFacts();
  const published = [];

  provider.simulationActive = false;
  provider.loadConfig = async () => ({
    enabled: true,
    favoriteTeams: [mlb.favoriteTeam, nfl.favoriteTeam, {
      id: "NBA:SEA",
      league: "NBA"
    }]
  });
  provider.favoriteDataProviders = new Map([
    ["MLB", {
      getScheduleFacts: async () => mlb,
      createUnavailableFacts: () => null
    }],
    ["NFL", {
      getScheduleFacts: async () => nfl,
      createUnavailableFacts: () => null
    }]
  ]);
  provider.publishSportsFacts = (facts) => published.push(facts);
  provider.getDateKey = () => "2026-09-07";

  const states = await provider.refreshSportsFacts();

  assert.deepEqual(published, [mlb, nfl]);
  assert.deepEqual(JSON.parse(JSON.stringify(states)), ["live", "live"]);
});

test("SportsProvider isolates one favorite acquisition failure", async () => {
  class FakeMlbDataProvider {}
  class FakeNflDataProvider {}
  const SportsProvider = loadClass(
    "frontend/providers/sports-provider.js",
    "SportsProvider",
    {
      console: { error: () => {} },
      MlbDataProvider: FakeMlbDataProvider,
      NflDataProvider: FakeNflDataProvider
    }
  );
  const provider = new SportsProvider();
  const mlbTeam = { id: "SEA", league: "MLB" };
  const nfl = footballFacts();
  const unavailableMlb = {
    status: "unavailable",
    favoriteTeam: mlbTeam,
    game: null
  };

  provider.favoriteDataProviders = new Map([
    ["MLB", {
      getScheduleFacts: async () => {
        throw new Error("MLB unavailable");
      },
      createUnavailableFacts: () => unavailableMlb
    }],
    ["NFL", { getScheduleFacts: async () => nfl }]
  ]);

  assert.deepEqual(
    await provider.getFavoriteTeamFacts(mlbTeam, "2026-09-07"),
    unavailableMlb
  );
  assert.deepEqual(
    await provider.getFavoriteTeamFacts(nfl.favoriteTeam, "2026-09-07"),
    nfl
  );
  assert.equal(
    await provider.getFavoriteTeamFacts(
      { id: "NBA:SEA", league: "NBA" },
      "2026-09-07"
    ),
    null
  );
});

test("NFL facts do not stop an active MLB detailed lifecycle", () => {
  class FakeMlbDataProvider {}
  const MlbGamecastProvider = loadClass(
    "frontend/providers/mlb-gamecast-provider.js",
    "MlbGamecastProvider",
    { MlbDataProvider: FakeMlbDataProvider }
  );
  const provider = new MlbGamecastProvider();
  const mlbFavorite = { id: "SEA", league: "MLB" };

  provider.favoriteTeam = mlbFavorite;
  provider.liveCandidateId = "sports:live:SEA";
  provider.handleSportsFacts(footballFacts());

  assert.equal(provider.favoriteTeam, mlbFavorite);
  assert.equal(provider.liveCandidateId, "sports:live:SEA");
});

test("production NFL facts pass unchanged into a football Hero candidate", () => {
  const SportsActiveContextGenerator = loadClass(
    "frontend/providers/sports-active-context-generator.js",
    "SportsActiveContextGenerator",
    { Date, Map }
  );
  const facts = footballFacts();
  const candidate = new SportsActiveContextGenerator()
    .createLiveGameCandidate(facts);

  assert.equal(candidate.id, "sports:live:NFL:SEA");
  assert.equal(candidate.payload, facts.game.gamecast);
  assert.equal(candidate.payload.type, "football-game");
  assert.equal(candidate.behavior.sticky, true);
});

test("production MLB and NFL candidates coexist and withdraw independently", () => {
  const events = [];
  const SportsActiveContextGenerator = loadClass(
    "frontend/providers/sports-active-context-generator.js",
    "SportsActiveContextGenerator",
    {
      Date,
      Map,
      window: {
        mosaicApp: {
          eventBus: { publish: (event) => events.push(event) }
        }
      }
    }
  );
  const generator = new SportsActiveContextGenerator();
  const mlbFacts = {
    status: "available",
    favoriteTeam: {
      id: "SEA",
      name: "Seattle Mariners",
      sport: "baseball",
      league: "MLB"
    },
    game: {
      status: "live",
      teams: {
        away: { id: "SEA", name: "Mariners" },
        home: { id: "LAA", name: "Angels" }
      },
      score: { away: 2, home: 1 }
    }
  };

  generator.evaluate(mlbFacts);
  generator.evaluate(footballFacts());

  assert.equal(generator.activeCandidateIds.size, 2);
  assert.deepEqual(
    [...generator.activeCandidateIds.keys()],
    ["SEA", "NFL:SEA"]
  );
  assert.equal(
    events.filter((event) => event.type === "hero-candidate-withdraw").length,
    0
  );

  generator.evaluate({
    status: "unavailable",
    favoriteTeam: mlbFacts.favoriteTeam,
    game: null
  });

  assert.equal(generator.activeCandidateIds.has("SEA"), false);
  assert.equal(generator.activeCandidateIds.has("NFL:SEA"), true);
  assert.equal(events.at(-1).payload.id, "sports:live:SEA");

  generator.evaluate(mlbFacts);
  generator.evaluate({
    status: "unavailable",
    favoriteTeam: footballFacts().favoriteTeam,
    game: null
  });

  assert.equal(generator.activeCandidateIds.has("SEA"), true);
  assert.equal(generator.activeCandidateIds.has("NFL:SEA"), false);
  assert.equal(events.at(-1).payload.id, "sports:live:NFL:SEA");
});

test("simulation profile switching withdraws only the previous simulation candidate", () => {
  const events = [];
  const SportsActiveContextGenerator = loadClass(
    "frontend/providers/sports-active-context-generator.js",
    "SportsActiveContextGenerator",
    {
      Date,
      Map,
      window: {
        mosaicApp: {
          eventBus: { publish: (event) => events.push(event) }
        }
      }
    }
  );
  const generator = new SportsActiveContextGenerator();
  const first = { ...footballFacts("NFL:SEA"), simulation: true };
  const second = { ...footballFacts("NFL:SF"), simulation: true };

  generator.evaluate(first);
  generator.evaluate(second);

  assert.equal(
    generator.activeSimulationCandidateId,
    "sports:live:NFL:SF"
  );
  assert.equal(
    events.filter((event) =>
      event.type === "hero-candidate-withdraw" &&
      event.payload.id === "sports:live:NFL:SEA"
    ).length,
    1
  );

  generator.evaluate({
    status: "unavailable",
    simulation: true,
    favoriteTeam: null,
    game: null
  });
  assert.equal(generator.activeSimulationCandidateId, null);
  assert.equal(events.at(-1).payload.id, "sports:live:NFL:SF");
});

test("final typed Gamecast candidate is supported without becoming sticky", () => {
  const SportsActiveContextGenerator = loadClass(
    "frontend/providers/sports-active-context-generator.js",
    "SportsActiveContextGenerator",
    { Date, Map }
  );
  const candidate = new SportsActiveContextGenerator()
    .createLiveGameCandidate(footballFacts("NFL:SEA", "final"));

  assert.equal(candidate.payload.status, "final");
  assert.equal(candidate.behavior.sticky, false);
  assert.equal(candidate.behavior.durationSeconds, 60);
  assert.ok(candidate.expiresAt);
});

test("frontend loads NFL favorite provider without changing renderer wiring", () => {
  const html = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/index.html"),
    "utf8"
  );

  assert.match(html, /providers\/nfl-data-provider\.js/);
  assert.ok(
    html.indexOf("providers/nfl-data-provider.js") <
    html.indexOf("providers/sports-provider.js")
  );
});
