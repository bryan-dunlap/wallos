const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  buildSportsWidgetAcquisitionResponse,
  normalizeIntegrationDisplayConfig,
  normalizeNormalWidgetsConfig
} = require("../../backend/server");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadClass(relativePath, className, globals = {}) {
  const source = fs.readFileSync(
    path.join(PROJECT_ROOT, relativePath),
    "utf8"
  );
  const context = vm.createContext({ ...globals });

  vm.runInContext(source + `; this.LoadedClass = ${className};`, context);
  return { Class: context.LoadedClass, context };
}

function createSportsSchedule() {
  return {
    sport: "MLB",
    sportsEvents: [{ eventId: "game-1" }],
    updatedAt: "2026-09-14T12:00:00.000Z"
  };
}

for (const widgetEnabled of [true, false]) {
  for (const heroEnabled of [true, false]) {
    test(`Sports keeps Widget ${widgetEnabled ? "ON" : "OFF"} and Hero ${heroEnabled ? "ON" : "OFF"} independent`, async () => {
      let widgetRequests = 0;
      const acquisition = await buildSportsWidgetAcquisitionResponse({
        enabled: true,
        widget: { enabled: widgetEnabled, leagues: ["MLB"] }
      }, "2026-09-14", new Map([["MLB", {
        id: "MLB",
        acquire: async () => {
          widgetRequests += 1;
          return createSportsSchedule();
        }
      }]]));

      assert.equal(widgetRequests, widgetEnabled ? 1 : 0);
      assert.equal(acquisition.leagues.length, widgetEnabled ? 1 : 0);

      const { Class: SportsProvider } = loadClass(
        "frontend/providers/sports-provider.js",
        "SportsProvider"
      );
      const provider = Object.create(SportsProvider.prototype);
      let heroRequests = 0;
      let published = null;

      provider.simulationActive = false;
      provider.loadConfig = async () => ({
        enabled: true,
        heroEnabled,
        favoriteTeams: [{ id: "SEA", league: "MLB" }]
      });
      provider.getFavoriteTeamFacts = async () => {
        heroRequests += 1;
        return {
          status: "available",
          favoriteTeam: {
            id: "SEA",
            name: "Seattle Mariners",
            league: "MLB",
            sport: "baseball"
          },
          game: {
            status: "live",
            eventId: "game-1",
            teams: {
              away: { id: "SEA", name: "Seattle Mariners" },
              home: { id: "LAA", name: "Los Angeles Angels" }
            },
            score: { away: 1, home: 0 },
            inning: { half: "top", number: 1 },
            outs: 0
          }
        };
      };
      provider.publishSportsFacts = (facts) => {
        published = facts;
      };
      provider.getDateKey = () => "2026-09-14";

      await provider.refreshSportsFacts();

      assert.equal(heroRequests, heroEnabled ? 1 : 0);
      assert.equal(
        published?.status,
        heroEnabled ? "available" : "unavailable"
      );

      const { Class: SportsActiveContextGenerator } = loadClass(
        "frontend/providers/sports-active-context-generator.js",
        "SportsActiveContextGenerator"
      );
      const generator = new SportsActiveContextGenerator();

      assert.equal(
        Boolean(generator.createLiveGameCandidate(published)),
        heroEnabled
      );
    });
  }
}

test("sports integration master disables Widget acquisition and Hero facts", async () => {
  let widgetRequests = 0;
  const acquisition = await buildSportsWidgetAcquisitionResponse({
    enabled: false,
    widget: { enabled: true, leagues: ["MLB"] }
  }, "2026-09-14", new Map([["MLB", {
    id: "MLB",
    acquire: async () => {
      widgetRequests += 1;
      return createSportsSchedule();
    }
  }]]));

  assert.equal(widgetRequests, 0);
  assert.deepEqual(acquisition.leagues, []);
});

test("disabled Sports Hero clears previously retained resting-Hero sports", () => {
  const { Class: DailySnapshotGenerator } = loadClass(
    "frontend/providers/daily-snapshot-generator.js",
    "DailySnapshotGenerator"
  );
  const generator = new DailySnapshotGenerator();

  generator.sportsFactsById.set("sports:SEA", { id: "sports:SEA" });
  generator.removeExpiredSports = () => {};
  generator.publishSnapshot = () => {};
  generator.receiveSportsFacts({
    status: "unavailable",
    favoriteTeam: null,
    game: null
  });

  assert.equal(generator.sportsFactsById.size, 0);
});

