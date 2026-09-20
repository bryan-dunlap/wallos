const assert = require("node:assert/strict");
const test = require("node:test");
const {
  resolveHomeAssistantSelectedState
} = require(
  "../../backend/home-assistant/home-assistant-selected-state"
);
const {
  HomeAssistantStateCache,
  MAX_HOME_ASSISTANT_ENTITIES
} = require(
  "../../backend/home-assistant/home-assistant-state-cache"
);

const TOKEN = "selected-state-private-token";

function config(overrides = {}) {
  return {
    enabled: true,
    baseUrl: "https://ha.example.test",
    accessToken: TOKEN,
    entities: ["light.kitchen", "sensor.temperature"],
    widget: { enabled: true },
    ...overrides
  };
}

function entity(entityId, state = "on", extra = {}) {
  const [domain, objectId] = entityId.split(".");
  return {
    entityId,
    domain,
    displayName: objectId,
    state,
    unit: null,
    deviceClass: null,
    stateClass: null,
    icon: null,
    availability: state === "unknown"
      ? "unknown"
      : state === "unavailable" ? "unavailable" : "available",
    lastChanged: null,
    updatedAt: null,
    ...extra
  };
}

function cacheSnapshot(entities, overrides = {}) {
  return {
    getSnapshot: async () => ({
      status: "available",
      stale: false,
      updatedAt: "2026-09-20T12:00:00.000Z",
      entities,
      ...overrides
    })
  };
}

test("returns only selected entities in persisted order", async () => {
  const snapshot = await resolveHomeAssistantSelectedState(config(), {
    stateCache: cacheSnapshot([
      entity("sensor.temperature", "72", { unit: "°F" }),
      entity("switch.unselected"),
      entity("light.kitchen")
    ])
  });

  assert.equal(snapshot.status, "available");
  assert.deepEqual(
    snapshot.entities.map((item) => item.entityId),
    ["light.kitchen", "sensor.temperature"]
  );
  assert.equal(JSON.stringify(snapshot).includes("switch.unselected"), false);
});

test("empty selection avoids acquisition", async () => {
  let calls = 0;
  const snapshot = await resolveHomeAssistantSelectedState(
    config({ entities: [] }),
    { stateCache: { getSnapshot: async () => { calls += 1; } } }
  );

  assert.equal(snapshot.status, "empty");
  assert.equal(snapshot.selectedCount, 0);
  assert.equal(calls, 0);
});

test("missing selections remain ordered deliberate placeholders", async () => {
  const snapshot = await resolveHomeAssistantSelectedState(config(), {
    stateCache: cacheSnapshot([entity("sensor.temperature", "70")])
  });

  assert.deepEqual(snapshot.entities[0], {
    entityId: "light.kitchen",
    domain: "light",
    displayName: "Kitchen",
    state: null,
    unit: null,
    deviceClass: null,
    stateClass: null,
    icon: null,
    availability: "missing",
    lastChanged: null,
    updatedAt: null
  });
  assert.equal(snapshot.entities[1].entityId, "sensor.temperature");
});

test("preserves unknown, unavailable, and stale as separate semantics", async () => {
  const snapshot = await resolveHomeAssistantSelectedState(config({
    entities: ["sensor.unknown", "sensor.unavailable"]
  }), {
    stateCache: cacheSnapshot([
      entity("sensor.unknown", "unknown"),
      entity("sensor.unavailable", "unavailable")
    ], { stale: true })
  });

  assert.equal(snapshot.stale, true);
  assert.deepEqual(
    snapshot.entities.map((item) => item.availability),
    ["unknown", "unavailable"]
  );
});

test("disabled, unconfigured, and hard unavailable remain distinct", async () => {
  let calls = 0;
  const stateCache = {
    getSnapshot: async () => {
      calls += 1;
      return { status: "unavailable", entities: [] };
    }
  };
  const disabled = await resolveHomeAssistantSelectedState(
    config({ enabled: false }), { stateCache }
  );
  const unconfigured = await resolveHomeAssistantSelectedState(
    config({ accessToken: "" }), { stateCache }
  );
  const unavailable = await resolveHomeAssistantSelectedState(
    config(), { stateCache }
  );

  assert.equal(disabled.status, "disabled");
  assert.equal(unconfigured.status, "unconfigured");
  assert.equal(unavailable.status, "unavailable");
  assert.equal(calls, 1);
});

test("sanitizes acquisition failures without exposing raw details", async () => {
  const snapshot = await resolveHomeAssistantSelectedState(config(), {
    stateCache: {
      getSnapshot: async () => {
        throw new Error(`upstream failed with ${TOKEN}`);
      }
    }
  });

  assert.equal(snapshot.status, "unavailable");
  assert.equal(JSON.stringify(snapshot).includes(TOKEN), false);
  assert.equal("error" in snapshot, false);
});

test("resolves selected entities beyond the bounded discovery projection", async () => {
  const selectedId = `sensor.item_${MAX_HOME_ASSISTANT_ENTITIES}`;
  const raw = Array.from(
    { length: MAX_HOME_ASSISTANT_ENTITIES + 1 },
    (_, index) => ({
      entity_id: `sensor.item_${String(index).padStart(4, "0")}`,
      state: String(index),
      attributes: { friendly_name: `Item ${index}`, raw_secret: TOKEN },
      context: { id: TOKEN }
    })
  );
  const stateCache = new HomeAssistantStateCache({
    acquire: async () => raw
  });
  const discovery = await stateCache.getSnapshot(config());
  const production = await resolveHomeAssistantSelectedState(config({
    entities: [selectedId]
  }), { stateCache });

  assert.equal(discovery.entities.length, MAX_HOME_ASSISTANT_ENTITIES);
  assert.equal(production.entities[0].entityId, selectedId);
  assert.equal(production.entities[0].availability, "available");
  assert.equal(JSON.stringify(production).includes("raw_secret"), false);
  assert.equal(JSON.stringify(production).includes("context"), false);
  assert.equal(JSON.stringify(production).includes(TOKEN), false);
});
