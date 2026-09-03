const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadGenerator(globals = {}) {
  const source = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/providers/daily-snapshot-generator.js"),
    "utf8"
  );
  const context = vm.createContext({ ...globals });

  vm.runInContext(
    source + "; this.LoadedClass = DailySnapshotGenerator;",
    context
  );

  return context.LoadedClass;
}

function sportsFacts({
  id,
  league,
  status,
  startsAt,
  eventId = null,
  result = null
}) {
  return {
    status: "available",
    favoriteTeam: {
      id,
      league,
      sport: league === "MLB" ? "baseball" : "football",
      name: id === "SEA" ? "Seattle Mariners" : "Seattle Seahawks",
      shortName: id === "SEA" ? "Mariners" : "Seahawks",
      abbreviation: id
    },
    game: {
      status,
      eventId,
      eventDate: startsAt,
      startTime: startsAt,
      opponent: "Opponent",
      score: status === "scheduled" ? null : { away: 5, home: 3 },
      result
    }
  };
}

function plain(value) {
  return JSON.parse(JSON.stringify(value));
}

test("keyed sports state keeps valid favorites when a later favorite has no game", () => {
  const Generator = loadGenerator();
  const generator = new Generator();
  const now = new Date(2026, 8, 2, 9, 0);

  generator.getNow = () => now;
  generator.publishSnapshot = () => {};
  generator.receiveSportsFacts(sportsFacts({
    id: "SEA",
    league: "MLB",
    status: "scheduled",
    startsAt: new Date(2026, 8, 2, 13, 10).toISOString()
  }));
  generator.receiveSportsFacts({
    status: "available",
    favoriteTeam: { id: "NFL:SEA", league: "NFL" },
    game: null
  });

  assert.deepEqual(
    plain(generator.createDailyContext(now).sports.map((item) => item.favoriteTeam.id)),
    ["SEA"]
  );
});

test("multiple same-day favorites coexist and sort active, completed, upcoming", () => {
  const Generator = loadGenerator();
  const generator = new Generator();
  const now = new Date(2026, 8, 2, 15, 0);

  generator.getNow = () => now;
  generator.publishSnapshot = () => {};
  generator.receiveSportsFacts(sportsFacts({
    id: "SEA",
    league: "MLB",
    status: "final",
    startsAt: new Date(2026, 8, 2, 10, 0).toISOString(),
    result: "Mariners win 5-3"
  }));
  generator.receiveSportsFacts(sportsFacts({
    id: "NFL:SEA",
    league: "NFL",
    status: "live",
    startsAt: new Date(2026, 8, 2, 13, 0).toISOString(),
    eventId: "401"
  }));
  generator.receiveSportsFacts(sportsFacts({
    id: "BOS",
    league: "MLB",
    status: "scheduled",
    startsAt: new Date(2026, 8, 2, 19, 0).toISOString()
  }));

  assert.deepEqual(
    plain(generator.createDailyContext(now).sports.map((item) => item.state)),
    ["active", "completed", "upcoming"]
  );
});

test("same-day final survives later publications and expires at rollover", () => {
  const Generator = loadGenerator();
  const generator = new Generator();
  let now = new Date(2026, 8, 2, 17, 0);

  generator.getNow = () => now;
  generator.publishSnapshot = () => {};
  generator.receiveSportsFacts(sportsFacts({
    id: "SEA",
    league: "MLB",
    status: "final",
    startsAt: new Date(2026, 8, 2, 13, 10).toISOString(),
    result: "Mariners win 5-3"
  }));
  generator.receiveSportsFacts({
    status: "available",
    favoriteTeam: { id: "NFL:SEA", league: "NFL" },
    game: null
  });
  generator.receiveSportsFacts({
    status: "unavailable",
    favoriteTeam: { id: "SEA", league: "MLB" },
    game: null
  });
  assert.equal(generator.createDailyContext(now).sports[0].state, "completed");

  now = new Date(2026, 8, 3, 0, 0);
  assert.deepEqual(plain(generator.createDailyContext(now).sports), []);
});

