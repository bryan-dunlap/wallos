const test = require("node:test");
const assert = require("node:assert/strict");
const {
  SPORTS_TEAM_REGISTRY,
  getSportsTeam
} = require("../../backend/sports-team-registry");

test("registry contains every supported league team", () => {
  const counts = SPORTS_TEAM_REGISTRY.reduce((result, team) => {
    result[team.league] = (result[team.league] || 0) + 1;
    return result;
  }, {});

  assert.deepEqual(counts, {
    MLB: 30,
    NFL: 32,
    NBA: 30,
    NHL: 32
  });
});

test("team IDs are stable and collision-free across leagues", () => {
  const ids = SPORTS_TEAM_REGISTRY.map((team) => team.id);

  assert.equal(new Set(ids).size, ids.length);
  assert.equal(getSportsTeam("SEA").name, "Seattle Mariners");
  assert.equal(getSportsTeam("NFL:SEA").name, "Seattle Seahawks");
  assert.equal(getSportsTeam("NHL:SEA").name, "Seattle Kraken");
});

test("MLB metadata remains intact and unsupported leagues stay provider-neutral", () => {
  const mariners = getSportsTeam("SEA");
  const seahawks = getSportsTeam("NFL:SEA");

  assert.equal(mariners.providerId, 136);
  assert.equal(mariners.renderer, "baseball-gamecast");
  assert.equal(
    mariners.logo,
    "https://www.mlbstatic.com/team-logos/136.svg"
  );
  assert.equal(seahawks.sport, "football");
  assert.equal("providerId" in seahawks, false);
  assert.equal("renderer" in seahawks, false);
  assert.equal("logo" in seahawks, false);
});
