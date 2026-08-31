const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const {
  sportsSimulationProfileRegistry
} = require("../../frontend/providers/sports-simulation-profile-registry");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function loadClass(relativePath, className, globals = {}) {
  const source = fs.readFileSync(
    path.join(PROJECT_ROOT, relativePath),
    "utf8"
  );
  const context = vm.createContext({ ...globals });

  vm.runInContext(
    source + `; this.LoadedClass = ${className};`,
    context
  );

  return { Class: context.LoadedClass, context };
}

function loadRenderer() {
  let registration = null;
  const { Class } = loadClass(
    "frontend/widgets/football-game-renderer.js",
    "FootballGameRenderer",
    {
      window: {
        mosaicActiveRendererRegistry: {
          register: (type, renderer) => {
            registration = { type, renderer };
          }
        }
      }
    }
  );

  return { Renderer: Class, registration };
}

function scenario(id) {
  return sportsSimulationProfileRegistry.createFacts("NFL", id);
}

test("registers FootballGameRenderer for football-game payloads", () => {
  const { registration } = loadRenderer();

  assert.equal(registration.type, "football-game");
  assert.equal(typeof registration.renderer.render, "function");
});

test("NFL simulation builds a complete normalized football-game payload", () => {
  const facts = scenario("live-drive");
  const payload = facts.game.gamecast;

  assert.equal(facts.simulation, true);
  assert.equal(payload.type, "football-game");
  assert.equal(payload.status, "live");
  assert.equal(payload.teams.away.providerId, "26");
  assert.equal(payload.teams.home.providerId, "25");
  assert.match(payload.teams.away.logo, /sea\.png$/);
  assert.match(payload.teams.home.logo, /sf\.png$/);
  assert.deepEqual(payload.possession, {
    team: "away",
    providerTeamId: "26"
  });
  assert.deepEqual(
    {
      down: payload.situation.down,
      distance: payload.situation.distance,
      yardLine: payload.situation.yardLine,
      firstDownYardLine: payload.situation.firstDownYardLine
    },
    { down: 3, distance: 4, yardLine: 65, firstDownYardLine: 69 }
  );
  assert.equal(payload.drive.plays, 8);
  assert.equal(payload.lastPlay.quarter, 4);
  assert.deepEqual(payload.lineScore.periods, [1, 2, 3, 4]);
});

test("generic active context passes through typed football payload", () => {
  const { Class: SportsActiveContextGenerator } = loadClass(
    "frontend/providers/sports-active-context-generator.js",
    "SportsActiveContextGenerator",
    { Date }
  );
  const facts = scenario("live-drive");
  const candidate = new SportsActiveContextGenerator()
    .createLiveGameCandidate(facts);

  assert.equal(candidate.payload, facts.game.gamecast);
  assert.equal(candidate.payload.type, "football-game");
  assert.equal(candidate.mode, "active");
  assert.equal(candidate.id, "sports:live:NFL:SEA");

  const finalFacts = scenario("final");
  const finalCandidate = new SportsActiveContextGenerator()
    .createLiveGameCandidate(finalFacts);

  assert.equal(finalCandidate.payload.type, "football-game");
  assert.equal(finalCandidate.payload.status, "final");
});

