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

test("Sports Simulation is session-only and always visible", () => {
  assert.match(serverSource, /<h3>Sports Simulation<\/h3>/);
  assert.match(serverSource, /<span class="status-pill">Session only<\/span>/);
  assert.match(serverSource, /<select id="sports-simulation-profile">/);
  assert.match(serverSource, /<select id="sports-simulation-scenario">/);
  assert.doesNotMatch(serverSource, /sports-simulator-enabled/);
  assert.doesNotMatch(serverSource, /id="sports-simulator-settings"/);
});

test("Developer Tools groups controls by sports and Gamecast tasks", () => {
  assert.match(serverSource, /data-developer-group="sports-simulation"/);
  assert.match(serverSource, /data-developer-group="gamecast-testing"/);
  assert.match(serverSource, /data-sports-simulation-run>Preview Game State<\/button>/);
  assert.match(serverSource, /data-sports-simulation-clear>Clear Sports Simulation<\/button>/);
  assert.doesNotMatch(serverSource, /<details class="advanced-section"><summary>Advanced<\/summary>/);
});

test("Sports Simulation command navigation targets the profile selector", () => {
  assert.match(
    serverSource,
    /data-command-section="developer" data-command-focus="sports-simulation-profile"><span>Open Sports Simulation<\/span>/
  );
  assert.doesNotMatch(
    serverSource,
    /data-command-focus="sports-simulator-enabled"/
  );
});

test("Developer Tools exposes session-only scoring celebration controls", () => {
  assert.match(serverSource, /id="scoring-celebration-title">Scoring Celebration<\/h4>/);
  assert.match(serverSource, /data-scoring-celebration="run">MLB Run<\/button>/);
  assert.match(serverSource, /data-scoring-celebration="home-run">MLB Home Run<\/button>/);
  assert.match(serverSource, /data-scoring-celebration="touchdown">NFL Touchdown<\/button>/);
  assert.match(serverSource, /data-scoring-celebration="field-goal">NFL Field Goal<\/button>/);
  assert.doesNotMatch(serverSource, /id="scoring-celebration-intensity"/);
  assert.doesNotMatch(serverSource, /<option value="minor">Minor<\/option>/);
  assert.doesNotMatch(serverSource, /<option value="score"[^>]*>Score<\/option>/);
  assert.doesNotMatch(serverSource, /<option value="major">Major<\/option>/);
  assert.match(serverSource, /action:\s*"celebrate"/);
  assert.doesNotMatch(serverSource, /intensity:\s*celebrationIntensity/);
  assert.doesNotMatch(serverSource, /name="scoringCelebration/);
});

test("Developer Tools exposes a compact session-only Team Palette Preview", () => {
  assert.match(serverSource, /id="team-palette-preview-title">Team Palette Preview<\/h4>/);
  assert.match(serverSource, /<select id="team-palette-preview-team">/);
  assert.match(serverSource, /data-team-palette-preview>Preview Score<\/button>/);
  assert.match(serverSource, /data-team-palette-preview-status/);
  assert.match(serverSource, /action:\s*"palette-preview"/);
  assert.doesNotMatch(serverSource, /name="teamPalettePreview/);
  assert.doesNotMatch(serverSource, /teamPalettePreview[^\n]*(?:primary|secondary|accent)/i);
});

test("Developer Tools exposes the compact Gamecast Ownership simulator", () => {
  assert.match(serverSource, /id="gamecast-ownership-title">Gamecast Ownership<\/h4>/);
  for (const [command, label] of [
    ["rotation", "Test Rotation"],
    ["mariners-priority", "Mariners Takes Priority"],
    ["seahawks-priority", "Seahawks Takes Priority"],
    ["single-game", "Test Single Game"],
    ["reset", "Reset Gamecast Test"]
  ]) {
    assert.match(
      serverSource,
      new RegExp(`data-gamecast-ownership="${command}">${label}<\\/button>`)
    );
  }
  for (const removed of [
    "Start Dual Gamecast",
    "Make MLB Critical",
    "Make NFL Critical",
    "End MLB",
    "End NFL"
  ]) {
    assert.doesNotMatch(serverSource, new RegExp(`>${removed}<`));
  }
  assert.match(serverSource, /data-gamecast-ownership-status/);
  assert.match(serverSource, /<dt>Testing<\/dt><dd data-gamecast-ownership-testing>/);
  assert.match(serverSource, /<dt>Showing<\/dt><dd data-gamecast-ownership-showing>/);
  assert.match(serverSource, /<dt>Next<\/dt><dd data-gamecast-ownership-next>/);
  assert.doesNotMatch(serverSource, /MLB Critical:/);
  assert.doesNotMatch(serverSource, /NFL Critical:/);
  assert.doesNotMatch(serverSource, /name="gamecastOwnership/);
});
