const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AttentionOverrideRegistry
} = require("../../backend/display-power/attention-override-registry");
const {
  DisplayController
} = require("../../backend/display-power/display-controller");
const {
  resolveEffectiveDisplayState
} = require("../../backend/display-power/display-power-policy");
const {
  SimulatedDisplayPowerAdapter
} = require("../../backend/display-power/adapters/simulated-display-power-adapter");
const {
  NoopDisplayPowerAdapter
} = require("../../backend/display-power/adapters/noop-display-power-adapter");

function createHarness(initial, baseline = "on") {
  let now = new Date(initial).getTime();
  let nextId = 1;
  let desiredBaseline = baseline;
  let boundary = null;
  const timers = new Map();
  const clock = {
    now: () => now,
    setTimeout(callback, delay) {
      const id = nextId++;
      timers.set(id, { callback, due: now + delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id)
  };
  const registry = new AttentionOverrideRegistry(clock);
  const adapter = new SimulatedDisplayPowerAdapter();
  const controller = new DisplayController({
    schedule: {},
    overrideRegistry: registry,
    adapter,
    ...clock,
    retryDelays: [1_000],
    evaluator: () => ({
      baselineDesiredState: desiredBaseline,
      nextBoundary: boundary,
      reason: "test"
    })
  });

  async function advanceTo(value) {
    now = new Date(value).getTime();
    let ran = true;
    while (ran) {
      ran = false;
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.due <= now)
        .sort((a, b) => a[1].due - b[1].due);
      if (due.length > 0) {
        ran = true;
        due.forEach(([id, timer]) => {
          timers.delete(id);
          timer.callback();
        });
        await controller.queue;
      }
    }
  }

  return {
    adapter,
    controller,
    registry,
    setBaseline(value) { desiredBaseline = value; },
    setBoundary(value) { boundary = value; },
    advanceTo,
    timers
  };
}

test("effective policy is baseline ON or any active override", () => {
  assert.equal(resolveEffectiveDisplayState("on", []), "on");
  assert.equal(resolveEffectiveDisplayState("off", []), "off");
  assert.equal(resolveEffectiveDisplayState("off", [{ id: "one" }]), "on");
});

test("startup force-applies ON and OFF", async () => {
  const on = createHarness("2026-09-07T16:00:00Z", "on");
  const off = createHarness("2026-09-07T16:00:00Z", "off");

  await on.controller.start();
  await off.controller.start();
  assert.deepEqual(on.adapter.calls.map(({ state }) => state), ["on"]);
  assert.deepEqual(off.adapter.calls.map(({ state }) => state), ["off"]);
});

test("successful same-state reconciliations are deduplicated", async () => {
  const harness = createHarness("2026-09-07T16:00:00Z", "on");
  await harness.controller.start();
  await harness.controller.requestReconciliation("manual");
  assert.equal(harness.adapter.calls.length, 1);
});

test("an active override across an OFF boundary avoids OFF/ON cycling", async () => {
  const harness = createHarness("2026-09-07T16:00:00Z", "on");
  harness.setBoundary("2026-09-07T17:00:00Z");
  harness.registry.activate({ id: "attention" });
  await harness.controller.start();
  harness.setBaseline("off");
  harness.setBoundary(null);
  await harness.advanceTo("2026-09-07T17:00:00Z");
  assert.deepEqual(harness.adapter.calls.map(({ state }) => state), ["on"]);
});

test("override ending outside schedule turns OFF", async () => {
  const harness = createHarness("2026-09-07T16:00:00Z", "off");
  harness.registry.activate({ id: "attention" });
  await harness.controller.start();
  harness.registry.deactivate("attention");
  await harness.controller.queue;
  assert.deepEqual(harness.adapter.calls.map(({ state }) => state), ["on", "off"]);
});

test("override ending inside schedule remains ON", async () => {
  const harness = createHarness("2026-09-07T16:00:00Z", "on");
  harness.registry.activate({ id: "attention" });
  await harness.controller.start();
  harness.registry.deactivate("attention");
  await harness.controller.queue;
  assert.deepEqual(harness.adapter.calls.map(({ state }) => state), ["on"]);
});

test("adapter failures retry and recover without recording failed state", async () => {
  const harness = createHarness("2026-09-07T16:00:00Z", "off");
  harness.adapter.fail = (call, attempt) => attempt === 1;
  await harness.controller.start();
  assert.equal(harness.controller.getDiagnostics().lastSuccessfullyAppliedState, null);
  await harness.advanceTo("2026-09-07T16:00:01Z");
  assert.deepEqual(harness.adapter.calls.map(({ status }) => status), ["failed", "applied"]);
  assert.equal(harness.controller.getDiagnostics().lastSuccessfullyAppliedState, "off");
});

test("a newer desired state supersedes a stale retry", async () => {
  const harness = createHarness("2026-09-07T16:00:00Z", "off");
  harness.adapter.fail = (call, attempt) => attempt === 1;
  await harness.controller.start();
  harness.adapter.fail = null;
  harness.setBaseline("on");
  await harness.controller.setSchedule({ enabled: false });
  await harness.advanceTo("2026-09-07T16:00:02Z");
  assert.deepEqual(harness.adapter.calls.map(({ state }) => state), ["off", "on"]);
});

test("schedule changes reconcile immediately", async () => {
  const harness = createHarness("2026-09-07T16:00:00Z", "off");
  await harness.controller.start();
  harness.setBaseline("on");
  await harness.controller.setSchedule({ enabled: false });
  assert.deepEqual(harness.adapter.calls.map(({ state }) => state), ["off", "on"]);
});

test("diagnostics are safe and the no-op adapter exposes no physical capability", async () => {
  const harness = createHarness("2026-09-07T16:00:00Z", "on");
  await harness.controller.start();
  const diagnostics = harness.controller.getDiagnostics();
  assert.equal(diagnostics.activeOverrideCount, 0);
  assert.equal(diagnostics.adapterCapabilities.simulated, true);
  assert.deepEqual(new NoopDisplayPowerAdapter().getCapabilities(), {
    canSetPower: false,
    canReadPower: false,
    simulated: false
  });
});