test("renders matchup identities and scores without a possession dot", () => {
  const { Renderer } = loadRenderer();
  const markup = new Renderer().render(scenario("live-drive").game.gamecast);

  assert.match(markup, /Seahawks/);
  assert.match(markup, /49ers/);
  assert.match(markup, /football-team-score-away">\s*24/);
  assert.match(markup, /football-team-score-home">\s*23/);
  assert.doesNotMatch(markup, /football-possession-marker/);
  assert.match(markup, /Q4 · 2:48/);
  assert.match(markup, /3rd &amp; 4/i);
  assert.match(markup, /SF 35/);
  assert.equal((markup.match(/football-team-logo-image/g) || []).length, 2);
  assert.equal((markup.match(/football-team-name/g) || []).length, 2);
  assert.equal((markup.match(/class="football-team-score /g) || []).length, 2);
  assert.equal((markup.match(/football-matchup-separator/g) || []).length, 1);
  assert.match(
    markup,
    /football-team-identity-away[\s\S]*football-team-logo[\s\S]*football-team-name[\s\S]*football-team-score-away/
  );
  assert.match(
    markup,
    /football-team-score-home[\s\S]*football-team-identity-home[\s\S]*football-team-name[\s\S]*football-team-logo/
  );
});

test("matchup uses explicit mirrored columns around a fixed center", () => {
  const css = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );

  assert.match(
    css,
    /\.football-matchup\s*\{[^}]*grid-template-columns:\s*minmax\(0, 220px\) 62px 22px 62px minmax\(0, 220px\);[^}]*justify-content:\s*center;[^}]*column-gap:\s*12px/s
  );
  assert.match(
    css,
    /\.football-team-identity\s*\{[^}]*display:\s*flex;[^}]*gap:\s*8px/s
  );
  assert.match(css, /\.football-team-identity-away\s*\{[^}]*justify-content:\s*flex-end/s);
  assert.match(css, /\.football-team-identity-home\s*\{[^}]*justify-content:\s*flex-start/s);
  assert.match(
    css,
    /\.football-team-score-away\s*\{[^}]*justify-self:\s*end;[^}]*text-align:\s*right/s
  );
  assert.match(
    css,
    /\.football-team-score-home\s*\{[^}]*justify-self:\s*start;[^}]*text-align:\s*left/s
  );
  assert.match(
    css,
    /\.football-matchup-separator\s*\{[^}]*justify-self:\s*center/s
  );
  assert.doesNotMatch(
    css,
    /\.football-matchup-separator\s*\{[^}]*translateX/s
  );
});

test("renders field coordinates, first-down marker, and drive summary", () => {
  const { Renderer } = loadRenderer();
  const markup = new Renderer().render(scenario("live-drive").game.gamecast);

  assert.match(markup, /--football-ball-position: 62\.5%/);
  assert.match(markup, /--football-first-down-position: 65\.833333%/);
  assert.match(markup, /is-away-direction/);
  assert.match(markup, /football-first-down-marker/);
  assert.match(markup, /8 PLAYS/);
  assert.match(markup, /62 YDS/);
  assert.match(markup, /4:17/);
});

test("field renders recognizable yard lines and yard numbers without hashes", () => {
  const { Renderer } = loadRenderer();
  const markup = new Renderer().render(scenario("live-drive").game.gamecast);
  const css = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );

  assert.equal(
    (markup.match(/class="football-yard-line(?: |")/g) || []).length,
    19
  );
  assert.equal((markup.match(/is-major/g) || []).length, 9);
  assert.equal((markup.match(/is-minor/g) || []).length, 10);
  assert.equal((markup.match(/is-midfield/g) || []).length, 1);
  assert.doesNotMatch(markup, /football-hash-marks/);
  assert.equal((markup.match(/class="football-yard-number"/g) || []).length, 9);
  assert.match(
    markup,
    />10<\/span>[\s\S]*>20<\/span>[\s\S]*>30<\/span>[\s\S]*>40<\/span>[\s\S]*>50<\/span>[\s\S]*>40<\/span>[\s\S]*>30<\/span>[\s\S]*>20<\/span>[\s\S]*>10<\/span>/
  );
  assert.match(markup, /football-end-zone-away/);
  assert.match(markup, /football-end-zone-home/);
  assert.equal(
    (markup.match(/--football-yard-position: 16\.666667%/g) || []).length,
    2
  );
  assert.equal(
    (markup.match(/--football-yard-position: 50%/g) || []).length,
    2
  );
  assert.match(
    css,
    /\.football-field\s*\{[^}]*border:\s*1px solid[^}]*background:[^}]*#245c3a/s
  );
  assert.match(
    css,
    /\.football-field\s*\{[^}]*--football-end-zone-width:\s*calc\(100% \/ 12\)/s
  );
  assert.match(
    css,
    /\.football-field::before\s*\{[^}]*inset:\s*4px var\(--football-end-zone-width\);[^}]*border-top:[^}]*border-bottom:/s
  );
  assert.doesNotMatch(css, /\.football-hash-marks/);
  assert.match(
    css,
    /\.football-end-zone\s*\{[^}]*width:\s*var\(--football-end-zone-width\);[^}]*#17251d/s
  );
});

