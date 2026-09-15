const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function ruleFor(stylesheet, selector) {
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

test("Live Zone contains one generic host with two generic slots", () => {
  const html = read("frontend/index.html");
  const host = html.match(
    /<div class="normal-widget-host">([\s\S]*?)<\/div>\s*<\/div>\s*<\/div>\s*<\/section>/
  );

  assert.ok(host);
  assert.equal(
    [...html.matchAll(/data-normal-widget-slot="([^"]+)"/g)].length,
    2
  );
  assert.match(host[1], /data-normal-widget-slot="1"/);
  assert.match(host[1], /data-normal-widget-slot="2"/);
  assert.equal(
    [...host[1].matchAll(/class="layer-3-card-surface normal-widget-surface"/g)]
      .length,
    2
  );
});

test("Phase 3 bootstrap statically assigns Weather and Sports to generic slots", () => {
  const source = read("frontend/layout/layout-bootstrap.js");

  assert.match(source, /\["weather", "1"\]/);
  assert.match(source, /\["sports", "2"\]/);
  assert.match(source, /data-normal-widget-slot/);
  assert.match(source, /\.normal-widget-mount/);
  assert.doesNotMatch(source, /querySelector\(\s*"\.weather-widget"/s);
  assert.doesNotMatch(source, /querySelector\(\s*"\.sports-widget"/s);
});

test("generic host and slots own all right-side grid geometry", () => {
  const css = read("frontend/widgets/widgets.css");
  const host = ruleFor(css, ".normal-widget-host");
  const primary = ruleFor(css, ".normal-widget-slot--primary");
  const secondary = ruleFor(css, ".normal-widget-slot--secondary");
  const weather = ruleFor(css, ".weather-widget");
  const sports = ruleFor(css, ".sports-widget");

  assert.match(host, /grid-column:\s*2\s*;/);
  assert.match(host, /grid-row:\s*1 \/ span 2\s*;/);
  assert.match(
    host,
    /grid-template-rows:\s*minmax\(0, 1fr\) minmax\(0, 1fr\)\s*;/
  );
  assert.match(host, /gap:\s*12px\s*;/);
  assert.match(primary, /grid-row:\s*1\s*;/);
  assert.match(secondary, /grid-row:\s*2\s*;/);
  assert.doesNotMatch(weather, /grid-(column|row)/);
  assert.doesNotMatch(sports, /grid-(column|row)/);
  assert.doesNotMatch(weather, /mosaic-zone-surface-extension/);
  assert.doesNotMatch(sports, /mosaic-zone-surface-extension/);
});

test("generic surfaces overlap mounts and retain card treatment", () => {
  const css = read("frontend/widgets/widgets.css");

  assert.match(
    css,
    /\.normal-widget-slot > \.normal-widget-surface,\s*\.normal-widget-slot > \.normal-widget-mount\s*\{[^}]*grid-area:\s*1 \/ 1\s*;/s
  );
  assert.match(
    css,
    /\.normal-widget-surface,\s*\.discovery-zone > \.discovery-card-surface\s*\{[^}]*border-radius:\s*24px;[^}]*box-shadow:/s
  );
  assert.doesNotMatch(css, /weather-card-surface|sports-card-surface/);
});

test("host preserves surplus extension and can span one generic slot", () => {
  const css = read("frontend/widgets/widgets.css");
  const host = ruleFor(css, ".normal-widget-host");
  const expanded = ruleFor(css, ".normal-widget-slot--expanded");

  assert.match(
    host,
    /margin-right:\s*calc\(\s*0px - var\(--mosaic-zone-surface-extension\)\s*\)/
  );
  assert.match(expanded, /grid-row:\s*1 \/ -1\s*;/);
});

test("Hero and non-Live-Zone layout ownership remains unchanged", () => {
  const css = read("frontend/widgets/widgets.css");
  const mainCss = read("frontend/css/main.css");

  assert.match(
    css,
    /\.hero-card-surface\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1 \/ span 2;/s
  );
  assert.match(
    css,
    /\.hero-container\s*\{[^}]*grid-column:\s*1;[^}]*grid-row:\s*1 \/ span 2;/s
  );
  assert.match(mainCss, /\.planning-layout\s*\{/);
  assert.match(mainCss, /\.discovery-card-surface\s*\{/);
});

test("Phase 2 policy remains dormant and no composition timer is introduced", () => {
  const html = read("frontend/index.html");
  const bootstrap = read("frontend/layout/layout-bootstrap.js");
  const css = read("frontend/widgets/widgets.css");
  const phaseThreeSource = `${html}\n${bootstrap}\n${css}`;

  assert.doesNotMatch(html, /normal-widget-composition-policy\.js/);
  assert.doesNotMatch(
    bootstrap,
    /composeNormalWidgets|reconcileNormalWidgetComposition/
  );
  assert.doesNotMatch(phaseThreeSource, /setTimeout|setInterval/);
});
