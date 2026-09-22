const assert = require("node:assert/strict");
const test = require("node:test");
const {
  formatHomeAssistantState,
  humanizeHomeAssistantState,
  projectHomeAssistantPresentation,
  resolveHomeAssistantPresentationName
} = require("../../frontend/widgets/home-assistant-presentation");

function entity(overrides = {}) {
  return {
    domain: "light",
    displayName: "Studio Lamp",
    state: "off",
    deviceClass: null,
    unit: null,
    availability: "available",
    ...overrides
  };
}

test("formats conservative domain and device-class semantics", () => {
  for (const [overrides, expected] of [
    [{ domain: "light", state: "on" }, "On"],
    [{ domain: "light", state: "off" }, "Off"],
    [{ domain: "switch", state: "on" }, "On"],
    [{ domain: "switch", state: "off" }, "Off"],
    [{ domain: "binary_sensor", deviceClass: "door", state: "on" }, "Open"],
    [{ domain: "binary_sensor", deviceClass: "door", state: "off" }, "Closed"],
    [{ domain: "binary_sensor", deviceClass: "window", state: "off" }, "Closed"],
    [{ domain: "binary_sensor", deviceClass: "garage_door", state: "on" }, "Open"],
    [{ domain: "binary_sensor", deviceClass: "opening", state: "off" }, "Closed"],
    [{ domain: "binary_sensor", deviceClass: "motion", state: "on" }, "Detected"],
    [{ domain: "binary_sensor", deviceClass: "motion", state: "off" }, "Clear"],
    [{ domain: "binary_sensor", deviceClass: "occupancy", state: "on" }, "Occupied"],
    [{ domain: "binary_sensor", deviceClass: "presence", state: "off" }, "Away"],
    [{ domain: "binary_sensor", deviceClass: "connectivity", state: "on" }, "Connected"],
    [{ domain: "binary_sensor", deviceClass: "connectivity", state: "off" }, "Disconnected"]
  ]) {
    assert.equal(formatHomeAssistantState(entity(overrides)), expected);
  }
});

test("exceptional entity states override ordinary semantics", () => {
  assert.equal(formatHomeAssistantState(entity({ availability: "missing" })), "Missing");
  assert.equal(formatHomeAssistantState(entity({ availability: "unavailable" })), "Unavailable");
  assert.equal(formatHomeAssistantState(entity({ state: "unavailable" })), "Unavailable");
  assert.equal(formatHomeAssistantState(entity({ availability: "unknown" })), "Unknown");
  assert.equal(formatHomeAssistantState(entity({ state: "unknown" })), "Unknown");
});

test("unknown semantics use safe state humanization without guessing", () => {
  assert.equal(formatHomeAssistantState(entity({
    domain: "binary_sensor",
    deviceClass: "custom",
    state: "on"
  })), "On");
  assert.equal(humanizeHomeAssistantState("heat_pump-idle"), "Heat Pump Idle");
  assert.equal(formatHomeAssistantState(entity({
    domain: "sensor",
    state: "72",
    unit: "°F"
  })), "72 °F");
});

test("uses only an explicit alias or the exact Home Assistant name", () => {
  assert.equal(resolveHomeAssistantPresentationName({
    displayName: "Patio Entry Door"
  }), "Patio Entry Door");
  assert.equal(resolveHomeAssistantPresentationName({
    displayName: "Patio Entry Door",
    mosaicDisplayName: " Patio "
  }), "Patio");
  assert.equal(resolveHomeAssistantPresentationName({
    displayName: "Demo Sensor Model X Temperature",
    mosaicDisplayName: ""
  }), "Demo Sensor Model X Temperature");
});

test("projection preserves selected order and stale source state", () => {
  const presentation = projectHomeAssistantPresentation({
    status: "available",
    stale: true,
    selectedCount: 2,
    entities: [
      entity(),
      entity({
        domain: "binary_sensor",
        displayName: "Patio Entry Door",
        deviceClass: "door"
      })
    ]
  });

  assert.equal(presentation.stale, true);
  assert.deepEqual(presentation.rows, [
    { name: "Studio Lamp", value: "Off" },
    { name: "Patio Entry Door", value: "Closed" }
  ]);
});

test("explicit aliases override identity without changing state semantics", () => {
  assert.deepEqual(projectHomeAssistantPresentation({
    status: "available",
    entities: [entity({
      domain: "binary_sensor",
      displayName: "Patio Entry Door",
      mosaicDisplayName: "Patio",
      deviceClass: "door"
    })]
  }).rows, [{ name: "Patio", value: "Closed" }]);
});
