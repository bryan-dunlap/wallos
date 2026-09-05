const test = require("node:test");
const assert = require("node:assert/strict");
const {
  DAYS,
  validateDisplayPowerSchedule
} = require("../../backend/display-power/display-schedule-config");
const {
  createDisplayPowerRuntime
} = require("../../backend/display-power/display-power-runtime");
const {
  SimulatedDisplayPowerAdapter
} = require("../../backend/display-power/adapters/simulated-display-power-adapter");

function createSchedule(days = {}, enabled = true) {
  return {
    enabled,
    timeZone: "America/Los_Angeles",
    days: Object.fromEntries(DAYS.map((day) => [day, days[day] || []]))
  };
}

function createClock(initial) {
  let now = new Date(initial).getTime();
  let nextId = 1;
  const timers = new Map();

  return {
    now: () => now,
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout(id) {
      timers.delete(id);
    },
    async advanceTo(value, runtime) {
      now = new Date(value).getTime();
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.due <= now)
        .sort((first, second) => first[1].due - second[1].due);

      due.forEach(([id, timer]) => {
        timers.delete(id);
        timer.callback();
      });
      await runtime.controller.queue;
    }
  };
}

test("runtime starts with a simulated adapter and force-applies current state", async () => {
  const adapter = new SimulatedDisplayPowerAdapter();
  const runtime = createDisplayPowerRuntime({
    schedule: createSchedule({}, false),
    adapter,
    now: () => new Date("2026-09-07T17:00:00Z").getTime()
  });

  await runtime.start();
  assert.deepEqual(adapter.calls.map(({ state }) => state), ["on"]);
  assert.equal(runtime.getStatus().adapterCapabilities.simulated, true);
  assert.equal(runtime.getStatus().schedulingEnabled, false);
  runtime.stop();
});

test("schedule updates reconcile immediately without redundant same-state calls", async () => {
  const adapter = new SimulatedDisplayPowerAdapter();
  const runtime = createDisplayPowerRuntime({
    schedule: createSchedule({}, false),
    adapter,
    now: () => new Date("2026-09-07T17:00:00Z").getTime()
  });
  const offSchedule = createSchedule({
    monday: [{ start: "08:00", end: "09:00" }]
  });

  await runtime.start();
  await runtime.updateSchedule(offSchedule);
  await runtime.updateSchedule(offSchedule);
  assert.deepEqual(adapter.calls.map(({ state }) => state), ["on", "off"]);
  assert.equal(runtime.getStatus().baselineDesiredState, "off");
  runtime.stop();
});

test("generic overrides change runtime effective state without sports wiring", async () => {
  const adapter = new SimulatedDisplayPowerAdapter();
  const runtime = createDisplayPowerRuntime({
    schedule: createSchedule({
      monday: [{ start: "08:00", end: "09:00" }]
    }),
    adapter,
    now: () => new Date("2026-09-07T17:00:00Z").getTime()
  });

  await runtime.start();
  runtime.overrideRegistry.activate({
    id: "test-attention",
    source: "test",
    reason: "runtime-test"
  });
  await runtime.controller.queue;
  assert.deepEqual(adapter.calls.map(({ state }) => state), ["off", "on"]);
  assert.equal(runtime.getStatus().attentionOverrideActive, true);
  assert.equal(runtime.getStatus().effectiveDesiredState, "on");
  runtime.stop();
});

test("runtime status includes the next schedule boundary", () => {
  const runtime = createDisplayPowerRuntime({
    schedule: createSchedule({
      monday: [{ start: "13:30", end: "21:00" }]
    }),
    now: () => new Date("2026-09-07T19:00:00Z").getTime()
  });

  assert.equal(runtime.getStatus().baselineDesiredState, "off");
  assert.equal(runtime.getStatus().nextBoundary, "2026-09-07T20:30:00.000Z");
  runtime.stop();
});

test("validated saves drive one near-term boundary and immediate edit reconciliation", async () => {
  const clock = createClock("2026-09-07T17:00:00Z");
  const adapter = new SimulatedDisplayPowerAdapter();
  const runtime = createDisplayPowerRuntime({
    schedule: createSchedule({}, false),
    adapter,
    ...clock
  });
  const nearBoundarySchedule = validateDisplayPowerSchedule(createSchedule({
    monday: [{ start: "10:00", end: "10:03" }]
  }));

  await runtime.start();
  await runtime.updateSchedule(nearBoundarySchedule);
  assert.equal(runtime.getStatus().baselineDesiredState, "on");
  assert.equal(runtime.getStatus().effectiveDesiredState, "on");
  assert.equal(runtime.getStatus().nextBoundary, "2026-09-07T17:03:00.000Z");
  assert.deepEqual(adapter.calls.map(({ state }) => state), ["on"]);

  await clock.advanceTo("2026-09-07T17:03:00Z", runtime);
  assert.equal(runtime.getStatus().baselineDesiredState, "off");
  assert.equal(runtime.getStatus().effectiveDesiredState, "off");
  assert.deepEqual(adapter.calls.map(({ state }) => state), ["on", "off"]);
  await runtime.controller.requestReconciliation("validation");
  assert.deepEqual(adapter.calls.map(({ state }) => state), ["on", "off"]);

  await runtime.updateSchedule(validateDisplayPowerSchedule(createSchedule({
    monday: [{ start: "10:00", end: "11:00" }]
  })));
  assert.equal(runtime.getStatus().effectiveDesiredState, "on");
  assert.deepEqual(
    adapter.calls.map(({ state }) => state),
    ["on", "off", "on"]
  );

  await runtime.updateSchedule(createSchedule({
    monday: [{ start: "08:00", end: "09:00" }]
  }));
  await runtime.updateSchedule(createSchedule({}, false));
  assert.equal(runtime.getStatus().baselineDesiredState, "on");
  assert.equal(runtime.getStatus().effectiveDesiredState, "on");
  assert.deepEqual(
    adapter.calls.map(({ state }) => state),
    ["on", "off", "on", "off", "on"]
  );

  await runtime.updateSchedule(createSchedule({}, true));
  assert.equal(runtime.getStatus().scheduleEmpty, true);
  assert.equal(runtime.getStatus().effectiveDesiredState, "on");
  assert.deepEqual(
    adapter.calls.map(({ state }) => state),
    ["on", "off", "on", "off", "on"]
  );
  assert.equal(adapter.getCapabilities().simulated, true);
  runtime.stop();
});
