const test = require("node:test");
const assert = require("node:assert/strict");
const {
  AttentionOverrideRegistry
} = require("../../backend/display-power/attention-override-registry");

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
    clearTimeout: (id) => timers.delete(id),
    advanceTo(value) {
      now = new Date(value).getTime();
      const due = [...timers.entries()]
        .filter(([, timer]) => timer.due <= now)
        .sort((a, b) => a[1].due - b[1].due);
      due.forEach(([id, timer]) => {
        timers.delete(id);
        timer.callback();
      });
    }
  };
}

test("overrides activate, update, deactivate, and publish snapshots", () => {
  const clock = createClock("2026-09-07T16:00:00Z");
  const registry = new AttentionOverrideRegistry(clock);
  const events = [];
  registry.subscribe((event) => events.push(event));

  const first = registry.activate({ id: "one", source: "test", reason: "first" });
  registry.activate({ id: "two", source: "test", reason: "second" });
  assert.equal(registry.getActive().length, 2);
  assert.equal(registry.update(first, { reason: "updated" }), true);
  assert.equal(registry.getActive().find(({ id }) => id === first).reason, "updated");
  assert.equal(registry.deactivate(first), true);
  assert.deepEqual(registry.getActive().map(({ id }) => id), ["two"]);
  assert.deepEqual(events.map(({ type }) => type), ["activate", "activate", "update", "deactivate"]);
});

test("overrides expire and notify subscribers", () => {
  const clock = createClock("2026-09-07T16:00:00Z");
  const registry = new AttentionOverrideRegistry(clock);
  const events = [];
  registry.subscribe((event) => events.push(event.type));
  registry.activate({ id: "expiring", expiresAt: "2026-09-07T16:01:00Z" });

  clock.advanceTo("2026-09-07T16:01:00Z");
  assert.deepEqual(registry.getActive(), []);
  assert.deepEqual(events, ["activate", "expire"]);
});
