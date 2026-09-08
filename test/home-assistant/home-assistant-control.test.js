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
const selectionStart = serverSource.indexOf(
  "const maximumSelections = ${MAX_HOME_ASSISTANT_SELECTED_ENTITIES};"
);
const selectionEnd = serverSource.indexOf("loadEntities();", selectionStart);
const selectionSource = selectionStart >= 0 && selectionEnd >= 0
  ? serverSource.slice(selectionStart, selectionEnd + "loadEntities();".length)
  : "";

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
    accessToken: STORED_TOKEN,
    entities: []
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

test("saving an entity draft preserves the stored token and ordered IDs", () => {
  const updated = resolveHomeAssistantConfigUpdate({
    enabled: true,
    baseUrl: "https://saved.example.test",
    accessToken: STORED_TOKEN,
    entities: ["sensor.old"]
  }, {
    enabled: true,
    baseUrl: "https://saved.example.test",
    tokenOperation: "keep",
    accessToken: "",
    entitiesDraft: JSON.stringify([
      "lock.front_door",
      "light.bedroom",
      "lock.front_door"
    ])
  });

  assert.deepEqual(updated, {
    enabled: true,
    baseUrl: "https://saved.example.test",
    accessToken: STORED_TOKEN,
    entities: ["lock.front_door", "light.bedroom"]
  });
});

test("Home Assistant entity discovery lives in Settings and remains a draft", () => {
  assert.match(serverSource, /data-settings-panel="home-assistant"[^]*?data-home-assistant-selected-list/);
  assert.match(serverSource, /name="homeAssistantEntitiesDraft" type="hidden"/);
  assert.match(serverSource, /"\/api\/home-assistant\/entities"/);
  assert.match(serverSource, /draftField\.dispatchEvent\(new Event\("input"/);
  assert.doesNotMatch(serverSource, /fetch\("\/control\/home-assistant/);

  const developerPanel = serverSource.match(
    /data-control-panel="developer"[^]*?<\/section>\s*<\/div>/
  )?.[0] || "";
  assert.doesNotMatch(developerPanel, /data-home-assistant-selected-list/);
});

test("entity discovery searches normalized names and IDs with dynamic filters", () => {
  assert.match(serverSource, /entity\.displayName\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(serverSource, /entity\.entityId\.toLowerCase\(\)\.includes\(query\)/);
  assert.match(serverSource, /entity\.device\?\.name/);
  assert.match(serverSource, /entity\.area\?\.name/);
  assert.match(serverSource, /result\.set\(entity\.domain/);
  assert.match(serverSource, /entity\.availability === "unavailable"/);
  assert.match(serverSource, /entity\.availability === "unknown"/);
  assert.match(serverSource, /search\.addEventListener\("input", renderResults\)/);
  assert.doesNotMatch(selectionSource, /search\.addEventListener\("input", fetch/);
});

test("discovery groups by authoritative area and device with Standard and Advanced modes", () => {
  assert.match(serverSource, /data-home-assistant-discovery-mode/);
  assert.match(selectionSource, /entity\.entityCategory === "diagnostic"/);
  assert.match(selectionSource, /entity\.entityCategory === "config"/);
  assert.match(selectionSource, /entity\.hidden === true/);
  assert.match(selectionSource, /"No Area"/);
  assert.match(selectionSource, /"Other \/ Ungrouped"/);
  assert.match(selectionSource, /group\.device\.manufacturer/);
  assert.match(selectionSource, /group\.device\.model/);
  assert.match(selectionSource, /badge\.textContent = "Advanced"/);
});

test("selection supports add, remove, missing metadata, and accessible ordering", () => {
  assert.match(serverSource, /data-add-home-assistant-entity/);
  assert.match(serverSource, /selectedIds\.includes\(entityId\)/);
  assert.match(serverSource, /data-remove-home-assistant-entity/);
  assert.match(serverSource, /Missing \/ Not currently reported/);
  assert.match(serverSource, /data-move-home-assistant-entity/);
  assert.match(serverSource, /"Move " \+ entityId \+ " " \+ direction/);
  assert.match(
    serverSource,
    /maximumSelections = \$\{MAX_HOME_ASSISTANT_SELECTED_ENTITIES\}/
  );
  assert.match(serverSource, /Selection limit reached/);
});

test("discovery covers loading, unavailable, stale, empty, and refresh states", () => {
  assert.match(serverSource, /Loading Home Assistant entities/);
  assert.match(serverSource, /Home Assistant entities are unavailable/);
  assert.match(serverSource, /List may be out of date/);
  assert.match(serverSource, /Home Assistant reported no entities/);
  assert.match(serverSource, /Home Assistant entities could not be loaded/);
  assert.match(serverSource, /data-home-assistant-refresh-entities/);
  assert.match(serverSource, /refreshButton\.addEventListener\("click", \(\) => loadEntities\(true\)\)/);
  assert.doesNotMatch(selectionSource, /setInterval|setTimeout/);
});

test("Control consumes only normalized Home Assistant entity fields", () => {
  assert.match(selectionSource, /entity\.entityId/);
  assert.match(selectionSource, /entity\.displayName/);
  assert.match(selectionSource, /entity\.domain/);
  assert.match(selectionSource, /entity\.unit/);
  assert.match(selectionSource, /entity\.deviceClass/);
  assert.match(selectionSource, /entity\.availability/);
  assert.doesNotMatch(selectionSource, /entity_id|friendly_name|attributes|context/);
});