function createWeatherHarness(config) {
  const events = [];
  let weatherRequests = 0;
  const date = new Intl.DateTimeFormat("en-CA", {
    timeZone: "UTC",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());
  const weatherData = {
    location: { name: "Tacoma", state: "WA", timezone: "UTC" },
    current: {
      temperature: 65,
      apparentTemperature: 64,
      weatherCode: 0
    },
    daily: [{ date, high: 70, low: 50, precipitationChance: 0 }],
    hourly: [],
    updatedAt: new Date().toISOString()
  };
  const fetch = async (url) => {
    if (url === "/api/config") {
      return { ok: true, json: async () => ({ weather: config }) };
    }

    assert.equal(url, "/api/weather");
    weatherRequests += 1;
    return { ok: true, json: async () => weatherData };
  };
  const window = {
    mosaicApp: {
      eventBus: {
        publish: (event) => events.push(event)
      }
    }
  };
  const { Class: WeatherProvider } = loadClass(
    "frontend/providers/weather-provider.js",
    "WeatherProvider",
    {
      fetch,
      window,
      Intl,
      Date,
      console,
      createMosaicEvent: (event) => event,
      setInterval,
      clearInterval
    }
  );

  return {
    provider: new WeatherProvider(),
    events,
    getWeatherRequests: () => weatherRequests
  };
}

for (const widgetEnabled of [true, false]) {
  for (const heroEnabled of [true, false]) {
    test(`Weather keeps Widget ${widgetEnabled ? "ON" : "OFF"} and Hero ${heroEnabled ? "ON" : "OFF"} independent`, async () => {
      const harness = createWeatherHarness({
        enabled: true,
        widget: { enabled: widgetEnabled },
        hero: { enabled: heroEnabled }
      });

      await harness.provider.refresh();

      const widgetEvent = harness.events.find((event) => event.type === "weather");
      const heroEvent = harness.events.find(
        (event) => event.type === "weather-facts"
      );
      assert.equal(
        harness.getWeatherRequests(),
        widgetEnabled || heroEnabled ? 1 : 0
      );
      assert.equal(
        widgetEvent.payload.status,
        widgetEnabled ? "available" : "unavailable"
      );
      assert.equal(
        heroEvent.payload.status,
        heroEnabled ? "available" : "unavailable"
      );
    });
  }
}

test("Weather defaults preserve the existing enabled behavior", () => {
  assert.deepEqual(normalizeIntegrationDisplayConfig(), {
    enabled: true,
    widget: { enabled: true },
    hero: { enabled: true }
  });
});

test("Weather integration master suppresses both display projections", async () => {
  const harness = createWeatherHarness({
    enabled: false,
    widget: { enabled: true },
    hero: { enabled: true }
  });

  await harness.provider.refresh();

  assert.equal(harness.getWeatherRequests(), 0);
  assert.deepEqual(
    harness.events.map((event) => [event.type, event.payload.status]),
    [["weather", "unavailable"], ["weather-facts", "unavailable"]]
  );
});

test("normal Widget configuration is dormant, bounded, and deterministic", () => {
  assert.deepEqual(normalizeNormalWidgetsConfig(), {
    mode: "pair",
    order: ["weather", "sports"],
    rotationSeconds: 15
  });
  assert.deepEqual(normalizeNormalWidgetsConfig({
    mode: "expanded",
    order: ["sports", "unknown", "sports"],
    rotationSeconds: 999
  }), {
    mode: "expanded",
    order: ["sports", "weather"],
    rotationSeconds: 300
  });
  assert.deepEqual(normalizeNormalWidgetsConfig({
    mode: "invalid",
    order: "weather",
    rotationSeconds: 1
  }), {
    mode: "pair",
    order: ["weather", "sports"],
    rotationSeconds: 5
  });
  assert.equal(
    normalizeNormalWidgetsConfig({ rotationSeconds: null }).rotationSeconds,
    15
  );
});
