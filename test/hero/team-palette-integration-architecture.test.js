const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.join(__dirname, "..", "..");
const read = (relativePath) => fs.readFileSync(
  path.join(root, relativePath),
  "utf8"
);

test("app composition creates and injects one explicit TeamPaletteStore", () => {
  const appCore = read("frontend/core/app-core.js");
  const index = read("frontend/index.html");
  const storeScript = 'src="sports/team-palette-store.js"';
  const coordinatorScript =
    'src="coordinator/gamecast-celebration-coordinator.js"';

  assert.equal((appCore.match(/new TeamPaletteStore/g) || []).length, 1);
  assert.match(appCore, /fetch:\s*window\.fetch\.bind\(window\)/);
  assert.match(appCore, /teamPaletteStore: this\.teamPaletteStore/);
  assert.ok(index.indexOf(storeScript) < index.indexOf(coordinatorScript));
});

test("score detector and normalized sports contracts remain palette-free", () => {
  for (const relativePath of [
    "frontend/sports/gamecast/score-event-detector.js",
    "frontend/sports/sports-event-contract.js",
    "frontend/sports/mlb-sports-event-adapter.js",
    "frontend/sports/nfl-sports-event-adapter.js"
  ]) {
    assert.doesNotMatch(read(relativePath), /palette|textOnPrimary/i);
  }
});

test("frozen MLB and NFL renderers remain palette-independent", () => {
  for (const relativePath of [
    "frontend/widgets/baseball-game-renderer.js",
    "frontend/widgets/football-game-renderer.js",
    "frontend/sports/mlb-sports-widget-renderer.js",
    "frontend/sports/nfl-sports-widget-renderer.js"
  ]) {
    assert.doesNotMatch(read(relativePath), /team-palette|TeamPalette|textOnPrimary/);
  }
});

test("coordinator does not consume palette or color data from score events", () => {
  const coordinator = read(
    "frontend/coordinator/gamecast-celebration-coordinator.js"
  );
  assert.doesNotMatch(coordinator, /scoreEvent\.(?:palette|colors)/);
  assert.doesNotMatch(coordinator, /queued\.event\.(?:palette|colors)/);
});

test("celebration consumer keeps palette textOnPrimary out of presentation", () => {
  const coordinator = read(
    "frontend/coordinator/gamecast-celebration-coordinator.js"
  );
  const store = read("frontend/sports/team-palette-store.js");
  assert.doesNotMatch(coordinator, /textOnPrimary/);
  assert.match(store, /textOnPrimary/);
});
