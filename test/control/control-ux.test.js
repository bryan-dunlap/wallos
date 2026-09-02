const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const serverSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "backend", "server.js"),
  "utf8"
);

test("Control buttons preserve accessible minimum hit targets", () => {
  assert.match(
    serverSource,
    /\.button\s*\{[^}]*min-height:\s*44px;/
  );
  assert.match(
    serverSource,
    /\.button-quiet\s*\{[^}]*min-height:\s*44px;/
  );
});

test("Sports Simulator is session-only and always visible", () => {
  assert.match(serverSource, /<h3>Sports Simulator<\/h3>/);
  assert.match(serverSource, /<span class="status-pill">Session only<\/span>/);
  assert.match(serverSource, /<select id="sports-simulation-profile">/);
  assert.match(serverSource, /<select id="sports-simulation-scenario">/);
  assert.doesNotMatch(serverSource, /sports-simulator-enabled/);
  assert.doesNotMatch(serverSource, /id="sports-simulator-settings"/);
});

test("Sports Simulator command navigation targets the profile selector", () => {
  assert.match(
    serverSource,
    /data-command-section="developer" data-command-focus="sports-simulation-profile"><span>Open Sports Simulator<\/span>/
  );
  assert.doesNotMatch(
    serverSource,
    /data-command-focus="sports-simulator-enabled"/
  );
});
