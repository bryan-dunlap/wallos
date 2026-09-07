const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  sportsSimulationProfileRegistry,
  teamPalettePreviewTeams
} = require(
  "../../frontend/providers/sports-simulation-profile-registry"
);
const {
  GamecastCelebrationCoordinator
} = require(
  "../../frontend/coordinator/gamecast-celebration-coordinator"
);

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

function loadSimulationHarness(coordinatorOptions = {}) {
  const bus = new EventBus();
  const teamPaletteStore = coordinatorOptions.teamPaletteStore || null;
  const context = vm.createContext({
    console,
    Date,
    Map,
    window: {
      mosaicApp: { eventBus: bus, teamPaletteStore },
      sportsSimulationProfileRegistry,
      teamPalettePreviewTeams
    }
  });
  const activeSource = fs.readFileSync(
    path.join(
      PROJECT_ROOT,
      "frontend/providers/sports-active-context-generator.js"
    ),
    "utf8"
  );
  const demoSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/providers/demo-context-provider.js"),
    "utf8"
  );
  const heroCoordinatorSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/coordinator/hero-coordinator.js"),
    "utf8"
  );
  vm.runInContext(
    `${activeSource}; ${demoSource}; ${heroCoordinatorSource}; ` +
    "this.Active = SportsActiveContextGenerator; " +
    "this.Demo = DemoContextProvider; " +
    "this.HeroCoordinator = HeroCoordinator;",
    context
  );
  const heroCoordinator = new context.HeroCoordinator(bus);
  const coordinator = new GamecastCelebrationCoordinator(bus, {
    setTimer: () => ({}),
    clearTimer: () => {},
    ...coordinatorOptions
  });
  coordinator.start();
  heroCoordinator.start();
  const activeGenerator = new context.Active();
  activeGenerator.start();
  const demo = new context.Demo();
  demo.start();

  return {
    bus, coordinator, demo, heroCoordinator, activeGenerator,
    teamPaletteStore
  };
}

for (const [eventType, label, intensity] of [
  ["run", "RUN SCORED", "score"],
  ["home-run", "HOME RUN", "major"],
  ["touchdown", "TOUCHDOWN", "major"],
  ["field-goal", "FIELD GOAL", "score"]
]) {
  test(`Developer Tools ${eventType} uses the production coordinator path`, () => {
    const { bus, coordinator, demo } = loadSimulationHarness();
    const event = demo.triggerScoreCelebration(eventType);

    assert.equal(event.simulation, true);
    assert.equal(event.eventType, eventType);
    assert.equal(event.intensity, intensity);
    assert.equal(coordinator.active.event.id, event.id);
    assert.equal(coordinator.active.label, label);
    assert.match(
      coordinator.active.logo,
      eventType === "run" || eventType === "home-run"
        ? /mlbstatic\.com\/team-logos\/136\.svg$/
        : /espncdn\.com\/i\/teamlogos\/nfl\/500\/sea\.png$/
    );
    assert.ok(bus.events.some((item) =>
      item.type === "gamecast-score-event" && item.payload === event
    ));
    assert.ok(bus.events.some((item) =>
      item.type === "gamecast-celebration-state"
    ));
    const displayIndex = bus.events.findIndex((item) =>
      item.type === "hero-display" &&
      item.payload.candidate.gamecastIdentity?.gameId === event.gameId
    );
    const scoreIndex = bus.events.findIndex((item) =>
      item.type === "gamecast-score-event" && item.payload.id === event.id
    );
    assert.ok(displayIndex >= 0);
    assert.ok(scoreIndex > displayIndex);
    assert.equal(bus.events.some((item) => item.type === "config-save"), false);
  });
}

test("clearing Sports Simulator removes its active celebration", () => {
  const { coordinator, demo } = loadSimulationHarness();
  demo.triggerScoreCelebration("run");
  assert.ok(coordinator.active);
  demo.clearSportsSimulation();
  assert.equal(coordinator.active, null);
  assert.equal(coordinator.queue.length, 0);
});

