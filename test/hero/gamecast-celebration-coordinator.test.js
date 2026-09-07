const test = require("node:test");
const assert = require("node:assert/strict");
const {
  GamecastCelebrationCoordinator
} = require(
  "../../frontend/coordinator/gamecast-celebration-coordinator"
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

function harness(options = {}) {
  let now = 1000;
  const timers = [];
  const bus = new EventBus();
  const coordinator = new GamecastCelebrationCoordinator(bus, {
    durationMs: 4000,
    queueLimit: 2,
    queueMaxAgeMs: 5000,
    now: () => now,
    setTimer: (callback, delay) => {
      const timer = { callback, delay, cleared: false };
      timers.push(timer);
      return timer;
    },
    clearTimer: (timer) => { timer.cleared = true; },
    ...options
  });
  coordinator.start();
  return {
    bus, coordinator, timers,
    setNow: (value) => { now = value; }
  };
}

function candidate(gameId = "MLB:777", favoriteTeamId = "MLB:SEA") {
  return {
    id: "sports:live:SEA",
    source: "sports",
    type: "sports.live-game",
    mode: "active",
    gamecastIdentity: {
      gameId,
      favoriteTeamId,
      teams: {
        away: { id: "MLB:BOS", logo: "https://example.test/bos.svg" },
        home: { id: "MLB:SEA", logo: "https://example.test/sea.svg" }
      }
    },
    payload: {
      type: "baseball-game"
    }
  };
}

function scoreEvent(id = "score-1", overrides = {}) {
  return {
    schemaVersion: 1,
    id,
    gameId: "MLB:777",
    scoringTeamId: "MLB:SEA",
    scoringSide: "home",
    eventType: "run",
    intensity: "score",
    observedAt: "2026-09-06T20:00:00.000Z",
    ...overrides
  };
}

function display(bus, value) {
  bus.publish({ type: "hero-display", payload: { candidate: value } });
}

test("subscribed coordinator accepts matching favorite score events", () => {
  const { bus, coordinator, timers } = harness();
  display(bus, candidate());
  bus.publish({ type: "gamecast-score-event", payload: scoreEvent() });

  assert.equal(coordinator.active.event.id, "score-1");
  assert.equal(coordinator.active.label, "RUN SCORED");
  assert.equal(timers[0].delay, 4000);
  assert.ok(bus.events.some((event) =>
    event.type === "gamecast-celebration-state"
  ));
});

test("wrong game and production opponent scores are ignored", () => {
  const { bus, coordinator } = harness();
  display(bus, candidate());
  bus.publish({
    type: "gamecast-score-event",
    payload: scoreEvent("wrong-game", { gameId: "MLB:888" })
  });
  bus.publish({
    type: "gamecast-score-event",
    payload: scoreEvent("opponent", { scoringTeamId: "MLB:BOS" })
  });

  assert.equal(coordinator.active, null);
});

test("coordinator resolves the correct away scoring logo", () => {
  const { coordinator } = harness();
  coordinator.handleHeroDisplay(candidate("MLB:777", "MLB:BOS"));
  coordinator.accept(scoreEvent("away", {
    scoringTeamId: "MLB:BOS",
    scoringSide: "away"
  }));

  assert.equal(coordinator.active.logo, "https://example.test/bos.svg");
  assert.notEqual(coordinator.active.logo, "https://example.test/sea.svg");
});

test("coordinator resolves the correct home scoring logo", () => {
  const { coordinator } = harness();
  coordinator.handleHeroDisplay(candidate());
  coordinator.accept(scoreEvent());

  assert.equal(coordinator.active.logo, "https://example.test/sea.svg");
  assert.notEqual(coordinator.active.logo, "https://example.test/bos.svg");
});

test("missing team logo degrades to an empty presentation logo", () => {
  const { coordinator } = harness();
  const withoutLogo = candidate();
  withoutLogo.gamecastIdentity.teams.home.logo = "";
  coordinator.handleHeroDisplay(withoutLogo);
  coordinator.accept(scoreEvent());

  assert.equal(coordinator.active.logo, "");
});

test("session simulation bypasses favorite policy but still requires displayed game", () => {
  const { coordinator } = harness();
  coordinator.handleHeroDisplay(candidate());

  assert.equal(coordinator.accept(scoreEvent("simulation", {
    scoringTeamId: "MLB:BOS",
    simulation: true
  })), true);
  coordinator.clear();
  assert.equal(coordinator.accept(scoreEvent("other-simulation", {
    gameId: "MLB:888",
    simulation: true
  })), false);
});

test("duplicates are ignored and one active celebration owns the timer", () => {
  const { coordinator, timers } = harness();
  coordinator.handleHeroDisplay(candidate());
  assert.equal(coordinator.accept(scoreEvent()), true);
  assert.equal(coordinator.accept(scoreEvent()), false);

  assert.equal(coordinator.queue.length, 0);
  assert.equal(timers.length, 1);
});

test("queue is FIFO and bounded", () => {
  const { coordinator, timers } = harness();
  coordinator.handleHeroDisplay(candidate());
  coordinator.accept(scoreEvent("one"));
  coordinator.accept(scoreEvent("two"));
  coordinator.accept(scoreEvent("three"));
  assert.equal(coordinator.accept(scoreEvent("four")), false);
  assert.deepEqual(coordinator.queue.map((item) => item.event.id), ["two", "three"]);

  timers[0].callback();
  assert.equal(coordinator.active.event.id, "two");
  timers[1].callback();
  assert.equal(coordinator.active.event.id, "three");
});

test("stale queued events expire instead of replaying", () => {
  const { coordinator, timers, setNow } = harness();
  coordinator.handleHeroDisplay(candidate());
  coordinator.accept(scoreEvent("one"));
  coordinator.accept(scoreEvent("two"));
  setNow(7001);
  timers[0].callback();

  assert.equal(coordinator.active, null);
  assert.equal(coordinator.queue.length, 0);
});

test("duration completion removes presentation state", () => {
  const { coordinator, timers, bus } = harness();
  coordinator.handleHeroDisplay(candidate());
  coordinator.accept(scoreEvent());
  timers[0].callback();

  assert.equal(coordinator.getCurrentPresentation(), null);
  assert.equal(bus.events.at(-1).payload.presentation, null);
});

test("same-Gamecast rerender preserves active timer and start time", () => {
  const { coordinator, timers } = harness();
  coordinator.handleHeroDisplay(candidate());
  coordinator.accept(scoreEvent());
  const startedAt = coordinator.active.startedAt;
  coordinator.handleHeroDisplay({
    ...candidate(),
    payload: { ...candidate().payload, score: { away: 3, home: 6 } }
  });

  assert.equal(coordinator.active.startedAt, startedAt);
  assert.equal(timers.length, 1);
  assert.equal(timers[0].cleared, false);
});

test("Gamecast disappearance or identity change clears active and queue", () => {
  for (const replacement of [null, candidate("MLB:888")]) {
    const { coordinator, timers } = harness();
    coordinator.handleHeroDisplay(candidate());
    coordinator.accept(scoreEvent("one"));
    coordinator.accept(scoreEvent("two"));
    coordinator.handleHeroDisplay(replacement);

    assert.equal(coordinator.active, null);
    assert.equal(coordinator.queue.length, 0);
    assert.equal(timers[0].cleared, true);
  }
});

test("stop and simulation reset clear all transient state", () => {
  for (const operation of ["stop", "simulation-reset"]) {
    const { coordinator, bus } = harness();
    coordinator.handleHeroDisplay(candidate());
    coordinator.accept(scoreEvent("one"));
    coordinator.accept(scoreEvent("two"));
    if (operation === "stop") coordinator.stop();
    else bus.publish({
      type: "sports-simulation-state",
      payload: { active: false }
    });

    assert.equal(coordinator.active, null);
    assert.equal(coordinator.queue.length, 0);
  }
});

test("safe production and synthetic label mappings remain explicit", () => {
  const { coordinator } = harness();
  assert.equal(coordinator.getDisplayLabel("run"), "RUN SCORED");
  assert.equal(coordinator.getDisplayLabel("score"), "SCORE");
  assert.equal(coordinator.getDisplayLabel("home-run"), "HOME RUN");
  assert.equal(coordinator.getDisplayLabel("touchdown"), "TOUCHDOWN");
  assert.equal(coordinator.getDisplayLabel("field-goal"), "FIELD GOAL");
  assert.equal(coordinator.getDisplayLabel("unknown"), "SCORE");
});

test("displayed Gamecast asynchronously preloads both teams", async () => {
  const calls = [];
  let finish;
  const teamPaletteStore = {
    preload: (teams) => {
      calls.push(teams);
      return new Promise((resolve) => { finish = resolve; });
    },
    getCached: () => null
  };
  const { coordinator } = harness({ teamPaletteStore });

  coordinator.handleHeroDisplay(candidate());
  assert.deepEqual(calls, []);
  await Promise.resolve();
  assert.deepEqual(calls[0], [
    { teamId: "MLB:BOS", logoUrl: "https://example.test/bos.svg" },
    { teamId: "MLB:SEA", logoUrl: "https://example.test/sea.svg" }
  ]);
  assert.equal(coordinator.displayedGamecast.gameId, "MLB:777");
  finish();
});

test("preload failure cannot alter display or celebration lifecycle", async () => {
  const { coordinator, timers } = harness({
    teamPaletteStore: {
      preload: async () => { throw new Error("palette unavailable"); },
      getCached: () => null
    }
  });
  coordinator.handleHeroDisplay(candidate());
  assert.equal(coordinator.accept(scoreEvent()), true);
  await Promise.resolve();
  await Promise.resolve();

  assert.equal(coordinator.active.colors, null);
  assert.equal(timers.length, 1);
});

test("matching scoring team synchronously maps cached palette colors", () => {
  const lookups = [];
  const { coordinator } = harness({
    teamPaletteStore: {
      preload: async () => {},
      getCached: (team) => {
        lookups.push(team);
        return {
          primary: "#002244",
          secondary: "#69BE28",
          accent: "#A5ACAF",
          textOnPrimary: "#FFFFFF"
        };
      }
    }
  });
  coordinator.handleHeroDisplay(candidate());
  coordinator.accept(scoreEvent());

  assert.deepEqual(lookups, [{
    teamId: "MLB:SEA",
    logoUrl: "https://example.test/sea.svg"
  }]);
  assert.deepEqual(coordinator.active.colors, {
    primary: "#002244"
  });
  assert.equal(coordinator.active.logo, "https://example.test/sea.svg");
});

test("pending palette does not delay activation and late arrival does not restyle", () => {
  let cached = null;
  const { coordinator, timers } = harness({
    teamPaletteStore: {
      preload: () => new Promise(() => {}),
      getCached: () => cached
    }
  });
  coordinator.handleHeroDisplay(candidate());
  coordinator.accept(scoreEvent());
  const active = coordinator.active;

  assert.equal(active.colors, null);
  assert.equal(timers.length, 1);
  cached = { primary: "#002244", textOnPrimary: "#FFFFFF" };
  assert.equal(coordinator.active, active);
  assert.equal(coordinator.active.colors, null);
  assert.equal(timers.length, 1);
});

test("same-display preload reruns safely for store-level dedupe without resetting", async () => {
  let preloads = 0;
  const { coordinator, timers } = harness({
    teamPaletteStore: {
      preload: async () => { preloads += 1; },
      getCached: () => null
    }
  });
  coordinator.handleHeroDisplay(candidate());
  coordinator.accept(scoreEvent());
  const active = coordinator.active;
  coordinator.handleHeroDisplay({
    ...candidate(),
    payload: { type: "baseball-game", score: { away: 1, home: 2 } }
  });
  await Promise.resolve();

  assert.equal(preloads, 2);
  assert.equal(coordinator.active, active);
  assert.equal(timers.length, 1);
});

test("production and simulation ignore colors supplied by score events", () => {
  for (const simulation of [false, true]) {
    const { coordinator } = harness();
    coordinator.handleHeroDisplay(candidate());
    coordinator.accept(scoreEvent(`colors-${simulation}`, {
      simulation,
      colors: { primary: "#FF0000", highlight: "#00FF00" }
    }));
    assert.equal(coordinator.active.colors, null);
  }
});

test("palette integration leaves score events and eligibility policies unchanged", () => {
  const { coordinator } = harness({
    teamPaletteStore: {
      preload: async () => {},
      getCached: () => ({ primary: "#000000", textOnPrimary: "#FFFFFF" })
    }
  });
  const event = scoreEvent();
  const snapshot = structuredClone(event);
  coordinator.handleHeroDisplay(candidate());
  assert.equal(coordinator.accept(event), true);
  assert.deepEqual(event, snapshot);
  coordinator.clear();
  assert.equal(coordinator.accept(scoreEvent("wrong", {
    gameId: "MLB:999"
  })), false);
  assert.equal(coordinator.accept(scoreEvent("opponent", {
    scoringTeamId: "MLB:BOS"
  })), false);
});
