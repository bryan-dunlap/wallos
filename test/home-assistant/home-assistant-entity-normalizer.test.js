const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  humanizeObjectId,
  normalizeHomeAssistantEntity
} = require(
  "../../backend/home-assistant/home-assistant-entity-normalizer"
);

const fixture = JSON.parse(fs.readFileSync(path.join(
  __dirname,
  "..",
  "fixtures",
  "home-assistant",
  "states.json"
), "utf8"));

test("normalizes a sensor into the allowlisted Mosaic entity contract", () => {
  const entity = normalizeHomeAssistantEntity(fixture[0]);

  assert.deepEqual(entity, {
    entityId: "sensor.living_room_temperature",
    domain: "sensor",
    state: "72.4",
    displayName: "Living Room Temperature",
    unit: "°F",
    deviceClass: "temperature",
    stateClass: "measurement",
    icon: "mdi:thermometer",
    availability: "available",
    lastChanged: "2026-09-07T17:00:00.000Z",
    updatedAt: "2026-09-07T17:01:00.000Z"
  });
  assert.equal(typeof entity.state, "string");
  assert.equal(JSON.stringify(entity).includes("secret_metadata"), false);
  assert.equal(JSON.stringify(entity).includes("native-context-id"), false);
});

test("normalizes common domains, availability, and missing attributes", () => {
  const entities = fixture.slice(1).map(normalizeHomeAssistantEntity);

  assert.deepEqual(
    entities.map((entity) => entity.domain),
    ["binary_sensor", "switch", "light", "climate"]
  );
  assert.equal(entities[0].displayName, "Front Door");
  assert.equal(entities[0].lastChanged, null);
  assert.equal(entities[1].availability, "unavailable");
  assert.equal(entities[2].availability, "unknown");
  assert.equal(entities[1].displayName, entities[2].displayName);
  assert.equal(entities[3].displayName, "Upstairs Hall");
  assert.equal(entities[3].unit, null);
  assert.equal(entities[3].icon, null);
});

test("humanized fallback is deterministic and locale-independent", () => {
  assert.equal(
    humanizeObjectId("living_room_temperature"),
    "Living Room Temperature"
  );
  assert.equal(humanizeObjectId("zone_2_alarm"), "Zone 2 Alarm");
});

test("rejects malformed identities, states, and objects", () => {
  for (const value of [
    null,
    [],
    {},
    { entity_id: "sensor", state: "on" },
    { entity_id: "sensor.bad.extra", state: "on" },
    { entity_id: "Sensor.upper", state: "on" },
    { entity_id: "sensor.valid", state: 1 }
  ]) {
    assert.equal(normalizeHomeAssistantEntity(value), null);
  }
});

test("invalid scalar attributes and timestamps become null", () => {
  const entity = normalizeHomeAssistantEntity({
    entity_id: "sensor.safe",
    state: "1",
    attributes: {
      friendly_name: [],
      unit_of_measurement: 2,
      device_class: {},
      state_class: true,
      icon: []
    },
    last_changed: "September 7, 2026",
    last_updated: 123
  });

  assert.equal(entity.displayName, "Safe");
  assert.equal(entity.unit, null);
  assert.equal(entity.deviceClass, null);
  assert.equal(entity.stateClass, null);
  assert.equal(entity.icon, null);
  assert.equal(entity.lastChanged, null);
  assert.equal(entity.updatedAt, null);
});