test("prior-day final is rejected on receipt", () => {
  const Generator = loadGenerator();
  const generator = new Generator();
  const now = new Date(2026, 8, 2, 9, 0);

  generator.getNow = () => now;
  generator.publishSnapshot = () => {};
  generator.receiveSportsFacts(sportsFacts({
    id: "SEA",
    league: "MLB",
    status: "final",
    startsAt: new Date(2026, 8, 1, 19, 0).toISOString(),
    result: "Mariners win 5-3"
  }));

  assert.deepEqual(plain(generator.createDailyContext(now).sports), []);
});

test("sports normalization preserves generic NFL nickname, logo, and score identity", () => {
  const Generator = loadGenerator();
  const generator = new Generator();
  const now = new Date(2026, 8, 2, 17, 0);
  const item = generator.normalizeSportsItem({
    status: "available",
    favoriteTeam: {
      id: "NFL:SEA",
      league: "NFL",
      name: "Seattle Seahawks"
    },
    game: {
      status: "final",
      eventId: "401",
      eventDate: "2026-09-02",
      startTime: new Date(2026, 8, 2, 13, 0).toISOString(),
      opponent: "San Francisco 49ers",
      teams: {
        away: { id: "NFL:SF", shortName: "49ers" },
        home: { id: "NFL:SEA", shortName: "Seahawks", logo: "sea.png" }
      },
      score: { away: 17, home: 24 }
    }
  }, now);

  assert.deepEqual(plain(item.score), {
    away: 17,
    home: 24,
    favoriteTeam: 24,
    opponent: 17
  });
  assert.equal(item.favoriteTeam.logo, "sea.png");
  assert.equal(item.opponent, "49ers");
});

test("sports normalization uses canonical MLB nicknames without parsing names", () => {
  const Generator = loadGenerator();
  const generator = new Generator();
  const now = new Date(2026, 8, 2, 17, 0);
  const item = generator.normalizeSportsItem({
    status: "available",
    favoriteTeam: {
      id: "SEA",
      league: "MLB",
      name: "Seattle Mariners",
      shortName: "Mariners"
    },
    game: {
      status: "final",
      startTime: new Date(2026, 8, 2, 13, 0).toISOString(),
      opponent: "Boston Red Sox",
      teams: {
        away: { id: "BOS", name: "Boston Red Sox", shortName: "Red Sox" },
        home: { id: "SEA", name: "Seattle Mariners", shortName: "Mariners" }
      },
      score: { away: 3, home: 8 }
    }
  }, now);

  assert.equal(item.favoriteTeam.shortName, "Mariners");
  assert.equal(item.opponent, "Red Sox");
  assert.equal(item.score.favoriteTeam, 8);
  assert.equal(item.score.opponent, 3);
});

test("weather facts, insights, sports, and calendar coexist in daily context", () => {
  const Generator = loadGenerator();
  const generator = new Generator();
  const now = new Date(2026, 8, 2, 9, 0);

  generator.getNow = () => now;
  generator.publishSnapshot = () => {};
  generator.profile = { name: "Bryan" };
  generator.weatherFacts = {
    status: "available",
    location: { name: "Seattle", region: "WA", timezone: "America/Los_Angeles" },
    current: {
      temperature: 62,
      apparentTemperature: 61,
      condition: { code: 2, label: "Partly cloudy", icon: "cloud" }
    },
    today: { date: "2026-09-02", high: 70, low: 55, precipitationChance: 10 },
    updatedAt: now.toISOString(),
    stale: false
  };
  generator.weatherInsights = [{
    id: "weather:rain",
    type: "weather.rain-arriving",
    priority: 70,
    headline: "Rain later",
    summary: "Rain around 4 PM.",
    expiresAt: new Date(2026, 8, 2, 17, 0).toISOString()
  }];
  generator.calendarFacts = {
    status: "available",
    timedEvents: [{
      id: "dentist",
      title: "Dentist",
      startTime: new Date(2026, 8, 2, 15, 30).toISOString(),
      endTime: new Date(2026, 8, 2, 16, 0).toISOString(),
      allDay: false
    }],
    allDayEvents: []
  };
  generator.receiveSportsFacts(sportsFacts({
    id: "SEA",
    league: "MLB",
    status: "scheduled",
    startsAt: new Date(2026, 8, 2, 13, 10).toISOString()
  }));

  const context = generator.createDailyContext(now);
  assert.equal(context.greeting.text, "Good Morning Bryan");
  assert.equal(context.weather.current.temperature, 62);
  assert.equal(context.sports.length, 1);
  assert.equal(context.calendar.length, 1);
  assert.equal(context.insights.length, 1);
  assert.deepEqual(plain(context.alerts), []);
});