test("an already displayed MLB Gamecast celebrates without rebuilding it", () => {
  const { bus, coordinator, demo } = loadSimulationHarness();
  demo.runSportsSimulation("MLB", "live-bottom");
  const factsBefore = bus.events.filter(
    (event) => event.type === "sports-facts"
  ).length;

  const event = demo.triggerScoreCelebration("run");

  assert.equal(coordinator.active.event.id, event.id);
  assert.equal(
    bus.events.filter((item) => item.type === "sports-facts").length,
    factsBefore
  );
});

test("an already displayed NFL Gamecast celebrates without rebuilding it", () => {
  const { bus, coordinator, demo } = loadSimulationHarness();
  demo.runSportsSimulation("NFL", "live-drive");
  const factsBefore = bus.events.filter(
    (event) => event.type === "sports-facts"
  ).length;

  const event = demo.triggerScoreCelebration("field-goal");

  assert.equal(coordinator.active.event.id, event.id);
  assert.equal(
    bus.events.filter((item) => item.type === "sports-facts").length,
    factsBefore
  );
});

test("switching MLB to NFL waits for the matching display acknowledgement", () => {
  const { bus, coordinator, demo } = loadSimulationHarness();
  demo.runSportsSimulation("MLB", "live-bottom");
  const event = demo.triggerScoreCelebration("touchdown");
  const scoreIndex = bus.events.findIndex(
    (item) => item.type === "gamecast-score-event" &&
      item.payload.id === event.id
  );
  const matchingDisplayIndex = bus.events.findIndex(
    (item) => item.type === "hero-display" &&
      item.payload.candidate.gamecastIdentity?.gameId === event.gameId
  );

  assert.ok(matchingDisplayIndex >= 0);
  assert.ok(scoreIndex > matchingDisplayIndex);
  assert.equal(coordinator.active.event.id, event.id);
  assert.equal(coordinator.active.label, "TOUCHDOWN");
});

test("rapid preview clicks use latest-request-wins with unique IDs", () => {
  const { coordinator, demo } = loadSimulationHarness();
  const first = demo.triggerScoreCelebration("run");
  const second = demo.triggerScoreCelebration("run");
  const third = demo.triggerScoreCelebration("run");

  assert.notEqual(first.id, second.id);
  assert.notEqual(second.id, third.id);
  assert.equal(coordinator.active.event.id, third.id);
  assert.equal(coordinator.queue.length, 0);
});

function createManualClock() {
  let now = 1000;
  let nextId = 0;
  const timers = new Map();

  return {
    now: () => now,
    setTimer(callback, delay) {
      nextId += 1;
      timers.set(nextId, { callback, dueAt: now + delay });
      return nextId;
    },
    clearTimer(id) { timers.delete(id); },
    advance(milliseconds) {
      now += milliseconds;
      const ready = [...timers.entries()]
        .filter(([, timer]) => timer.dueAt <= now)
        .sort((first, second) => first[1].dueAt - second[1].dueAt);
      ready.forEach(([id, timer]) => {
        if (!timers.delete(id)) return;
        timer.callback();
      });
    }
  };
}

for (const [firstType, firstLabel, secondType, secondLabel] of [
  ["home-run", "HOME RUN", "run", "RUN SCORED"],
  ["run", "RUN SCORED", "home-run", "HOME RUN"],
  ["touchdown", "TOUCHDOWN", "field-goal", "FIELD GOAL"],
  ["field-goal", "FIELD GOAL", "touchdown", "TOUCHDOWN"],
  ["home-run", "HOME RUN", "touchdown", "TOUCHDOWN"],
  ["touchdown", "TOUCHDOWN", "run", "RUN SCORED"],
  ["run", "RUN SCORED", "run", "RUN SCORED"]
]) {
  test(`${firstLabel} completes before one-click ${secondLabel}`, () => {
    const clock = createManualClock();
    const { bus, coordinator, demo } = loadSimulationHarness({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer
    });
    let popupPresentation = null;
    bus.subscribe("gamecast-celebration-state", (event) => {
      popupPresentation = event.payload.presentation;
    });

    const first = demo.triggerScoreCelebration(firstType);
    assert.equal(coordinator.active.label, firstLabel);
    assert.equal(popupPresentation.event.id, first.id);

    clock.advance(4000);
    assert.equal(coordinator.active, null);
    assert.equal(coordinator.queue.length, 0);
    assert.equal(popupPresentation, null);
    assert.equal(demo.pendingScoreCelebrations.length, 0);
    assert.equal(demo.displayedSimulationGameId, first.gameId);

    const second = demo.triggerScoreCelebration(secondType);
    assert.equal(coordinator.active.label, secondLabel);
    assert.equal(coordinator.active.event.id, second.id);
    assert.equal(popupPresentation.event.id, second.id);
    assert.notEqual(first.id, second.id);
  });
}

