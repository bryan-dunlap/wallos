const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  resolveHomeAssistantConfigUpdate
} = require("../../backend/server");

const serverSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "backend", "server.js"),
  "utf8"
);
const STORED_TOKEN = "stored-private-token";

test("Control renders Home Assistant settings without hydrating a token", () => {
  assert.match(serverSource, /data-settings-panel="home-assistant"/);
  assert.match(serverSource, /name="homeAssistantEnabled"/);
  assert.match(serverSource, /name="homeAssistantBaseUrl" type="url"/);
  assert.match(
    serverSource,
    /name="homeAssistantAccessToken" type="password" value="" autocomplete="new-password"/
  );
  assert.match(serverSource, /Access token saved/);
  assert.doesNotMatch(
    serverSource,
    /value="\$\{escapeHtml\(config\.homeAssistant\.accessToken\)\}"/
  );
});

test("Home Assistant fields participate in normal Control dirty state", () => {
  for (const field of [
    "homeAssistantEnabled",
    "homeAssistantBaseUrl",
    "homeAssistantAccessToken",
    "homeAssistantTokenOperation"
  ]) {
    assert.match(serverSource, new RegExp(`"${field}"`));
  }
  assert.match(serverSource, /form\.addEventListener\("input", showPendingState\)/);
  assert.match(serverSource, /form\.addEventListener\("change", showPendingState\)/);
});

test("save contract keeps, replaces, and removes the stored token explicitly", () => {
  const current = {
    enabled: true,
    baseUrl: "https://saved.example.test",
    accessToken: STORED_TOKEN
  };

  assert.deepEqual(resolveHomeAssistantConfigUpdate(current, {
    enabled: false,
    baseUrl: "https://draft.example.test/",
    tokenOperation: "keep",
    accessToken: ""
  }), {
    enabled: false,
    baseUrl: "https://draft.example.test",
    accessToken: STORED_TOKEN
  });

  assert.deepEqual(resolveHomeAssistantConfigUpdate(current, {
    enabled: true,
    baseUrl: "https://draft.example.test",
    tokenOperation: "replace",
    accessToken: "new-private-token"
  }).accessToken, "new-private-token");

  assert.equal(resolveHomeAssistantConfigUpdate(current, {
    enabled: true,
    baseUrl: "https://draft.example.test",
    tokenOperation: "remove",
    accessToken: "ignored"
  }).accessToken, "");
});

test("blank replacement and invalid URL are rejected by the save boundary", () => {
  assert.throws(() => resolveHomeAssistantConfigUpdate({}, {
    enabled: true,
    baseUrl: "https://ha.example.test",
    tokenOperation: "replace",
    accessToken: ""
  }), /replacement Home Assistant token is required/);
  assert.throws(() => resolveHomeAssistantConfigUpdate({}, {
    enabled: true,
    baseUrl: "ftp://ha.example.test",
    tokenOperation: "keep",
    accessToken: ""
  }), /Home Assistant URL is invalid/);
});

test("Test Connection selects draft or stored token without submitting settings", () => {
  assert.match(serverSource, /payload\.accessToken = draftToken/);
  assert.match(serverSource, /payload\.useStoredAccessToken = true/);
  assert.match(serverSource, /data-home-assistant-test>Test Connection/);
  assert.match(serverSource, /testButton\.addEventListener\("click"/);
  assert.doesNotMatch(serverSource, /testButton\.addEventListener\("click"[^]*?\.submit\(/);
});