test("first-down target is a yellow line driven by normalized position", () => {
  const { Renderer } = loadRenderer();
  const markup = new Renderer().render(scenario("live-drive").game.gamecast);
  const css = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );

  assert.match(markup, /--football-first-down-position: 65\.833333%/);
  assert.match(markup, /football-first-down-marker/);
  assert.match(
    css,
    /\.football-first-down-marker\s*\{[^}]*left:\s*var\(--football-first-down-position\);[^}]*width:\s*3px;[^}]*background:\s*#ffd400;[^}]*z-index:\s*2/s
  );
  assert.doesNotMatch(css, /is-(?:away|home)-goal-line/);
  assert.match(
    css,
    /\.football-team-ball-marker\s*\{[^}]*z-index:\s*3/s
  );
});

test("current ball position uses the Mosaic accent beneath the possession logo", () => {
  const { Renderer } = loadRenderer();
  const markup = new Renderer().render(scenario("live-drive").game.gamecast);
  const field = markup.match(/<div class="football-field[\s\S]*?<\/div>/)?.[0];
  const css = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );

  assert.match(field, /--football-ball-position: 62\.5%/);
  assert.match(field, /football-ball-marker/);
  assert.match(field, /football-team-ball-marker/);
  assert.match(
    css,
    /\.football-ball-marker\s*\{[^}]*left:\s*var\(--football-ball-position\);[^}]*width:\s*3px;[^}]*background:\s*var\(--color-accent\);[^}]*z-index:\s*2/s
  );
});

test("away possession uses the away logo at the normalized ball position", () => {
  const { Renderer } = loadRenderer();
  const markup = new Renderer().render(scenario("live-drive").game.gamecast);
  const field = markup.match(/<div class="football-field[\s\S]*?<\/div>/)?.[0];

  assert.match(field, /--football-ball-position: 62\.5%/);
  assert.match(field, /football-team-ball-marker/);
  assert.match(field, /teamlogos\/nfl\/500\/sea\.png/);
  assert.match(field, /football-first-down-marker/);

  const css = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );
  assert.match(
    css,
    /\.football-team-ball-marker\s*\{[^}]*left:\s*var\(--football-ball-position\);[^}]*width:\s*36px;[^}]*height:\s*36px;/s
  );
});