test("calendar normalization puts active before upcoming and removes completed", () => {
  const Generator = loadGenerator();
  const generator = new Generator();
  const now = new Date(2026, 8, 2, 12, 0);
  const calendar = {
    status: "available",
    timedEvents: [
      { id: "upcoming", title: "Upcoming", startTime: new Date(2026, 8, 2, 14).toISOString(), endTime: new Date(2026, 8, 2, 15).toISOString() },
      { id: "done", title: "Done", startTime: new Date(2026, 8, 2, 9).toISOString(), endTime: new Date(2026, 8, 2, 10).toISOString() },
      { id: "active", title: "Active", startTime: new Date(2026, 8, 2, 11).toISOString(), endTime: new Date(2026, 8, 2, 13).toISOString() }
    ],
    allDayEvents: []
  };

  assert.deepEqual(
    plain(generator.normalizeCalendar(calendar, now).map((item) => item.id)),
    ["active", "upcoming"]
  );
  assert.deepEqual(plain(generator.normalizeCalendar({ status: "available" }, now)), []);
});

test("boundary timers rebuild greetings at noon, 6 PM, and midnight", () => {
  const published = [];
  const timers = [];
  const Generator = loadGenerator({
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout: () => {},
    window: {
      mosaicApp: { eventBus: { publish: (event) => published.push(event) } }
    }
  });
  const generator = new Generator();
  let now = new Date(2026, 8, 2, 11, 59);

  generator.getNow = () => now;
  generator.profile = { name: "Bryan" };
  generator.publishSnapshot();
  assert.equal(published.at(-1).payload.candidate.payload.greeting.period, "morning");

  now = new Date(2026, 8, 2, 12, 0);
  timers.at(-1).callback();
  assert.equal(published.at(-1).payload.candidate.payload.greeting.period, "afternoon");

  now = new Date(2026, 8, 2, 18, 0);
  timers.at(-1).callback();
  assert.equal(published.at(-1).payload.candidate.payload.greeting.period, "evening");

  now = new Date(2026, 8, 3, 0, 0);
  timers.at(-1).callback();
  assert.equal(published.at(-1).payload.candidate.payload.date, "2026-09-03");
});

test("expired insights disappear when their scheduled callback rebuilds", () => {
  const published = [];
  const timers = [];
  const Generator = loadGenerator({
    setTimeout: (callback, delay) => {
      const timer = { callback, delay };
      timers.push(timer);
      return timer;
    },
    clearTimeout: () => {},
    window: {
      mosaicApp: { eventBus: { publish: (event) => published.push(event) } }
    }
  });
  const generator = new Generator();
  let now = new Date(2026, 8, 2, 9, 0);

  generator.getNow = () => now;
  generator.weatherInsights = [{
    headline: "Rain later",
    summary: "Rain around noon.",
    expiresAt: new Date(2026, 8, 2, 10, 0).toISOString()
  }];
  generator.publishSnapshot();
  assert.equal(published.at(-1).payload.candidate.payload.insights.length, 1);

  const expirationTimer = timers.find((timer) => timer.delay === 60 * 60 * 1000);
  now = new Date(2026, 8, 2, 10, 0);
  expirationTimer.callback();
  assert.equal(published.at(-1).payload.candidate.payload.insights.length, 0);
});
