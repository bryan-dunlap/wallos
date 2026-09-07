const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  GamecastOwnershipCoordinator,
  GAMECAST_PRIMARY_WINDOW_MS,
  GAMECAST_SECONDARY_WINDOW_MS
} = require("../../frontend/coordinator/gamecast-ownership-coordinator");
const {
  GamecastCelebrationCoordinator
} = require("../../frontend/coordinator/gamecast-celebration-coordinator");
const {
  sportsSimulationProfileRegistry
} = require("../../frontend/providers/sports-simulation-profile-registry");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

class EventBus {
  constructor() { this.subscribers = new Map(); this.events = []; }
  subscribe(type, callback) {
    if (!this.subscribers.has(type)) this.subscribers.set(type, new Set());
    this.subscribers.get(type).add(callback);
    return () => this.subscribers.get(type)?.delete(callback);
  }
  publish(event) {
    this.events.push(event);
    for (const callback of this.subscribers.get(event.type) || []) callback(event);
  }
}

function createHarness() {
  const bus = new EventBus();
  const timers = [];
  const context = vm.createContext({
    console,
    Date,
    Map,
    window: {
      mosaicApp: { eventBus: bus },
      sportsSimulationProfileRegistry
    }
  });
  const sources = [
    "frontend/providers/sports-active-context-generator.js",
    "frontend/providers/demo-context-provider.js",
    "frontend/coordinator/hero-coordinator.js"
  ].map((file) => fs.readFileSync(path.join(PROJECT_ROOT, file), "utf8"));
  vm.runInContext(
    sources.join("\n") +
      ";this.Demo=DemoContextProvider;this.Hero=HeroCoordinator;",
    context
  );
  const ownership = new GamecastOwnershipCoordinator(bus, {
    primaryWindowMs: 8_000,
    secondaryWindowMs: 2_000,
    candidateEventType: "gamecast-ownership-simulation-candidate",
    withdrawEventType: "gamecast-ownership-simulation-withdraw",
    stateEventType: "gamecast-ownership-simulation-state",
    allowSimulation: true,
    setTimer: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cleared = true; }
  });
  const hero = new context.Hero(bus);
  const celebration = new GamecastCelebrationCoordinator(bus, {
    setTimer: () => ({}), clearTimer: () => {}
  });
  ownership.start();
  hero.start();
  celebration.start();
  const demo = new context.Demo();
  demo.start();
  const fire = (delay) => {
    const timer = timers.findLast((item) =>
      !item.cleared && item.delay === delay
    );
    assert.ok(timer, `expected active ${delay}ms timer`);
    timer.callback();
  };
  const displayedGameIds = () => bus.events.filter(
    (event) => event.type === "hero-display"
  ).map((event) => event.payload.candidate.gamecastIdentity?.gameId)
    .filter(Boolean);
  return {
    bus, ownership, hero, celebration, demo,
    timers, fire, displayedGameIds
  };
}

test("Test Rotation independently uses real coordinator for repeated 8s/2s rotation", () => {
  const {
    bus, ownership, demo, fire, displayedGameIds
  } = createHarness();
  const started = demo.startOwnershipScenario("rotation");

  assert.equal(started.nfl.id, "sports:ownership-simulation:nfl");
  assert.equal(started.mlb.id, "sports:ownership-simulation:mlb");
  assert.equal(started.nfl.priority, 101);
  assert.equal(started.mlb.priority, 101);
  assert.equal(
    started.nfl.gamecastIdentity.gameId,
    "NFL:OWNERSHIP-SIM:SEA-SF"
  );
  assert.equal(
    started.mlb.gamecastIdentity.gameId,
    "MLB:OWNERSHIP-SIM:SEA-LAA"
  );
  assert.equal(started.nfl.gamecastOwnership.favoriteRank, 0);
  assert.equal(started.mlb.gamecastOwnership.favoriteRank, 1);
  assert.equal(started.nfl.gamecastOwnership.critical, false);
  assert.equal(started.mlb.gamecastOwnership.critical, false);
  assert.equal(ownership.ownedCandidateId, started.nfl.id);
  assert.equal(ownership.primaryWindowMs, 8_000);
  assert.equal(ownership.secondaryWindowMs, 2_000);
  assert.equal(bus.events.some((event) => event.type === "config-save"), false);
  assert.equal(displayedGameIds().at(-1), "NFL:OWNERSHIP-SIM:SEA-SF");

  fire(8_000);
  assert.equal(ownership.ownedCandidateId, started.mlb.id);
  assert.equal(displayedGameIds().at(-1), "MLB:OWNERSHIP-SIM:SEA-LAA");
  fire(2_000);
  assert.equal(ownership.ownedCandidateId, started.nfl.id);
  assert.equal(displayedGameIds().at(-1), "NFL:OWNERSHIP-SIM:SEA-SF");
  fire(8_000);
  assert.equal(ownership.ownedCandidateId, started.mlb.id);
  fire(2_000);
  assert.equal(ownership.ownedCandidateId, started.nfl.id);
  assert.ok(bus.events.some((event) => event.type === "hero-display"));
});