test("home possession uses the home logo at the normalized ball position", () => {
  const { Renderer } = loadRenderer();
  const markup = new Renderer().render(
    scenario("possession-change").game.gamecast
  );
  const field = markup.match(/<div class="football-field[\s\S]*?<\/div>/)?.[0];

  assert.match(field, /--football-ball-position: 70\.833333%/);
  assert.match(field, /--football-first-down-position: 70%/);
  assert.match(markup, /2nd &amp; 1/i);
  assert.match(field, /football-team-ball-marker/);
  assert.match(field, /teamlogos\/nfl\/500\/sf\.png/);
});

test("unknown possession falls back to the neutral field marker", () => {
  const { Renderer } = loadRenderer();
  const payload = scenario("live-drive").game.gamecast;
  payload.possession = null;
  const markup = new Renderer().render(payload);

  assert.match(markup, /football-ball-marker" aria-hidden="true"><\/span>/);
  assert.doesNotMatch(markup, /football-team-ball-marker/);
});

test("missing possessing-team logo falls back to the neutral field marker", () => {
  const { Renderer } = loadRenderer();
  const payload = structuredClone(scenario("live-drive").game.gamecast);
  payload.teams.away.logo = "";
  const markup = new Renderer().render(payload);

  assert.match(markup, /football-ball-marker" aria-hidden="true"><\/span>/);
  assert.doesNotMatch(markup, /football-team-ball-marker/);
});

test("renders red-zone and goal-to-go simulation states", () => {
  const { Renderer } = loadRenderer();
  const renderer = new Renderer();
  const redZone = renderer.render(scenario("red-zone").game.gamecast);
  const goalToGo = renderer.render(scenario("goal-to-go").game.gamecast);

  assert.match(redZone, /football-field is-red-zone/);
  assert.match(redZone, /3rd &amp; 15/i);
  assert.match(redZone, /--football-ball-position: 76\.666667%/);
  assert.match(redZone, /--football-first-down-position: 89\.166667%/);
  assert.match(goalToGo, /2nd &amp; Goal/i);
  assert.match(goalToGo, /--football-ball-position: 87\.5%/);
  assert.match(goalToGo, /--football-first-down-position: 91\.666667%/);
});

test("maps every normalized field coordinate into the playable field", () => {
  const { Renderer } = loadRenderer();
  const renderer = new Renderer();

  assert.equal(renderer.fieldCoordinate(0), 8.333333);
  assert.equal(renderer.fieldCoordinate(10), 16.666667);
  assert.equal(renderer.fieldCoordinate(50), 50);
  assert.equal(renderer.fieldCoordinate(82), 76.666667);
  assert.equal(renderer.fieldCoordinate(97), 89.166667);
  assert.equal(renderer.fieldCoordinate(100), 91.666667);
});

test("goal-to-go targets map naturally to both visual goal lines", () => {
  const { Renderer } = loadRenderer();
  const renderer = new Renderer();
  const awayPayload = scenario("goal-to-go").game.gamecast;
  const homePayload = structuredClone(awayPayload);
  homePayload.possession = { team: "home", providerTeamId: "25" };
  homePayload.situation.yardLine = 5;
  homePayload.situation.firstDownYardLine = 0;

  const away = renderer.render(awayPayload);
  const home = renderer.render(homePayload);

  assert.match(away, /--football-ball-position: 87\.5%/);
  assert.match(away, /--football-first-down-position: 91\.666667%/);
  assert.match(home, /--football-ball-position: 12\.5%/);
  assert.match(home, /--football-first-down-position: 8\.333333%/);
  assert.doesNotMatch(away, /is-(?:away|home)-goal-line/);
  assert.doesNotMatch(home, /is-(?:away|home)-goal-line/);
});

test("possession change reverses the field direction", () => {
  const { Renderer } = loadRenderer();
  const markup = new Renderer().render(
    scenario("possession-change").game.gamecast
  );

  assert.match(markup, /is-home-direction/);
  assert.match(markup, /--football-first-down-position: 70%/);
});

test("renders last play and contains long descriptions structurally", () => {
  const { Renderer } = loadRenderer();
  const renderer = new Renderer();
  const normal = renderer.render(scenario("live-drive").game.gamecast);
  const long = renderer.render(scenario("long-last-play").game.gamecast);
  const css = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );

  assert.match(normal, /LAST/);
  assert.match(normal, /pass complete to D\.Metcalf/);
  assert.match(long, /extended review confirmed the catch/);
  assert.match(
    css,
    /\.football-last-play\s*\{[^}]*min-height:\s*20px;[^}]*overflow:\s*hidden/s
  );
  assert.match(
    css,
    /\.football-last-play-text\s*\{[^}]*-webkit-line-clamp:\s*2;[^}]*line-clamp:\s*2/s
  );
});

test("renders both quarter-score rows and overtime", () => {
  const { Renderer } = loadRenderer();
  const renderer = new Renderer();
  const regulation = renderer.render(scenario("live-drive").game.gamecast);
  const overtime = renderer.render(scenario("overtime").game.gamecast);

  assert.match(regulation, /<th scope="row">SEA<\/th>/);
  assert.match(regulation, /<th scope="row">SF<\/th>/);
  assert.match(
    regulation,
    /<div class="football-line-score-region">\s*<table class="football-line-score">/
  );
  assert.equal((regulation.match(/<th scope="col">Q[1-4]<\/th>/g) || []).length, 4);
  assert.match(overtime, /<th scope="col">OT<\/th>/);
  assert.match(overtime, /OT · 7:22/);
});

test("complete football composition is centered within equal outer insets", () => {
  const css = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );

  assert.match(
    css,
    /\.football-gamecast\s*\{[^}]*grid-template-rows:\s*auto auto auto 82px minmax\(20px, auto\) minmax\(64px, auto\);[^}]*align-content:\s*center;[^}]*gap:\s*6px;[^}]*padding:\s*12px 0;/s
  );
  assert.match(
    css,
    /\.football-line-score-region\s*\{[^}]*align-self:\s*stretch;[^}]*display:\s*flex;[^}]*align-items:\s*center;[^}]*padding-block:\s*6px/s
  );
});