test("active preview is immediately replaced for a full fresh duration", () => {
  const clock = createManualClock();
  const { coordinator, demo } = loadSimulationHarness({
    now: clock.now,
    setTimer: clock.setTimer,
    clearTimer: clock.clearTimer
  });
  demo.triggerScoreCelebration("home-run");
  clock.advance(1000);

  const replacement = demo.triggerScoreCelebration("run");

  assert.equal(coordinator.active.event.id, replacement.id);
  assert.equal(coordinator.active.label, "RUN SCORED");
  assert.equal(coordinator.active.startedAt, 2000);
  assert.equal(coordinator.active.endsAt, 6000);
  assert.equal(coordinator.queue.length, 0);
});

test("one persistent runtime alternates Hero identity across leagues", () => {
  const clock = createManualClock();
  const { bus, coordinator, demo, heroCoordinator, activeGenerator } =
    loadSimulationHarness({
      now: clock.now,
      setTimer: clock.setTimer,
      clearTimer: clock.clearTimer
    });
  const productionMlb = {
    ...sportsSimulationProfileRegistry.createFacts("MLB", "live-bottom"),
    simulation: false
  };
  const productionNfl = {
    ...sportsSimulationProfileRegistry.createFacts("NFL", "live-drive"),
    simulation: false
  };
  activeGenerator.evaluate(productionMlb);
  activeGenerator.evaluate(productionNfl);
  const sequence = [
    ["run", "MLB:", "RUN SCORED"],
    ["touchdown", "NFL:", "TOUCHDOWN"],
    ["home-run", "MLB:", "HOME RUN"],
    ["field-goal", "NFL:", "FIELD GOAL"],
    ["run", "MLB:", "RUN SCORED"]
  ];

  sequence.forEach(([eventType, leaguePrefix, label]) => {
    const event = demo.triggerScoreCelebration(eventType);
    const display = bus.events.filter(
      (item) => item.type === "hero-display"
    ).at(-1).payload.candidate;

    assert.match(display.gamecastIdentity.gameId, new RegExp(`^${leaguePrefix}`));
    assert.equal(display.gamecastIdentity.gameId, event.gameId);
    assert.match(display.id, /^sports:simulation:/);
    assert.equal(display.priority, 101);
    assert.equal(coordinator.active.event.id, event.id);
    assert.equal(coordinator.active.label, label);
    assert.equal(heroCoordinator.activeCandidates.has(display.id), true);
    clock.advance(4000);
    assert.equal(coordinator.active, null);
  });
});

test("cross-league trigger supersedes an active popup and old Hero candidate", () => {
  const { bus, coordinator, demo, heroCoordinator } = loadSimulationHarness();
  const mlb = demo.triggerScoreCelebration("home-run");
  const mlbCandidateId = bus.events.filter(
    (item) => item.type === "hero-display"
  ).at(-1).payload.candidate.id;

  const nfl = demo.triggerScoreCelebration("touchdown");
  const display = bus.events.filter(
    (item) => item.type === "hero-display"
  ).at(-1).payload.candidate;

  assert.notEqual(mlb.gameId, nfl.gameId);
  assert.equal(display.gamecastIdentity.gameId, nfl.gameId);
  assert.equal(heroCoordinator.activeCandidates.has(mlbCandidateId), false);
  assert.equal(coordinator.active.event.id, nfl.id);
  assert.equal(coordinator.active.label, "TOUCHDOWN");
  assert.equal(coordinator.queue.length, 0);
});

