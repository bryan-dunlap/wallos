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

  return { Class: context.LoadedClass, context };
}

test("SportsProvider configuration failure has no Mariners fallback", async () => {
  const { Class: SportsProvider } = loadClass(
    "frontend/providers/sports-provider.js",
    "SportsProvider",
    {
      fetch: async () => {
        throw new Error("configuration unavailable");
      }
    }
  );
  const provider = Object.create(SportsProvider.prototype);

  assert.deepEqual(
    JSON.parse(JSON.stringify(await provider.loadConfig())),
    { enabled: false, favoriteTeam: null }
  );
});

test("SportsProvider selects another configured MLB favorite", async () => {
  const redSox = {
    id: "BOS",
    abbreviation: "BOS",
    name: "Boston Red Sox",
    shortName: "Red Sox",
    league: "MLB",
    sport: "baseball"
  };
  const { Class: SportsProvider } = loadClass(
    "frontend/providers/sports-provider.js",
    "SportsProvider",
    {
      fetch: async () => ({
        ok: true,
        json: async () => ({
          sports: {
            enabled: true,
            favoriteTeams: [{
              id: "NFL:SEA",
              league: "NFL"
            }, redSox]
          }
        })
      })
    }
  );
  const provider = Object.create(SportsProvider.prototype);
  const config = await provider.loadConfig();

  assert.equal(config.favoriteTeam.id, "BOS");
  assert.equal(config.favoriteTeam.shortName, "Red Sox");
});

test("no MLB favorite publishes unavailable no-team facts", async () => {
  const { Class: SportsProvider } = loadClass(
    "frontend/providers/sports-provider.js",
    "SportsProvider"
  );
  const provider = Object.create(SportsProvider.prototype);
  let published = null;

  provider.simulationActive = false;
  provider.loadConfig = async () => ({
    enabled: true,
    favoriteTeam: null
  });
  provider.mlbDataProvider = {
    createUnavailableFacts: (favoriteTeam) => ({
      status: "unavailable",
      favoriteTeam,
      game: null
    }),
    getScheduleFacts: () => {
      throw new Error("MLB acquisition should not run");
    }
  };
  provider.publishSportsFacts = (facts) => {
    published = facts;
  };

  await provider.refreshSportsFacts();
  assert.deepEqual(published, {
    status: "unavailable",
    favoriteTeam: null,
    game: null
  });
});

test("Resting Hero uses configured MLB short names and scheduled time", () => {
  const { Class: DailySnapshotGenerator } = loadClass(
    "frontend/providers/daily-snapshot-generator.js",
    "DailySnapshotGenerator"
  );
  const generator = new DailySnapshotGenerator();
  const now = new Date(2026, 7, 26, 9, 0, 0);
  const startTime = new Date(2026, 7, 26, 19, 10, 0);
  const expectedTime = new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit"
  }).format(startTime);

  [
    ["Seattle Mariners", "Mariners"],
    ["Boston Red Sox", "Red Sox"],
    ["Toronto Blue Jays", "Blue Jays"]
  ].forEach(([name, shortName]) => {
    const summary = generator.createSportsSummary({
      status: "available",
      favoriteTeam: { name, shortName },
      game: {
        status: "scheduled",
        startTime: startTime.toISOString()
      }
    }, "afternoon", now);

    assert.equal(
      summary,
      `${shortName} play tonight at ${expectedTime}.`
    );
  });
});

test("Resting Hero name fallback is generic and final copy is unchanged", () => {
  const { Class: DailySnapshotGenerator } = loadClass(
    "frontend/providers/daily-snapshot-generator.js",
    "DailySnapshotGenerator"
  );
  const generator = new DailySnapshotGenerator();
  const now = new Date(2026, 7, 26, 9, 0, 0);
  const startTime = new Date(2026, 7, 26, 19, 10, 0);
  const scheduled = {
    status: "scheduled",
    startTime: startTime.toISOString()
  };

  assert.match(generator.createSportsSummary({
    status: "available",
    favoriteTeam: { name: "Boston Red Sox" },
    game: scheduled
  }, "afternoon", now), /^Boston Red Sox play tonight/);
  assert.match(generator.createSportsSummary({
    status: "available",
    favoriteTeam: { abbreviation: "BOS" },
    game: scheduled
  }, "afternoon", now), /^BOS play tonight/);
  assert.equal(generator.createSportsSummary({
    status: "available",
    favoriteTeam: { shortName: "Red Sox" },
    game: {
      status: "final",
      startTime: startTime.toISOString(),
      result: "Boston Red Sox win 5-3"
    }
  }, "afternoon", now), "Boston Red Sox win 5-3");
  assert.equal(generator.createSportsSummary({
    status: "available",
    favoriteTeam: { shortName: "Red Sox" },
    game: {
      status: "live",
      startTime: startTime.toISOString()
    }
  }, "afternoon", now), "");
});

test("MLB facts retain short-name metadata and live game behavior", () => {
  const { Class: MlbDataProvider } = loadClass(
    "frontend/providers/mlb-data-provider.js",
    "MlbDataProvider",
    { Map }
  );
  const provider = new MlbDataProvider();
  const favoriteTeam = {
    id: "BOS",
    abbreviation: "BOS",
    name: "Boston Red Sox",
    shortName: "Red Sox",
    league: "MLB",
    sport: "baseball"
  };
  const factsTeam = provider.normalizeFavoriteTeam(favoriteTeam);
  const liveGame = provider.normalizeGame({
    scheduledAt: "2026-08-26T19:10:00.000Z",
    status: { state: "live" },
    awayTeam: { abbreviation: "BOS", name: "Boston Red Sox", runs: 3 },
    homeTeam: { abbreviation: "NYY", name: "New York Yankees", runs: 2 },
    linescore: {}
  }, favoriteTeam);

  assert.equal(factsTeam.shortName, "Red Sox");
  assert.equal(factsTeam.abbreviation, "BOS");
  assert.equal(liveGame.status, "live");
  assert.equal(liveGame.opponent, "New York Yankees");
  assert.deepEqual(
    JSON.parse(JSON.stringify(liveGame.score)),
    { away: 3, home: 2, favoriteTeam: 3, opponent: 2 }
  );
});

test("normal MLB facts and active Gamecast use separate source routes", async () => {
  const requests = [];
  const { Class: MlbDataProvider } = loadClass(
    "frontend/providers/mlb-data-provider.js",
    "MlbDataProvider",
    {
      Map,
      fetch: async (url) => {
        requests.push(url);
        return {
          ok: true,
          json: async () => ({ sportsEvents: [] })
        };
      }
    }
  );
  const provider = new MlbDataProvider();
  const favoriteTeam = {
    id: "SEA",
    abbreviation: "SEA",
    name: "Seattle Mariners",
    shortName: "Mariners",
    league: "MLB",
    sport: "baseball"
  };

  await provider.getScheduleFacts(favoriteTeam, "2026-08-27");
  await provider.getGamecastFacts(favoriteTeam, "2026-08-27");

  assert.deepEqual(requests, [
    "/api/sports/mlb?date=2026-08-27",
    "/api/sports/mlb/gamecast?date=2026-08-27"
  ]);
});
