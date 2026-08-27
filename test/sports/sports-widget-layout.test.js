const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const stylesheet = fs.readFileSync(
  path.join(__dirname, "../../frontend/widgets/widgets.css"),
  "utf8"
);

function ruleFor(selector) {
  const escapedSelector = selector.replace(
    /[.*+?^${}()|[\]\\]/g,
    "\\$&"
  );
  const match = stylesheet.match(
    new RegExp(`${escapedSelector}\\s*\\{([^}]*)\\}`)
  );

  assert.ok(match, `Expected CSS rule for ${selector}`);
  return match[1];
}

test("Sports Widget body owns remaining height for vertical centering", () => {
  const sportsWidget = ruleFor(".sports-widget");
  const sportsBody = ruleFor(".sports-widget > .widget-body");
  const matchupLayout = ruleFor(".sports-matchup-layout");
  const widgetBody = ruleFor(".widget-body");

  assert.match(sportsWidget, /display:\s*flex\s*;/);
  assert.match(sportsWidget, /flex-direction:\s*column\s*;/);
  assert.match(sportsBody, /flex:\s*1 1 auto\s*;/);
  assert.match(sportsBody, /min-height:\s*0\s*;/);
  assert.match(matchupLayout, /flex-direction:\s*column\s*;/);
  assert.match(widgetBody, /justify-content:\s*center\s*;/);
});

test("Sports scoreboards share an explicit three-row vertical shell", () => {
  const sportsWidget = ruleFor(".sports-widget");
  const teamLogo = ruleFor(".team-identity-logo");
  const teamRecord = ruleFor(".team-identity-record");
  const sportsTeam = ruleFor(".sports-widget-team");
  const scoreValue = ruleFor(".sports-scoreboard-value");
  const scoreboards = ruleFor(
    ".mlb-widget-scoreboard,\n.nfl-widget-scoreboard,\n" +
      ".sports-widget-scheduled-scoreboard"
  );
  const headings = ruleFor(".sports-scoreboard-heading");
  const scheduledAway = ruleFor(
    ".sports-widget-scheduled-scoreboard .sports-widget-team-away"
  );
  const scheduledHome = ruleFor(
    ".sports-widget-scheduled-scoreboard .sports-widget-team-home"
  );

  assert.match(
    sportsWidget,
    /--sports-scoreboard-heading-height:\s*\.75rem\s*;/
  );
  assert.match(
    sportsWidget,
    /--sports-widget-logo-size:\s*40px\s*;/
  );
  assert.match(
    sportsWidget,
    /--sports-scoreboard-team-row-height:\s*36px\s*;/
  );
  assert.match(
    sportsWidget,
    /--sports-scoreboard-row-gap:\s*8px\s*;/
  );
  assert.match(
    sportsWidget,
    /--sports-widget-team-name-size:\s*1\.55rem\s*;/
  );
  assert.match(
    sportsWidget,
    /--sports-widget-team-record-size:\s*\.68rem\s*;/
  );
  assert.match(
    teamLogo,
    /width:\s*var\(--sports-widget-logo-size\)\s*;/
  );
  assert.match(
    teamLogo,
    /height:\s*var\(--sports-widget-logo-size\)\s*;/
  );
  assert.match(
    sportsTeam,
    /font-size:\s*var\(--sports-widget-team-name-size\)\s*;/
  );
  assert.match(
    teamRecord,
    /font-size:\s*var\(--sports-widget-team-record-size\)\s*;/
  );
  assert.match(scoreValue, /font-size:\s*1\.55rem\s*;/);
  assert.match(
    scoreboards,
    /grid-template-rows:\s*var\(--sports-scoreboard-heading-height\)\s*repeat\(2, var\(--sports-scoreboard-team-row-height\)\)\s*;/
  );
  assert.match(
    scoreboards,
    /row-gap:\s*var\(--sports-scoreboard-row-gap\)\s*;/
  );
  assert.match(
    headings,
    /line-height:\s*var\(--sports-scoreboard-heading-height\)\s*;/
  );
  assert.match(scheduledAway, /grid-row:\s*2\s*;/);
  assert.match(scheduledHome, /grid-row:\s*3\s*;/);
});
