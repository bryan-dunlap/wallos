const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { normalizeFavoriteTeams } = require("../../backend/server");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const serverSource = fs.readFileSync(
  path.join(PROJECT_ROOT, "backend/server.js"), "utf8"
);

function loadSportsProvider() {
  const source = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/providers/sports-provider.js"),
    "utf8"
  );
  const context = vm.createContext({
    console,
    Date,
    Map,
    setTimeout: () => ({}),
    clearTimeout: () => {},
    window: { addEventListener: () => {}, mosaicApp: { eventBus: {
      subscribe: () => () => {}, publish: () => {}
    } } },
    fetch: async () => ({ ok: true, json: async () => ({}) }),
    MlbDataProvider: class {},
    NflDataProvider: class {}
  });
  vm.runInContext(`${source};this.SportsProvider=SportsProvider;`, context);
  return context.SportsProvider;
}

test("Favorite Teams rows expose native drag and accessible move controls", () => {
  assert.match(serverSource, /data-favorite-team-drag-handle/);
  assert.match(serverSource, /draggable="true"/);
  assert.match(serverSource, /data-move-favorite-team="up"/);
  assert.match(serverSource, /data-move-favorite-team="down"/);
  assert.match(serverSource, /aria-label="Move \$\{escapeHtml\(team\.name\)\} up"/);
  assert.match(serverSource, /aria-label="Move \$\{escapeHtml\(team\.name\)\} down"/);
  assert.match(serverSource, /moveUp\.disabled = index === 0/);
  assert.match(serverSource, /moveDown\.disabled = index === rows\.length - 1/);
});

test("drag and button moves reorder only the local row/input sequence", () => {
  assert.match(serverSource, /list\.addEventListener\("dragstart"/);
  assert.match(serverSource, /list\.addEventListener\("dragover"/);
  assert.match(serverSource, /list\.addEventListener\("drop"/);
  assert.match(serverSource, /list\.insertBefore\(\s*draggedTeamRow/);
  assert.match(serverSource, /list\.insertBefore\(row, sibling\)/);
  assert.match(serverSource, /list\.insertBefore\(sibling, row\)/);
  assert.match(serverSource, /markUnsaved\(\)/);
  assert.doesNotMatch(serverSource, /fetch\("\/control\/favorite-teams\/reorder/);
});

test("rank labels and add/remove retain DOM order as the submitted draft", () => {
  assert.match(serverSource, /data-favorite-team-rank[^>]*>#\$\{index \+ 1\}/);
  assert.match(serverSource, /rank\.textContent = "#" \+ \(index \+ 1\)/);
  assert.match(serverSource, /list\.insertBefore\(createTeamRow\(team\), emptyState\)/);
  assert.match(serverSource, /row\.remove\(\)/);
  assert.match(serverSource, /field\.name = "favoriteTeams"/);
});

test("mixed-league visual order persists and drives SportsProvider favoriteRank", async () => {
  const persisted = normalizeFavoriteTeams({
    favoriteTeams: ["SEA", "NFL:SEA"]
  });
  assert.deepEqual(
    persisted.map((team) => [team.id, team.league]),
    [["SEA", "MLB"], ["NFL:SEA", "NFL"]]
  );

  const SportsProvider = loadSportsProvider();
  const provider = new SportsProvider();
  const published = [];
  provider.simulationActive = false;
  provider.loadConfig = async () => ({
    enabled: true,
    favoriteTeams: persisted
  });
  provider.favoriteDataProviders = new Map([
    ["MLB", { getScheduleFacts: async (favoriteTeam) => ({
      status: "available", favoriteTeam, game: { status: "live" }
    }) }],
    ["NFL", { getScheduleFacts: async (favoriteTeam) => ({
      status: "available", favoriteTeam, game: { status: "live" }
    }) }]
  ]);
  provider.publishSportsFacts = (facts) => published.push(facts);
  provider.getDateKey = () => "2026-09-07";

  await provider.refreshSportsFacts();

  assert.deepEqual(JSON.parse(JSON.stringify(published.map((facts) => ({
    id: facts.favoriteTeam.id,
    favoriteRank: facts.favoriteRank
  })))), [
    { id: "SEA", favoriteRank: 0 },
    { id: "NFL:SEA", favoriteRank: 1 }
  ]);
});
