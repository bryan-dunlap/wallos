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

test("Hero MLB Gamecast renders both Toronto and Seattle line-score rows", () => {
  let renderer = null;
  const { Class: BaseballGameRenderer } = loadClass(
    "frontend/widgets/baseball-game-renderer.js",
    "BaseballGameRenderer",
    {
      window: {
        mosaicActiveRendererRegistry: {
          register: (_type, registeredRenderer) => {
            renderer = registeredRenderer;
          }
        }
      }
    }
  );
  const markup = (renderer || new BaseballGameRenderer()).render({
    teams: {
      away: { id: "TOR", name: "Blue Jays" },
      home: { id: "SEA", name: "Mariners" }
    },
    score: { away: 4, home: 3 },
    inning: { half: "bottom", number: 9 },
    lineScore: {
      innings: Array.from({ length: 9 }, (_, index) => ({
        number: index + 1,
        away: index === 0 ? 1 : 0,
        home: index === 1 ? 1 : 0
      })),
      away: { runs: 4, hits: 8, errors: 0 },
      home: { runs: 3, hits: 7, errors: 1 }
    }
  });
  const rows = [...markup.matchAll(/<tr>([\s\S]*?)<\/tr>/g)]
    .map((match) => match[1]);

  assert.equal(rows.length, 3);
  assert.match(rows[1], /<th scope="row">TOR<\/th>/);
  assert.match(rows[2], /<th scope="row">SEA<\/th>/);
  assert.match(rows[1], /<td>4<\/td>\s*<td>8<\/td>\s*<td>0<\/td>/);
  assert.match(rows[2], /<td>3<\/td>\s*<td>7<\/td>\s*<td>1<\/td>/);
});

test("Hero MLB Gamecast retains both line-score sides for live and final", () => {
  const { Class: MlbDataProvider } = loadClass(
    "frontend/providers/mlb-data-provider.js",
    "MlbDataProvider",
    { Map }
  );
  const provider = new MlbDataProvider();
  const favoriteTeam = {
    id: "SEA",
    name: "Seattle Mariners",
    league: "MLB",
    sport: "baseball"
  };
  const game = {
    scheduledAt: "2026-08-30T20:10:00.000Z",
    awayTeam: {
      abbreviation: "TOR",
      name: "Toronto Blue Jays",
      runs: 4,
      hits: 8,
      errors: 0
    },
    homeTeam: {
      abbreviation: "SEA",
      name: "Seattle Mariners",
      runs: 3,
      hits: 7,
      errors: 1
    },
    linescore: {
      inning: { number: 9, half: "Bottom" },
      innings: [{ number: 1, away: 1, home: 0 }]
    }
  };

  for (const state of ["Live", "Final"]) {
    const normalized = provider.normalizeGame({
      ...game,
      status: { state }
    }, favoriteTeam);

    assert.deepEqual(
      JSON.parse(JSON.stringify(normalized.lineScore.innings[0])),
      { number: 1, away: 1, home: 0, favoriteTeam: 0, opponent: 1 }
    );
    assert.equal(normalized.lineScore.away.runs, 4);
    assert.equal(normalized.lineScore.home.runs, 3);
  }
});

test("Hero MLB Gamecast reserves space for line score and live details", () => {
  const widgetsCss = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );

  assert.match(
    widgetsCss,
    /\.baseball-gamecast\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto auto minmax\(68px, 1fr\);[^}]*gap:\s*8px/s
  );
  assert.match(
    widgetsCss,
    /\.baseball-game-inning\s*\{(?![^}]*position:\s*absolute)[^}]*color:/s
  );
  assert.doesNotMatch(
    widgetsCss,
    /\.baseball-line-score-wrap\s*\{[^}]*flex-shrink:/s
  );
});