test("palette preview registry provides eight qualified real-logo teams without colors", () => {
  assert.deepEqual(
    teamPalettePreviewTeams.map((team) => team.teamId),
    [
      "NFL:SEA", "NFL:SF", "NFL:GB", "NFL:DEN",
      "MLB:SEA", "MLB:LAD", "MLB:NYY", "MLB:BAL"
    ]
  );
  for (const team of teamPalettePreviewTeams) {
    assert.match(team.teamId, /^(?:NFL|MLB):[A-Z0-9]+$/);
    assert.match(
      team.logo,
      /^https:\/\/(?:a\.espncdn\.com|www\.mlbstatic\.com)\//
    );
    assert.equal("colors" in team, false);
    assert.equal("palette" in team, false);
  }
});

test("team preview waits for TeamPaletteStore before publishing score", async () => {
  let resolvePreload;
  let cached = null;
  const calls = [];
  const preload = new Promise((resolve) => { resolvePreload = resolve; });
  const store = {
    preload: (teams) => {
      calls.push(teams);
      return preload;
    },
    getCached: (team) => cached && team.teamId === "NFL:GB"
      ? cached
      : null
  };
  const { bus, coordinator, demo } = loadSimulationHarness({
    teamPaletteStore: store
  });
  const pending = demo.previewTeamPalette("NFL:GB");
  await Promise.resolve();

  assert.equal(
    bus.events.some((event) => event.type === "gamecast-score-event"),
    false
  );
  assert.ok(calls.some((teams) => teams.some((team) =>
    team.teamId === "NFL:GB" &&
    team.logoUrl === "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png"
  )));

  cached = { primary: "#000001", textOnPrimary: "#FFFFFF" };
  resolvePreload();
  const event = await pending;
  assert.equal(event.scoringTeamId, "NFL:GB");
  assert.equal(coordinator.active.event.id, event.id);
  assert.match(coordinator.active.logo, /\/gb\.png$/);
  assert.equal(
    bus.events.some((item) => item.type === "config-save"),
    false
  );
});

test("changing preview teams updates identity and latest request wins", async () => {
  const resolvers = new Map();
  const preloads = new Map();
  const ready = new Set();
  const store = {
    preload: ([team]) => {
      if (!preloads.has(team.teamId)) {
        preloads.set(team.teamId, new Promise((resolve) => {
          resolvers.set(team.teamId, () => {
            ready.add(team.teamId);
            resolve();
          });
        }));
      }
      return preloads.get(team.teamId);
    },
    getCached: ({ teamId }) => ready.has(teamId)
      ? { primary: "#000001", textOnPrimary: "#FFFFFF" }
      : null
  };
  const { bus, demo } = loadSimulationHarness({ teamPaletteStore: store });
  const first = demo.previewTeamPalette("MLB:NYY");
  const second = demo.previewTeamPalette("MLB:BAL");
  await Promise.resolve();
  resolvers.get("MLB:BAL")();
  const secondEvent = await second;
  resolvers.get("MLB:NYY")();
  const firstEvent = await first;

  assert.equal(firstEvent, null);
  assert.equal(secondEvent.scoringTeamId, "MLB:BAL");
  assert.equal(secondEvent.gameId, "MLB:PALETTE-PREVIEW:BAL");
  const scoreEvents = bus.events.filter(
    (event) => event.type === "gamecast-score-event"
  );
  assert.deepEqual(
    scoreEvents.map((event) => event.payload.scoringTeamId),
    ["MLB:BAL"]
  );
});

test("Sports Simulator clear cancels pending palette preview state", async () => {
  let finish;
  let ready = false;
  const preload = new Promise((resolve) => { finish = resolve; });
  const store = {
    preload: () => preload,
    getCached: () => ready ? {
      primary: "#000001", textOnPrimary: "#FFFFFF"
    } : null
  };
  const { bus, coordinator, demo } = loadSimulationHarness({
    teamPaletteStore: store
  });
  const pending = demo.previewTeamPalette("NFL:DEN");
  demo.clearSportsSimulation();
  ready = true;
  finish();

  assert.equal(await pending, null);
  assert.equal(coordinator.active, null);
  assert.equal(
    bus.events.some((event) => event.type === "gamecast-score-event"),
    false
  );
});
