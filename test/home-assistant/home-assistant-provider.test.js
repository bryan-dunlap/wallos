const assert = require("node:assert/strict");
const test = require("node:test");
const {
  HOME_ASSISTANT_REFRESH_INTERVAL_MS,
  HomeAssistantProvider,
  normalizeHomeAssistantSnapshot
} = require("../../frontend/providers/home-assistant-provider");

class FakeDocument {
  constructor() {
    this.hidden = false;
    this.listeners = new Map();
  }

  addEventListener(type, listener) { this.listeners.set(type, listener); }
  removeEventListener(type) { this.listeners.delete(type); }
  dispatch(type) { this.listeners.get(type)?.(); }
}

class FakeScheduler {
  constructor() {
    this.tasks = new Map();
    this.nextId = 1;
  }

  set(callback, delay) {
    const id = this.nextId++;
    this.tasks.set(id, { callback, delay });
    return id;
  }

  clear(id) { this.tasks.delete(id); }

  runNext() {
    const [id, task] = this.tasks.entries().next().value;
    this.tasks.delete(id);
    task.callback();
  }
}

function response(body, ok = true, status = 200) {
  return { ok, status, json: async () => body };
}

function availableSnapshot(overrides = {}) {
  return {
    schemaVersion: 1,
    status: "available",
    stale: false,
    updatedAt: "2026-09-21T12:00:00.000Z",
    selectedCount: 1,
    entities: [{
      entityId: "light.private_id",
      domain: "light",
      displayName: "Studio Lamp",
      mosaicDisplayName: null,
      state: "off",
      availability: "available",
      deviceClass: null,
      unit: null,
      attributes: { secret: true }
    }],
    ...overrides
  };
}

function createHarness({
  enabled = true,
  widgetEnabled = true,
  selectedResponse = availableSnapshot()
} = {}) {
  const document = new FakeDocument();
  const scheduler = new FakeScheduler();
  const events = [];
  const requests = [];
  let selectedResolver = null;
  const fetch = async (url) => {
    requests.push(url);
    if (url === "/api/config") {
      return response({
        homeAssistant: { enabled, widget: { enabled: widgetEnabled } }
      });
    }
    if (selectedResponse === "pending") {
      return new Promise((resolve) => { selectedResolver = resolve; });
    }
    if (selectedResponse instanceof Error) throw selectedResponse;
    return response(selectedResponse);
  };
  const provider = new HomeAssistantProvider({
    fetch,
    document,
    publish: (event) => events.push(event),
    setTimeout: (callback, delay) => scheduler.set(callback, delay),
    clearTimeout: (id) => scheduler.clear(id)
  });

  return {
    document,
    events,
    provider,
    requests,
    scheduler,
    resolveSelected: (body) => selectedResolver(response(body))
  };
}

test("starts with immediate acquisition and one bounded refresh timer", async () => {
  const harness = createHarness();
  harness.provider.start();
  await harness.provider.refreshInFlight;

  assert.deepEqual(harness.requests, [
    "/api/config", "/api/home-assistant/selected-states"
  ]);
  assert.equal(harness.scheduler.tasks.size, 1);
  assert.equal(
    [...harness.scheduler.tasks.values()][0].delay,
    HOME_ASSISTANT_REFRESH_INTERVAL_MS
  );

  harness.scheduler.runNext();
  await harness.provider.refreshInFlight;
  assert.equal(harness.scheduler.tasks.size, 1);
});

test("prohibits overlapping acquisitions", async () => {
  const harness = createHarness({ selectedResponse: "pending" });
  harness.provider.start();
  while (!harness.requests.includes(
    "/api/home-assistant/selected-states"
  )) {
    await new Promise((resolve) => setImmediate(resolve));
  }
  const first = harness.provider.refreshInFlight;
  const second = harness.provider.runRefreshCycle();

  assert.equal(first, second);
  assert.equal(
    harness.requests.filter((url) => url.includes("selected-states")).length,
    1
  );
  harness.resolveSelected(availableSnapshot());
  await first;
});

for (const settings of [
  { enabled: false, widgetEnabled: true },
  { enabled: true, widgetEnabled: false }
]) {
  test("disabled runtime consumer performs no state polling", async () => {
    const harness = createHarness(settings);
    harness.provider.start();
    await harness.provider.refreshInFlight;

    assert.deepEqual(harness.requests, ["/api/config"]);
    assert.equal(harness.scheduler.tasks.size, 0);
    assert.equal(harness.events.at(-1).payload.status, "disabled");
  });
}

test("visibility pauses polling and promptly refreshes when visible", async () => {
  const harness = createHarness();
  harness.provider.start();
  await harness.provider.refreshInFlight;
  harness.document.hidden = true;
  harness.document.dispatch("visibilitychange");
  assert.equal(harness.scheduler.tasks.size, 0);

  harness.document.hidden = false;
  harness.document.dispatch("visibilitychange");
  await harness.provider.refreshInFlight;
  assert.equal(harness.scheduler.tasks.size, 1);
  assert.equal(harness.requests.length, 4);
});

test("stop cleans up timers and listeners", async () => {
  const harness = createHarness();
  harness.provider.start();
  await harness.provider.refreshInFlight;
  harness.provider.stop();

  assert.equal(harness.scheduler.tasks.size, 0);
  assert.equal(harness.document.listeners.size, 0);
});

test("publishes stale snapshots and strips raw backend fields", async () => {
  const harness = createHarness({
    selectedResponse: availableSnapshot({ stale: true })
  });
  harness.provider.start();
  await harness.provider.refreshInFlight;
  const payload = harness.events.at(-1).payload;

  assert.equal(payload.stale, true);
  assert.equal(payload.entities[0].displayName, "Studio Lamp");
  assert.equal("entityId" in payload.entities[0], false);
  assert.equal("attributes" in payload.entities[0], false);
});

test("request failures and malformed snapshots publish hard unavailable", async () => {
  for (const selectedResponse of [
    new Error("token and URL must never publish"),
    { status: "available", entities: "bad" }
  ]) {
    const harness = createHarness({ selectedResponse });
    harness.provider.start();
    await harness.provider.refreshInFlight;
    assert.equal(harness.events.at(-1).payload.status, "unavailable");
    assert.equal(harness.scheduler.tasks.size, 1);
  }
});

test("normalizer preserves ordered placeholders and source semantics", () => {
  const normalized = normalizeHomeAssistantSnapshot(availableSnapshot({
    selectedCount: 2,
    entities: [
      availableSnapshot().entities[0],
      {
        entityId: "sensor.private",
        domain: "sensor",
        displayName: "Missing item",
        state: null,
        availability: "missing"
      }
    ]
  }));

  assert.deepEqual(
    normalized.entities.map((entity) => entity.displayName),
    ["Studio Lamp", "Missing item"]
  );
  assert.equal(normalized.entities[1].availability, "missing");
});

test("normalizer preserves only the explicit Mosaic display alias", () => {
  const normalized = normalizeHomeAssistantSnapshot(availableSnapshot({
    entities: [{
      ...availableSnapshot().entities[0],
      mosaicDisplayName: "Living Room",
      unrelatedName: "must not cross"
    }]
  }));

  assert.equal(normalized.entities[0].displayName, "Studio Lamp");
  assert.equal(normalized.entities[0].mosaicDisplayName, "Living Room");
  assert.equal("unrelatedName" in normalized.entities[0], false);
});
