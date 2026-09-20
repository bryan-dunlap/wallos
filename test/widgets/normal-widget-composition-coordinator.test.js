const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  NormalWidgetCompositionCoordinator
} = require(
  "../../frontend/widgets/normal-widget-composition-coordinator"
);

class FakeNode {
  constructor() {
    this.children = [];
    this.parentNode = null;
    this.dataset = {};
    this.hidden = false;
    this.className = "";
    this.classes = new Set();
    this.classList = {
      toggle: (name, force) => force
        ? this.classes.add(name)
        : this.classes.delete(name),
      add: (...names) => names.forEach((name) => this.classes.add(name)),
      remove: (...names) => names.forEach((name) => this.classes.delete(name))
    };
  }

  append(child) {
    if (child.parentNode) {
      child.parentNode.children = child.parentNode.children
        .filter((entry) => entry !== child);
    }
    child.parentNode = this;
    this.children.push(child);
  }

  querySelector(selector) {
    if (selector !== ".normal-widget-surface") return null;

    return this.children.find((child) =>
      child.classes.has("normal-widget-surface")
    ) || null;
  }
}

class FakeDocument {
  constructor() {
    this.hidden = false;
    this.listeners = new Map();
  }

  createDocumentFragment() { return new FakeNode(); }
  createElement() { return new FakeNode(); }
  addEventListener(type, callback) { this.listeners.set(type, callback); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type) { this.listeners.get(type)?.(); }
}

class FakeScheduler {
  constructor() {
    this.nextId = 1;
    this.tasks = new Map();
    this.cancelledCallbacks = [];
  }

  set(callback, delay) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, delay });
    return id;
  }

  clear(id) {
    const task = this.tasks.get(id);
    if (task) this.cancelledCallbacks.push(task.callback);
    this.tasks.delete(id);
  }

  runNext() {
    const [id, task] = this.tasks.entries().next().value;
    this.tasks.delete(id);
    task.callback();
  }
}

function config(
  ids,
  mode = "pair",
  rotationSeconds = 15,
  disabled = [],
  timing = {}
) {
  const result = {
    normalWidgets: {
      mode,
      order: ids,
      rotationSeconds,
      ...timing
    }
  };
  ids.forEach((id) => {
    result[id] = {
      enabled: true,
      widget: { enabled: !disabled.includes(id) }
    };
  });
  return result;
}

function createHarness(ids = ["A", "B", "C", "D"]) {
  const document = new FakeDocument();
  const scheduler = new FakeScheduler();
  const slots = [new FakeNode(), new FakeNode()];
  const surfaces = slots.map((slot) => {
    const surface = new FakeNode();
    surface.classes.add("normal-widget-surface");
    slot.append(surface);
    return surface;
  });
  const widgets = new Map();
  const widgetManager = {
    create(id) {
      const widget = {
        id,
        mounts: 0,
        contexts: [],
        latestState: null,
        mount(element) {
          this.mounts += 1;
          this.element = element;
        },
        setPresentationContext(context) {
          this.contexts.push(context);
        },
        receive(state) {
          this.latestState = state;
          this.element.renderedState = state;
        }
      };
      widgets.set(id, widget);
      return ids.includes(id) ? widget : null;
    }
  };
  const host = new FakeNode();
  const coordinator = new NormalWidgetCompositionCoordinator({
    widgetManager,
    host,
    slots,
    document,
    setTimeout: (callback, delay) => scheduler.set(callback, delay),
    clearTimeout: (id) => scheduler.clear(id)
  });
  coordinator.started = true;

  return {
    coordinator,
    document,
    host,
    scheduler,
    slots,
    surfaces,
    widgetManager,
    widgets
  };
}

function visible(coordinator) {
  return [...coordinator.composition.visibleIds];
}

function visibleSurfaceCount(harness) {
  return harness.slots.filter((slot, index) =>
    !slot.hidden && !harness.surfaces[index].hidden
  ).length;
}

function assertSlotGeometry(harness, expectedCount, expanded) {
  assert.equal(visibleSurfaceCount(harness), expectedCount);
  assert.equal(
    harness.slots.filter((slot) => !slot.hidden).length,
    expectedCount
  );
  harness.slots.forEach((slot) => {
    assert.equal(
      slot.classes.has("normal-widget-slot--expanded"),
      !slot.hidden && expanded
    );
  });
}

function assertMountAttachedAndRendered(harness, id, expectedContent) {
  const mount = harness.widgets.get(id).element;

  assert.equal(mount.parentNode, harness.host);
  assert.equal(harness.host.children.includes(mount), true);
  assert.equal(mount.renderedChild, expectedContent);
}

