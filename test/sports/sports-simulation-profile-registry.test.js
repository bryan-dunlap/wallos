const test = require("node:test");
const assert = require("node:assert/strict");
const {
  sportsSimulationProfileRegistry
} = require(
  "../../frontend/providers/sports-simulation-profile-registry"
);

test("registers MLB, NFL, NBA, and NHL simulation profiles", () => {
  const metadata = sportsSimulationProfileRegistry.getMetadata();

  assert.deepEqual(
    metadata.map(({ id }) => id),
    ["MLB", "NFL", "NBA", "NHL"]
  );
  metadata.forEach((profile) => {
    assert.ok(profile.scenarios.some(({ id }) => id === "scheduled"));
    assert.ok(profile.scenarios.some(({ id }) => id === "final"));
    assert.ok(profile.scenarios.some(({ id }) =>
      id !== "scheduled" && id !== "pregame" && id !== "final"
    ));
  });
});

test("MLB live simulation preserves baseball Gamecast detail", () => {
  const facts = sportsSimulationProfileRegistry.createFacts(
    "MLB",
    "full-count"
  );

  assert.equal(facts.simulation, true);
  assert.equal(facts.game.status, "live");
  assert.deepEqual(facts.game.count, { balls: 3, strikes: 2 });
  assert.equal(facts.game.outs, 2);
  assert.ok(facts.game.lineScore.innings.length > 0);
  assert.equal(facts.favoriteTeam.id, "SEA");
});

test("future league profiles emit normalized sport-specific state", () => {
  const nfl = sportsSimulationProfileRegistry.createFacts("NFL", "red-zone");
  const nba = sportsSimulationProfileRegistry.createFacts("NBA", "close-game");
  const nhl = sportsSimulationProfileRegistry.createFacts("NHL", "power-play");

  assert.equal(nfl.game.redZone, true);
  assert.equal(nfl.game.sport, "football");
  assert.equal(nba.game.quarter, 4);
  assert.equal(nba.game.sport, "basketball");
  assert.equal(nhl.game.strength, "5-on-4");
  assert.equal(nhl.game.sport, "hockey");
});

test("unknown profiles and scenarios fail safely", () => {
  assert.equal(
    sportsSimulationProfileRegistry.createFacts("MLS", "live"),
    null
  );
  assert.equal(
    sportsSimulationProfileRegistry.createFacts("MLB", "unknown"),
    null
  );
});
