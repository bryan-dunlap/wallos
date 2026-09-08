const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  MAX_HOME_ASSISTANT_SELECTED_ENTITIES,
  createPublicHomeAssistantConfig,
  normalizeHomeAssistantBaseUrl,
  normalizeHomeAssistantConfig,
  normalizeHomeAssistantEntities
} = require(
  "../../backend/home-assistant/home-assistant-config"
);

test("missing Home Assistant configuration uses safe defaults", () => {
  assert.deepEqual(normalizeHomeAssistantConfig(), {
    enabled: false,
    baseUrl: "",
    accessToken: "",
    entities: []
  });
});

test("existing Mosaic configuration without Home Assistant remains compatible", () => {
  assert.deepEqual(normalizeHomeAssistantConfig({ unrelated: true }), {
    enabled: false,
    baseUrl: "",
    accessToken: "",
    entities: []
  });
});

test("normalizes valid HTTP and HTTPS base URLs", () => {
  assert.equal(
    normalizeHomeAssistantBaseUrl("http://ha.example.test:8123/"),
    "http://ha.example.test:8123"
  );
  assert.equal(
    normalizeHomeAssistantBaseUrl("https://example.test/home/assistant///"),
    "https://example.test/home/assistant"
  );
});

test("rejects invalid or unsafe Home Assistant base URLs", () => {
  [
    "not a url",
    "ftp://example.test",
    "https://user:password@example.test",
    "https://example.test?secret=value",
    "https://example.test/#section"
  ].forEach((value) => {
    assert.equal(normalizeHomeAssistantBaseUrl(value), null);
  });
});

test("public configuration reports state without exposing credentials", () => {
  const accessToken = "known-private-access-token";
  const publicConfig = createPublicHomeAssistantConfig({
    enabled: true,
    baseUrl: "https://ha.example.test",
    accessToken,
    entities: ["lock.front_door", "light.bedroom"]
  });

  assert.deepEqual(publicConfig, {
    enabled: true,
    baseUrl: "https://ha.example.test",
    configured: true,
    entities: ["lock.front_door", "light.bedroom"]
  });
  assert.equal(JSON.stringify(publicConfig).includes(accessToken), false);
  assert.deepEqual(
    createPublicHomeAssistantConfig({ enabled: true }),
    { enabled: true, baseUrl: "", configured: false, entities: [] }
  );
});

test("sanitized example contains the current schema without private values", () => {
  const examplePath = path.join(
    __dirname,
    "..",
    "..",
    "config.example.json"
  );
  const exampleSource = fs.readFileSync(examplePath, "utf8");
  const example = JSON.parse(exampleSource);

  assert.deepEqual(example.homeAssistant, {
    enabled: false,
    baseUrl: "",
    accessToken: "",
    entities: []
  });
  assert.deepEqual(example.calendar.sources, []);
  assert.deepEqual(example.discovery.sources, []);
  assert.equal(/https?:\/\//.test(exampleSource), false);
  assert.equal(/webcal:\/\//.test(exampleSource), false);
});

test("serialized public API shape never includes a Home Assistant token", () => {
  const accessToken = "api-invisible-access-token";
  const apiConfig = {
    display: { theme: "mosaic" },
    homeAssistant: createPublicHomeAssistantConfig({
      enabled: true,
      baseUrl: "https://ha.example.test",
      accessToken
    })
  };

  assert.equal(JSON.stringify(apiConfig).includes(accessToken), false);
  assert.equal("accessToken" in apiConfig.homeAssistant, false);
});

test("normalizes selected entity IDs with stable order and deduplication", () => {
  assert.deepEqual(normalizeHomeAssistantEntities([
    " light.bedroom ",
    "lock.front_door",
    "light.bedroom",
    "media_player.appletv4k"
  ], { strict: true }), [
    "light.bedroom",
    "lock.front_door",
    "media_player.appletv4k"
  ]);
});

test("strict selected entity validation rejects malformed and oversized lists", () => {
  assert.throws(
    () => normalizeHomeAssistantEntities(["not-an-entity"], { strict: true }),
    /entity ID is invalid/
  );
  assert.throws(
    () => normalizeHomeAssistantEntities("sensor.one", { strict: true }),
    /must be an array/
  );
  assert.throws(
    () => normalizeHomeAssistantEntities(
      Array.from(
        { length: MAX_HOME_ASSISTANT_SELECTED_ENTITIES + 1 },
        (_, index) => `sensor.item_${index}`
      ),
      { strict: true }
    ),
    /at most 32 selected entities/
  );
});

test("legacy saved selections load tolerantly within the configured bound", () => {
  const normalized = normalizeHomeAssistantConfig({
    enabled: true,
    entities: ["bad", "sensor.valid", "sensor.valid"]
  });

  assert.deepEqual(normalized.entities, ["sensor.valid"]);
});