test("Mariners Takes Priority independently establishes the sole-critical state", () => {
  const { ownership, demo } = createHarness();
  const { nfl, mlb } = demo.startOwnershipScenario("mariners-priority");

  assert.equal(nfl.gamecastOwnership.critical, false);
  assert.equal(mlb.gamecastOwnership.critical, true);
  assert.equal(ownership.ownedCandidateId, mlb.id);
  assert.equal(ownership.timer.delay, 8_000);
});

test("Seahawks Takes Priority independently establishes both-critical rank order", () => {
  const { ownership, demo } = createHarness();
  const { nfl, mlb } = demo.startOwnershipScenario("seahawks-priority");

  assert.equal(nfl.gamecastOwnership.critical, true);
  assert.equal(mlb.gamecastOwnership.critical, true);
  assert.equal(ownership.ownedCandidateId, nfl.id);
  assert.equal(ownership.timer.delay, 8_000);
});

test("Test Single Game independently gives Seahawks continuous ownership", () => {
  const { ownership, demo, timers } = createHarness();
  const { nfl, mlb } = demo.startOwnershipScenario("single-game");

  assert.equal(mlb, null);
  assert.equal(ownership.candidates.size, 1);
  assert.equal(ownership.ownedCandidateId, nfl.id);
  assert.equal(ownership.timer, null);
  assert.equal(timers.some((timer) => timer.delay === 8_000), false);
});

test("scenario switching and reset remove candidates and invalidate stale timers", () => {
  const { ownership, demo } = createHarness();
  demo.startOwnershipScenario("rotation");
  const staleCallback = ownership.timer.callback;
  const priority = demo.startOwnershipScenario("mariners-priority");

  assert.equal(ownership.candidates.size, 2);
  assert.equal(ownership.ownedCandidateId, priority.mlb.id);
  staleCallback();
  assert.equal(ownership.ownedCandidateId, priority.mlb.id);

  demo.resetOwnershipSimulation();
  assert.equal(ownership.candidates.size, 0);
  assert.equal(ownership.ownedCandidateId, null);
  assert.equal(ownership.timer, null);
});

test("ownership simulation lets scoring controls validate displayed-game matching", () => {
  const { ownership, celebration, demo, fire } = createHarness();
  const { mlb } = demo.startOwnershipScenario("rotation");

  const rejected = demo.triggerScoreCelebration("run");
  assert.notEqual(rejected.gameId, ownership.candidates.get(
    ownership.ownedCandidateId
  ).gamecastIdentity.gameId);
  assert.equal(celebration.active, null);

  fire(8_000);
  assert.equal(ownership.ownedCandidateId, mlb.id);
  const accepted = demo.triggerScoreCelebration("run");
  assert.equal(celebration.active.event.id, accepted.id);
});

test("simulator overrides do not alter production timing constants", () => {
  assert.equal(GAMECAST_PRIMARY_WINDOW_MS, 240_000);
  assert.equal(GAMECAST_SECONDARY_WINDOW_MS, 60_000);
  const production = new GamecastOwnershipCoordinator(new EventBus());
  assert.equal(production.primaryWindowMs, 240_000);
  assert.equal(production.secondaryWindowMs, 60_000);
});