test("Pair mode handles 0/1/2 without timers and rotates adjacent 3/4 cycles", () => {
  for (const count of [0, 1, 2]) {
    const harness = createHarness();
    const ids = ["A", "B"].slice(0, count);
    harness.coordinator.applyConfiguration(config(ids));
    assert.equal(harness.scheduler.tasks.size, 0);
    assert.equal(
      harness.coordinator.composition.density,
      count === 0 ? null : count === 1 ? "expanded" : "compact"
    );
    assertSlotGeometry(harness, count, count === 1);
  }

  for (const ids of [["A", "B", "C"], ["A", "B", "C", "D"]]) {
    const harness = createHarness();
    const { coordinator, scheduler } = harness;
    coordinator.applyConfiguration(config(ids));
    assertSlotGeometry(harness, 2, false);
    const cycle = [visible(coordinator)];
    for (let index = 1; index < ids.length; index += 1) {
      scheduler.runNext();
      cycle.push(visible(coordinator));
    }
    assert.deepEqual(cycle, ids.map((id, index) => [
      id,
      ids[(index + 1) % ids.length]
    ]));
    cycle.slice(1).forEach((pair, index) => {
      assert.equal(pair[0], cycle[index][1]);
    });
    assert.equal(scheduler.tasks.size, 1);
  }
});

test("configured widgets without a runtime registration do not enter composition", () => {
  const harness = createHarness(["weather", "sports"]);
  harness.widgetManager.hasRegistration = (id) => id !== "homeAssistant";
  harness.coordinator.applyConfiguration(config([
    "weather", "homeAssistant", "sports"
  ]));

  assert.deepEqual(visible(harness.coordinator), ["weather", "sports"]);
  assert.equal(harness.widgets.has("homeAssistant"), false);
  assert.equal(harness.scheduler.tasks.size, 0);
});

test("Expanded mode uses full geometry and rotates one widget in order", () => {
  for (const ids of [[], ["A"], ["A", "B"], ["A", "B", "C"]]) {
    const harness = createHarness();
    const { coordinator, scheduler, slots } = harness;
    coordinator.applyConfiguration(config(ids, "expanded"));
    const cycle = [visible(coordinator)];
    for (let index = 1; index < ids.length; index += 1) {
      scheduler.runNext();
      cycle.push(visible(coordinator));
    }
    assert.deepEqual(cycle, ids.length ? ids.map((id) => [id]) : [[]]);
    assert.equal(scheduler.tasks.size, ids.length > 1 ? 1 : 0);
    assertSlotGeometry(harness, ids.length ? 1 : 0, ids.length > 0);
    if (ids.length) {
      assert.equal(
        slots[0].classes.has("normal-widget-slot--expanded"),
        true
      );
      assert.equal(slots[1].hidden, true);
    }
  }
});

test("slot surfaces transition cleanly between compact pair and expanded single", () => {
  const harness = createHarness();
  const { coordinator } = harness;

  coordinator.applyConfiguration(config(["A", "B"]));
  assertSlotGeometry(harness, 2, false);

  coordinator.applyConfiguration(config(["A"]));
  assertSlotGeometry(harness, 1, true);
  assert.equal(harness.slots[1].hidden, true);
  assert.equal(harness.surfaces[1].hidden, true);

  coordinator.applyConfiguration(config(["A", "B"]));
  assertSlotGeometry(harness, 2, false);
  assert.equal(harness.slots[1].hidden, false);
  assert.equal(harness.surfaces[1].hidden, false);
});

test("order and configuration drive participation regardless of widget data", () => {
  const { coordinator, widgets } = createHarness();
  coordinator.applyConfiguration(
    config(["C", "A", "B"], "pair", 15, ["A"])
  );
  widgets.get("C").receive({ availability: "unavailable" });

  assert.deepEqual(coordinator.composition.enabledIds, ["C", "B"]);
  assert.deepEqual(visible(coordinator), ["C", "B"]);
});

test("rotationSeconds controls one recursive timeout at a time", () => {
  const { coordinator, scheduler } = createHarness();
  coordinator.applyConfiguration(config(["A", "B", "C"], "pair", 23));
  assert.equal(scheduler.tasks.size, 1);
  assert.equal([...scheduler.tasks.values()][0].delay, 23000);
  scheduler.runNext();
  assert.equal(scheduler.tasks.size, 1);
});

test("global timing ignores stored per-widget durations", () => {
  const { coordinator, scheduler } = createHarness();
  coordinator.applyConfiguration(config(
    ["A", "B", "C"],
    "pair",
    15,
    [],
    { timingMode: "global", durations: { A: 5, B: 20, C: 10 } }
  ));

  assert.equal([...scheduler.tasks.values()][0].delay, 15000);
  scheduler.runNext();
  assert.equal([...scheduler.tasks.values()][0].delay, 15000);
});

