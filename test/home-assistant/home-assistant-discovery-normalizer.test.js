const assert = require("node:assert/strict");
const test = require("node:test");
const { createDiscoveryEntities, isAdvancedDiscoveryEntity } = require("../../backend/home-assistant/home-assistant-discovery-normalizer");

const state = entityId => ({ entityId, domain: entityId.split(".")[0], displayName: "State Name", state: "on", unit: null, deviceClass: null, stateClass: null, icon: null, availability: "available", lastChanged: null, updatedAt: null });

test("joins devices and areas with direct-area precedence and deterministic names", () => {
  const result = createDiscoveryEntities([state("sensor.room")], {
    entities: [{ entityId: "sensor.room", deviceId: "device", areaId: "direct", name: "User Entity", originalName: "Original", platform: "demo", entityCategory: null, hidden: false, disabled: false }],
    devices: [{ id: "device", areaId: "device-area", name: "User Device", manufacturer: "Maker", model: "M1" }],
    areas: [{ id: "direct", name: "Office" }, { id: "device-area", name: "Kitchen" }]
  });
  assert.equal(result[0].displayName, "User Entity");
  assert.deepEqual(result[0].device, { groupKey: "device-1", name: "User Device", manufacturer: "Maker", model: "M1" });
  assert.deepEqual(result[0].area, { name: "Office" });
  assert.equal(result[0].platform, "demo");
});

test("supports device area, device without area, and fully ungrouped states", () => {
  const states = [state("sensor.inherited"), state("sensor.no_area"), state("sensor.unregistered")];
  const result = createDiscoveryEntities(states, {
    entities: [
      { entityId: "sensor.inherited", deviceId: "a", areaId: null, disabled: false },
      { entityId: "sensor.no_area", deviceId: "b", areaId: null, disabled: false }
    ],
    devices: [{ id: "a", areaId: "room", name: "A" }, { id: "b", areaId: null, name: "B" }],
    areas: [{ id: "room", name: "Room" }]
  });
  assert.equal(result[0].area.name, "Room");
  assert.equal(result[1].area, null);
  assert.equal(result[2].device, null);
  assert.equal(result[2].displayName, "State Name");
});

test("classifies only authoritative technical categories and omits sensitive/raw data", () => {
  const result = createDiscoveryEntities([state("device_tracker.normal"), state("sensor.diag"), state("switch.config"), state("sensor.hidden")], {
    entities: [
      { entityId: "device_tracker.normal", entityCategory: null, hidden: false, disabled: false },
      { entityId: "sensor.diag", entityCategory: "diagnostic", hidden: false, disabled: false, uniqueId: "secret" },
      { entityId: "switch.config", entityCategory: "config", hidden: false, disabled: false },
      { entityId: "sensor.hidden", entityCategory: null, hidden: true, disabled: false }
    ], devices: [], areas: []
  });
  assert.deepEqual(result.map(isAdvancedDiscoveryEntity), [false, true, true, true]);
  assert.doesNotMatch(JSON.stringify(result), /uniqueId|secret|deviceId|areaId/);
});

test("excludes disabled registry metadata while retaining current state safely", () => {
  const result = createDiscoveryEntities([state("sensor.current")], {
    entities: [{ entityId: "sensor.current", disabled: true, name: "Disabled metadata" }], devices: [], areas: []
  });
  assert.equal(result.length, 1);
  assert.equal(result[0].displayName, "State Name");
  assert.equal(result[0].disabled, false);
});
