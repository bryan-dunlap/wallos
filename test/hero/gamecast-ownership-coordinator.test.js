const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GamecastOwnershipCoordinator,
  GAMECAST_PRIMARY_WINDOW_MS,
  GAMECAST_SECONDARY_WINDOW_MS
} = require(
  "../../frontend/coordinator/gamecast-ownership-coordinator"
);

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

function candidate(id, rank, critical = false, options = {}) {
  return {
    id,
    source: "sports",
    type: "sports.live-game",
    mode: "active",
    priority: 100,
    simulation: false,
    payload: { type: options.type || "baseball-game" },
    gamecastIdentity: { gameId: options.gameId || `MLB:${id}` },
    gamecastOwnership: { favoriteRank: rank, critical }
  };
}

function harness(options = {}) {
  const bus = new EventBus();
  const timers = [];
  const coordinator = new GamecastOwnershipCoordinator(bus, {
    setTimer: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cleared = true; },
    now: options.now
  });
  coordinator.start();
  const update = (value) => bus.publish({
    type: "gamecast-ownership-candidate",
    payload: { candidate: value }
  });
  const withdraw = (id) => bus.publish({
    type: "gamecast-ownership-withdraw",
    payload: { id }
  });
  const displays = () => bus.events.filter(
    (event) => event.type === "hero-candidate"
  ).map((event) => event.payload.candidate.id);
  return { bus, coordinator, timers, update, withdraw, displays };
}

test("neither critical uses favorite rank and rotates 4m/1m repeatedly", () => {
  const { coordinator, timers, update, displays } = harness();
  update(candidate("rank-1", 1));
  update(candidate("rank-0", 0));

  assert.equal(coordinator.primaryCandidateId, "rank-0");
  assert.equal(coordinator.secondaryCandidateId, "rank-1");
  assert.equal(coordinator.ownedCandidateId, "rank-0");
  assert.equal(timers.at(-1).delay, GAMECAST_PRIMARY_WINDOW_MS);

  timers.at(-1).callback();
  assert.equal(coordinator.ownedCandidateId, "rank-1");
  assert.equal(timers.at(-1).delay, GAMECAST_SECONDARY_WINDOW_MS);

  timers.at(-1).callback();
  assert.equal(coordinator.ownedCandidateId, "rank-0");
  assert.equal(timers.at(-1).delay, GAMECAST_PRIMARY_WINDOW_MS);
  timers.at(-1).callback();
  assert.equal(coordinator.ownedCandidateId, "rank-1");
  assert.deepEqual(displays().slice(-4), ["rank-0", "rank-1", "rank-0", "rank-1"]);
});

test("sole critical candidate overrides rank and both critical revert to rank", () => {
  const { coordinator, timers, update } = harness();
  update(candidate("rank-0", 0));
  update(candidate("rank-1", 1, true));
  assert.equal(coordinator.primaryCandidateId, "rank-1");

  const firstTimer = timers.at(-1);
  update(candidate("rank-0", 0, true));
  assert.equal(firstTimer.cleared, true);
  assert.equal(coordinator.primaryCandidateId, "rank-0");
  assert.equal(coordinator.ownedCandidateId, "rank-0");
  assert.equal(timers.at(-1).delay, GAMECAST_PRIMARY_WINDOW_MS);
});

test("sole critical rank-0 remains primary", () => {
  const { coordinator, update } = harness();
  update(candidate("rank-0", 0, true));
  update(candidate("rank-1", 1));
  assert.equal(coordinator.primaryCandidateId, "rank-0");
});

test("critical transition changes Primary immediately with a fresh window", () => {
  const { coordinator, timers, update } = harness();
  update(candidate("rank-0", 0));
  update(candidate("rank-1", 1));
  const originalTimer = timers.at(-1);

  update(candidate("rank-1", 1, true));

  assert.equal(originalTimer.cleared, true);
  assert.equal(coordinator.primaryCandidateId, "rank-1");
  assert.equal(coordinator.ownedCandidateId, "rank-1");
  assert.equal(timers.at(-1).delay, GAMECAST_PRIMARY_WINDOW_MS);
});

test("unchanged updates refresh content without resetting the window", () => {
  const { coordinator, timers, update, displays } = harness();
  update(candidate("rank-0", 0));
  update(candidate("rank-1", 1));
  const timerCount = timers.length;
  const activeTimer = timers.at(-1);

  update({ ...candidate("rank-0", 0), headline: "Updated score" });

  assert.equal(timers.length, timerCount);
  assert.equal(activeTimer.cleared, false);
  assert.equal(coordinator.ownedCandidateId, "rank-0");
  assert.equal(displays().at(-1), "rank-0");
});

test("two to one cancels rotation and remaining candidate owns continuously", () => {
  for (const withdrawId of ["rank-0", "rank-1"]) {
    const { coordinator, timers, update, withdraw } = harness();
    update(candidate("rank-0", 0));
    update(candidate("rank-1", 1));
    if (withdrawId === "rank-1") timers.at(-1).callback();
    const activeTimer = timers.at(-1);

    withdraw(withdrawId);

    const remaining = withdrawId === "rank-0" ? "rank-1" : "rank-0";
    assert.equal(activeTimer.cleared, true);
    assert.equal(coordinator.ownedCandidateId, remaining);
    assert.equal(coordinator.timer, null);
    assert.equal(coordinator.secondaryCandidateId, null);
  }
});