test("Expanded per-widget timing follows the currently visible widget", () => {
  const { coordinator, scheduler } = createHarness();
  coordinator.applyConfiguration(config(
    ["A", "B"],
    "expanded",
    30,
    [],
    { timingMode: "perWidget", durations: { A: 5, B: 15 } }
  ));

  assert.deepEqual(visible(coordinator), ["A"]);
  assert.equal([...scheduler.tasks.values()][0].delay, 5000);
  scheduler.runNext();
  assert.deepEqual(visible(coordinator), ["B"]);
  assert.equal([...scheduler.tasks.values()][0].delay, 15000);
  scheduler.runNext();
  assert.deepEqual(visible(coordinator), ["A"]);
  assert.equal([...scheduler.tasks.values()][0].delay, 5000);
});

test("Pair per-widget timing follows each newly introduced widget", () => {
  const { coordinator, scheduler } = createHarness();
  coordinator.applyConfiguration(config(
    ["A", "B", "C"],
    "pair",
    30,
    [],
    { timingMode: "perWidget", durations: { A: 5, B: 15, C: 10 } }
  ));

  for (const [pair, delay] of [
    [["A", "B"], 15000],
    [["B", "C"], 10000],
    [["C", "A"], 5000],
    [["A", "B"], 15000]
  ]) {
    assert.deepEqual(visible(coordinator), pair);
    assert.equal([...scheduler.tasks.values()][0].delay, delay);
    scheduler.runNext();
  }
});

test("Pair with at most two widgets never schedules individual timing", () => {
  for (const ids of [[], ["A"], ["A", "B"]]) {
    const { coordinator, scheduler } = createHarness();
    coordinator.applyConfiguration(config(
      ids,
      "pair",
      30,
      [],
      { timingMode: "perWidget", durations: { A: 5, B: 15 } }
    ));
    assert.equal(scheduler.tasks.size, 0);
  }
});

test("browser timer functions retain their required global receiver", () => {
  const source = fs.readFileSync(
    path.join(
      __dirname,
      "..",
      "..",
      "frontend/widgets/normal-widget-composition-coordinator.js"
    ),
    "utf8"
  );
  const document = new FakeDocument();
  const host = new FakeNode();
  const slots = [new FakeNode(), new FakeNode()];
  let scheduled = 0;
  let cancelled = 0;
  const browserGlobal = {
    setTimeout(callback, delay) {
      assert.equal(this, browserGlobal);
      scheduled += 1;
      return { callback, delay };
    },
    clearTimeout(timer) {
      assert.equal(this, browserGlobal);
      assert.equal(timer.delay, 15000);
      cancelled += 1;
    }
  };
  const coordinator = new NormalWidgetCompositionCoordinator({
    widgetManager: {
      create() {
        return { mount() {} };
      }
    },
    host,
    slots,
    document,
    setTimeout: (...args) => browserGlobal.setTimeout(...args),
    clearTimeout: (...args) => browserGlobal.clearTimeout(...args)
  });
  coordinator.started = true;
  coordinator.applyConfiguration(config(["A", "B"], "expanded"));
  coordinator.invalidateRotation();

  assert.equal(scheduled, 1);
  assert.equal(cancelled, 1);
  assert.match(
    source,
    /this\.scheduleTimeout\s*=\s*options\.setTimeout\s*\|\|\s*\(\(callback, delay\)\s*=>\s*setTimeout\(callback, delay\)\)/s
  );
  assert.match(
    source,
    /this\.cancelTimeout\s*=\s*options\.clearTimeout\s*\|\|\s*\(\(timer\)\s*=>\s*clearTimeout\(timer\)\)/s
  );
});

test("stale callbacks and hidden time cannot advance composition", () => {
  const { coordinator, scheduler, document } = createHarness();
  coordinator.applyConfiguration(config(["A", "B", "C"]));
  const stale = [...scheduler.tasks.values()][0].callback;
  coordinator.applyConfiguration(config(["C", "B", "A"]));
  const beforeStale = visible(coordinator);
  stale();
  assert.deepEqual(visible(coordinator), beforeStale);

  document.hidden = true;
  coordinator.onVisibilityChange();
  assert.equal(scheduler.tasks.size, 0);
  assert.deepEqual(visible(coordinator), beforeStale);

  document.hidden = false;
  coordinator.onVisibilityChange();
  assert.equal(scheduler.tasks.size, 1);
  assert.deepEqual(visible(coordinator), beforeStale);
});