test("halftime and final render a neutral midfield matchup field", () => {
  const { Renderer } = loadRenderer();
  const renderer = new Renderer();
  const halftime = renderer.render(scenario("halftime").game.gamecast);
  const final = renderer.render(scenario("final").game.gamecast);

  assert.match(halftime, />HALF</);
  assert.doesNotMatch(halftime, /football-down-distance/);
  assert.doesNotMatch(halftime, /football-ball-marker/);
  assert.doesNotMatch(halftime, /football-team-ball-marker/);
  assert.doesNotMatch(halftime, /is-(?:away|home)-direction/);
  assert.match(halftime, /football-field is-neutral-field/);
  assert.match(halftime, /--football-first-down-position: 50%/);
  assert.match(
    halftime,
    /football-neutral-team-marker-away[\s\S]*--football-neutral-team-position: 37\.5%[\s\S]*sea\.png/
  );
  assert.match(
    halftime,
    /football-neutral-team-marker-home[\s\S]*--football-neutral-team-position: 62\.5%[\s\S]*sf\.png/
  );
  assert.match(final, />FINAL</);
  assert.match(final, /football-team-score-away">\s*30/);
  assert.match(final, /<th scope="col">OT<\/th>/);
  assert.doesNotMatch(final, /football-down-distance/);
  assert.match(final, /football-field is-neutral-field/);
  assert.match(final, /--football-first-down-position: 50%/);
  assert.doesNotMatch(final, /football-ball-marker/);
  assert.doesNotMatch(final, /football-team-ball-marker/);
  assert.equal(
    (final.match(/class="football-neutral-team-marker /g) || []).length,
    2
  );
});

test("neutral field omits only unavailable team logos", () => {
  const { Renderer } = loadRenderer();
  const payload = structuredClone(scenario("halftime").game.gamecast);
  payload.teams.away.logo = "";
  const markup = new Renderer().render(payload);

  assert.doesNotMatch(markup, /football-neutral-team-marker-away/);
  assert.match(markup, /football-neutral-team-marker-home/);
  assert.match(markup, /football-first-down-marker/);
  assert.doesNotMatch(markup, /football-ball-marker/);
});

test("missing optional drive data renders only available values", () => {
  const { Renderer } = loadRenderer();
  const payload = scenario("missing-drive-detail").game.gamecast;
  payload.situation.firstDownYardLine = null;
  payload.possession = null;
  payload.lastPlay = null;
  const markup = new Renderer().render(payload);

  assert.match(markup, /8 PLAYS/);
  assert.match(markup, /62 YDS/);
  assert.doesNotMatch(markup, /4:17/);
  assert.doesNotMatch(markup, /football-first-down-marker/);
  assert.doesNotMatch(markup, /football-team-ball-marker/);
  assert.doesNotMatch(markup, /football-last-play-label/);
});

test("NFL simulator exposes all Gamecast validation scenarios", () => {
  const nfl = sportsSimulationProfileRegistry.getMetadata()
    .find(({ id }) => id === "NFL");
  const scenarioIds = nfl.scenarios.map(({ id }) => id);

  assert.deepEqual(
    scenarioIds.filter((id) => id !== "scheduled" && id !== "pregame"),
    [
      "live-drive",
      "red-zone",
      "goal-to-go",
      "possession-change",
      "halftime",
      "overtime",
      "long-last-play",
      "missing-drive-detail",
      "final"
    ]
  );
});

test("football Gamecast uses a fixed internal grid inside existing Hero bounds", () => {
  const css = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );

  assert.match(
    css,
    /\.football-gamecast\s*\{[^}]*height:\s*100%;[^}]*display:\s*grid;[^}]*grid-template-rows:/s
  );
  assert.match(
    css,
    /\.football-field,\s*\.football-field-placeholder\s*\{[^}]*height:\s*82px/s
  );
  assert.doesNotMatch(css, /@media[^{]*\{[^}]*football-gamecast/s);
});
