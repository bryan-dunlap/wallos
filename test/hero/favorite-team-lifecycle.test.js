const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadClass(file, name, globals) {
  const source = fs.readFileSync(path.join(PROJECT_ROOT, file), "utf8");
  const context = vm.createContext(globals);
  vm.runInContext(`${source}; this.LoadedClass = ${name};`, context);
  return context.LoadedClass;
}

class EventBus {
  constructor() {
    this.subscribers = new Map();
  }

  subscribe(type, callback) {
    if (!this.subscribers.has(type)) this.subscribers.set(type, []);
    this.subscribers.get(type).push(callback);
    return () => {};
  }

  publish(event) {
    for (const callback of this.subscribers.get(event.type) || []) callback(event);
  }
}

function createHarness() {
  let now = new Date(2026, 8, 2, 17, 0).getTime();
  const timers = [];
  const displays = [];
  const bus = new EventBus();

  class FakeDate extends Date {
    constructor(...args) {
      super(...(args.length ? args : [now]));
    }
    static now() { return now; }
  }

  const globals = {
    Date: FakeDate,
    Map,
    Set,
    Intl,
    console,
    setTimeout: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimeout: (timer) => { if (timer) timer.cleared = true; },
    window: { mosaicApp: { eventBus: bus } }
  };
  const HeroCoordinator = loadClass(
    "frontend/coordinator/hero-coordinator.js", "HeroCoordinator", globals
  );
  const DailySnapshotGenerator = loadClass(
    "frontend/providers/daily-snapshot-generator.js", "DailySnapshotGenerator", globals
  );
  const SportsActiveContextGenerator = loadClass(
    "frontend/providers/sports-active-context-generator.js", "SportsActiveContextGenerator", globals
  );
  const MosaicHero = loadClass("frontend/widgets/hero.js", "MosaicHero", globals);
  const coordinator = new HeroCoordinator(bus);
  const daily = new DailySnapshotGenerator();
  const active = new SportsActiveContextGenerator();

  bus.subscribe("hero-display", (event) => displays.push(event.payload.candidate));
  daily.scheduleTemporalUpdates = () => {};
  daily.profile = { name: "Bryan" };
  bus.subscribe("sports-facts", (event) => daily.receiveSportsFacts(event.payload));
  bus.subscribe("sports-facts", (event) => active.evaluate(event.payload));

  return {
    bus, coordinator, daily, active, displays, timers, MosaicHero,
    setNow: (value) => { now = value.getTime(); }
  };
}

function facts(league, status, typedFinal = false) {
  const nfl = league === "NFL";
  const favorite = nfl
    ? { id: "NFL:SEA", name: "Seattle Seahawks", shortName: "Seahawks", league, sport: "football" }
    : { id: "SEA", name: "Seattle Mariners", shortName: "Mariners", league, sport: "baseball" };
  const away = nfl
    ? { id: "NFL:SF", name: "San Francisco 49ers", shortName: "49ers" }
    : { id: "BOS", name: "Boston Red Sox", shortName: "Red Sox" };
  const home = nfl
    ? { id: "NFL:SEA", name: "Seattle Seahawks", shortName: "Seahawks" }
    : { id: "SEA", name: "Seattle Mariners", shortName: "Mariners" };
  const score = nfl ? { away: 17, home: 24 } : { away: 3, home: 8 };
  const gamecast = nfl && (status === "live" || typedFinal) ? {
    type: "football-game", status, eventId: "401", teams: { away, home }, score
  } : null;

  return {
    status: "available",
    favoriteTeam: favorite,
    game: {
      status,
      eventId: nfl ? "401" : "777",
      eventDate: "2026-09-02",
      startTime: new Date(2026, 8, 2, 13, 0).toISOString(),
      teams: { away, home },
      score,
      result: nfl ? null : "Mariners win 8-3",
      gamecast
    }
  };
}

for (const league of ["MLB", "NFL"]) {
  test(`${league} favorite lifecycle returns final result to Daily Context`, () => {
    const harness = createHarness();
    const { bus, coordinator, daily, active, displays, timers, MosaicHero } = harness;
    coordinator.start();
    daily.publishSnapshot();

    let display = displays.at(-1);
    assert.equal(display.id, "daily-snapshot:current");
    assert.equal(coordinator.activeCandidates.size, 1);

    bus.publish({ type: "sports-facts", payload: facts(league, "live") });
    display = displays.at(-1);
    assert.equal(display.id, `sports:live:${league === "NFL" ? "NFL:SEA" : "SEA"}`);
    assert.equal(coordinator.activeCandidates.has("daily-snapshot:current"), true);
    assert.equal(coordinator.activeCandidates.size, 2);
    assert.equal(daily.createDailyContext().sports[0].state, "active");

    bus.publish({
      type: "sports-facts",
      payload: facts(league, "final", league === "NFL")
    });

    if (league === "NFL") {
      display = displays.at(-1);
      assert.equal(display.payload.status, "final");
      assert.equal(display.behavior.durationSeconds, 60);
      const expiration = timers.filter((timer) => !timer.cleared).at(-1);
      harness.setNow(new Date(2026, 8, 2, 17, 1, 1));
      expiration.callback();
    }

    display = displays.at(-1);
    assert.equal(display.id, "daily-snapshot:current");
    assert.equal(coordinator.activeCandidates.size, 1);
    assert.equal(active.activeCandidateIds.size, league === "NFL" ? 1 : 0);
    assert.equal(display.payload.sports[0].state, "completed");

    const markup = new MosaicHero(null).renderDailyContextTemplate(display.payload);
    assert.match(markup, league === "NFL"
      ? /Seahawks beat 49ers 24–17/
      : /Mariners beat Red Sox 8–3/);

    bus.publish({
      type: "sports-facts",
      payload: { status: "unavailable", favoriteTeam: facts(league, "final").favoriteTeam, game: null }
    });
    assert.equal(displays.at(-1).payload.sports[0].state, "completed");

    harness.setNow(new Date(2026, 8, 3, 0, 0));
    daily.publishSnapshot();
    assert.equal(displays.at(-1).payload.sports.length, 0);
  });
}
