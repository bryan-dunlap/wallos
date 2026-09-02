const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  createPublicHomeAssistantConfig,
  normalizeHomeAssistantBaseUrl,
  normalizeHomeAssistantConfig
} = require(
  "../../backend/home-assistant/home-assistant-config"
);

test("missing Home Assistant configuration uses safe defaults", () => {
  assert.deepEqual(normalizeHomeAssistantConfig(), {
    enabled: false,
    baseUrl: "",
    accessToken: ""
  });
});

test("existing Mosaic configuration without Home Assistant remains compatible", () => {
  assert.deepEqual(normalizeHomeAssistantConfig({ unrelated: true }), {
    enabled: false,
    baseUrl: "",
    accessToken: ""
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
    accessToken
  });

  assert.deepEqual(publicConfig, {
    enabled: true,
    configured: true
  });
  assert.equal(JSON.stringify(publicConfig).includes(accessToken), false);
  assert.deepEqual(
    createPublicHomeAssistantConfig({ enabled: true }),
    { enabled: true, configured: false }
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
    accessToken: ""
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