test("one to two starts a fresh Primary window", () => {
  const { coordinator, timers, update } = harness();
  update(candidate("rank-1", 1));
  assert.equal(coordinator.timer, null);
  update(candidate("rank-0", 0));
  assert.equal(coordinator.ownedCandidateId, "rank-0");
  assert.equal(timers.at(-1).delay, GAMECAST_PRIMARY_WINDOW_MS);
});

test("stale callbacks cannot resurrect withdrawn ownership", () => {
  const { coordinator, timers, update, withdraw } = harness();
  update(candidate("rank-0", 0));
  update(candidate("rank-1", 1));
  const staleCallback = timers.at(-1).callback;
  withdraw("rank-1");
  staleCallback();
  assert.equal(coordinator.ownedCandidateId, "rank-0");
  assert.equal(coordinator.timer, null);
});

test("three-plus fallback is rank/critical deterministic and timer-free", () => {
  const first = harness();
  [candidate("c", 2), candidate("a", 0), candidate("b", 1)]
    .forEach(first.update);
  assert.equal(first.coordinator.ownedCandidateId, "a");
  assert.equal(first.coordinator.timer, null);

  const second = harness();
  [candidate("b", 1), candidate("c", 2, true), candidate("a", 0)]
    .forEach(second.update);
  assert.equal(second.coordinator.ownedCandidateId, "c");
  assert.equal(second.coordinator.timer, null);
});

test("simulation candidates are rejected by production ownership", () => {
  const { coordinator, update } = harness();
  update({ ...candidate("simulation", 0), simulation: true, priority: 101 });
  assert.equal(coordinator.candidates.size, 0);
  assert.equal(coordinator.ownedCandidateId, null);
});

test("score events neither change ownership nor restart its window", () => {
  const { bus, coordinator, timers, update } = harness();
  update(candidate("rank-0", 0));
  update(candidate("rank-1", 1));
  const activeTimer = timers.at(-1);
  const timerCount = timers.length;

  bus.publish({
    type: "gamecast-score-event",
    payload: { gameId: "MLB:rank-1" }
  });

  assert.equal(coordinator.ownedCandidateId, "rank-0");
  assert.equal(coordinator.timer, activeTimer);
  assert.equal(timers.length, timerCount);
});

test("typed-final expiry removes eligibility and hands ownership to the remaining game", () => {
  let now = Date.parse("2026-09-06T12:00:00.000Z");
  const { coordinator, timers, update } = harness({ now: () => now });
  update(candidate("rank-1", 1));
  update({
    ...candidate("rank-0-final", 0),
    expiresAt: "2026-09-06T12:01:00.000Z"
  });
  const expiryTimer = timers.find((timer) => timer.delay === 60_000);

  assert.equal(coordinator.ownedCandidateId, "rank-0-final");
  now += 60_000;
  expiryTimer.callback();

  assert.equal(coordinator.candidates.has("rank-0-final"), false);
  assert.equal(coordinator.ownedCandidateId, "rank-1");
  assert.equal(coordinator.timer, null);
});

test("stop clears the timer, candidates, and owned Hero candidate", () => {
  const { bus, coordinator, timers, update } = harness();
  update(candidate("rank-0", 0));
  update(candidate("rank-1", 1));
  coordinator.stop();
  assert.equal(timers.at(-1).cleared, true);
  assert.equal(coordinator.candidates.size, 0);
  assert.equal(coordinator.ownedCandidateId, null);
  assert.equal(bus.events.at(-1).type, "hero-candidate-withdraw");
});

test("default timers retain the browser global receiver", () => {
  const originalSetTimeout = globalThis.setTimeout;
  const originalClearTimeout = globalThis.clearTimeout;
  const timers = [];
  globalThis.setTimeout = function (callback, delay) {
    assert.equal(this, globalThis);
    const timer = { callback, delay };
    timers.push(timer);
    return timer;
  };
  globalThis.clearTimeout = function () {
    assert.equal(this, globalThis);
  };

  try {
    const bus = new EventBus();
    const coordinator = new GamecastOwnershipCoordinator(bus);
    coordinator.start();
    bus.publish({
      type: "gamecast-ownership-candidate",
      payload: { candidate: candidate("rank-0", 0) }
    });
    bus.publish({
      type: "gamecast-ownership-candidate",
      payload: { candidate: candidate("rank-1", 1) }
    });

    assert.equal(timers.at(-1).delay, GAMECAST_PRIMARY_WINDOW_MS);
    timers.at(-1).callback();
    assert.equal(coordinator.ownedCandidateId, "rank-1");
    assert.equal(timers.at(-1).delay, GAMECAST_SECONDARY_WINDOW_MS);
    coordinator.stop();
  } finally {
    globalThis.setTimeout = originalSetTimeout;
    globalThis.clearTimeout = originalClearTimeout;
  }
});