test("persistent mounted instances render latest state immediately when visible again", () => {
  const { coordinator, host, scheduler, widgets } = createHarness();
  coordinator.applyConfiguration(config(["A", "B", "C"]));
  const a = widgets.get("A");
  a.receive({ value: "latest" });

  scheduler.runNext();
  assert.deepEqual(visible(coordinator), ["B", "C"]);
  scheduler.runNext();
  assert.deepEqual(visible(coordinator), ["C", "A"]);
  assert.equal(a.mounts, 1);
  assert.deepEqual(a.element.renderedState, { value: "latest" });
  assert.equal(host.children.includes(a.element), true);
  assert.equal(
    a.element.classes.has("normal-widget-mount--secondary"),
    true
  );
});

test("Expanded rotation preserves real rendered children on attached mounts", () => {
  const harness = createHarness();
  const { coordinator, scheduler, widgets } = harness;
  coordinator.applyConfiguration(config(["A", "B"], "expanded"));
  widgets.get("A").element.renderedChild = "Weather content";
  widgets.get("B").element.renderedChild = "Sports content";

  assert.deepEqual(visible(coordinator), ["A"]);
  assertMountAttachedAndRendered(harness, "A", "Weather content");
  scheduler.runNext();
  assert.deepEqual(visible(coordinator), ["B"]);
  assertMountAttachedAndRendered(harness, "B", "Sports content");
  scheduler.runNext();
  assert.deepEqual(visible(coordinator), ["A"]);
  assertMountAttachedAndRendered(harness, "A", "Weather content");
  scheduler.runNext();
  assert.deepEqual(visible(coordinator), ["B"]);
  assertMountAttachedAndRendered(harness, "B", "Sports content");
  assert.equal(widgets.get("A").mounts, 1);
  assert.equal(widgets.get("B").mounts, 1);
});

test("Pair rotation preserves all rendered children without reparenting", () => {
  const harness = createHarness();
  const { coordinator, scheduler, widgets } = harness;
  coordinator.applyConfiguration(config(["A", "B", "C"]));
  for (const id of ["A", "B", "C"]) {
    widgets.get(id).element.renderedChild = `${id} content`;
  }

  for (const expected of [
    ["A", "B"],
    ["B", "C"],
    ["C", "A"],
    ["A", "B"]
  ]) {
    assert.deepEqual(visible(coordinator), expected);
    for (const id of ["A", "B", "C"]) {
      assertMountAttachedAndRendered(harness, id, `${id} content`);
      assert.equal(widgets.get(id).mounts, 1);
    }
    scheduler.runNext();
  }
});

test("density changes preserve rendered mount content", () => {
  const harness = createHarness();
  const { coordinator, widgets } = harness;
  coordinator.applyConfiguration(config(["A", "B"]));
  widgets.get("A").element.renderedChild = "stable content";

  coordinator.applyConfiguration(config(["A"], "expanded"));
  assertMountAttachedAndRendered(harness, "A", "stable content");
  assert.equal(
    widgets.get("A").element.classes.has(
      "normal-widget-mount--expanded"
    ),
    true
  );

  coordinator.applyConfiguration(config(["A", "B"]));
  assertMountAttachedAndRendered(harness, "A", "stable content");
  assert.equal(
    widgets.get("A").element.classes.has(
      "normal-widget-mount--primary"
    ),
    true
  );
});

test("configuration reconciliation preserves leaders and handles reductions", () => {
  const { coordinator, scheduler } = createHarness();
  coordinator.applyConfiguration(config(["A", "B", "C"]));
  scheduler.runNext();
  assert.deepEqual(visible(coordinator), ["B", "C"]);

  coordinator.applyConfiguration(config(["D", "B", "C"], "expanded"));
  assert.deepEqual(visible(coordinator), ["B"]);
  coordinator.applyConfiguration(config(["D", "B"], "pair"));
  assert.deepEqual(visible(coordinator), ["B", "D"]);
  coordinator.applyConfiguration(config(["B"]));
  assert.deepEqual(visible(coordinator), ["B"]);
  coordinator.applyConfiguration(config([]));
  assert.deepEqual(visible(coordinator), []);
  assert.equal(scheduler.tasks.size, 0);
});

test("Sports internal interval remains separate from composition timeout", () => {
  const root = path.join(__dirname, "..", "..");
  const sports = fs.readFileSync(
    path.join(root, "frontend/widgets/sports-widget.js"),
    "utf8"
  );
  const coordinator = fs.readFileSync(
    path.join(
      root,
      "frontend/widgets/normal-widget-composition-coordinator.js"
    ),
    "utf8"
  );

  assert.match(sports, /setInterval\([\s\S]*8000/);
  assert.doesNotMatch(coordinator, /advanceGame|SportsWidget|8000/);
});
