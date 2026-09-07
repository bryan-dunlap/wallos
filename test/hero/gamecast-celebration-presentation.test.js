const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const heroSource = fs.readFileSync(
  path.join(PROJECT_ROOT, "frontend/widgets/hero.js"), "utf8"
);
const css = fs.readFileSync(
  path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"), "utf8"
);
const baseballRenderer = fs.readFileSync(
  path.join(PROJECT_ROOT, "frontend/widgets/baseball-game-renderer.js"), "utf8"
);
const footballRenderer = fs.readFileSync(
  path.join(PROJECT_ROOT, "frontend/widgets/football-game-renderer.js"), "utf8"
);

function loadHero(presentation = null) {
  const context = vm.createContext({
    Date,
    window: {
      mosaicApp: {
        gamecastCelebrationCoordinator: {
          getCurrentPresentation: () => presentation
        }
      }
    }
  });
  vm.runInContext(`${heroSource}; this.Hero = MosaicHero;`, context);
  return new context.Hero(null);
}

test("Hero-owned overlay presents the scoring popup outside renderer code", () => {
  const hero = loadHero();
  const markup = hero.renderGamecastCelebration({
    event: { id: "score-1", intensity: "major" },
    label: "TOUCHDOWN",
    logo: "https://example.test/seahawks.png"
  }, 750);

  assert.match(markup, /gamecast-celebration-layer is-major/);
  assert.match(markup, /gamecast-celebration-popup/);
  assert.match(markup, /class="gamecast-celebration-logo"/);
  assert.match(markup, /src="https:\/\/example\.test\/seahawks\.png"/);
  assert.match(markup, /width="58" height="58"/);
  assert.match(markup, /alt=""/);
  assert.match(markup, /TOUCHDOWN/);
  assert.match(markup, /--gamecast-celebration-delay: -750ms/);
  assert.doesNotMatch(baseballRenderer, /gamecast-celebration/);
  assert.doesNotMatch(footballRenderer, /gamecast-celebration/);
});

test("logo absence keeps the concise event label without a broken image", () => {
  const hero = loadHero();
  const markup = hero.renderGamecastCelebration({
    event: { id: "score-1", intensity: "score" },
    label: "RUN SCORED",
    logo: ""
  });

  assert.match(markup, /RUN SCORED/);
  assert.doesNotMatch(markup, /gamecast-celebration-logo/);
});

test("presentation contains no abandoned perimeter or discharge treatment", () => {
  const hero = loadHero();
  const markup = hero.renderGamecastCelebration({
    event: { id: "score-1", intensity: "score" },
    label: "SCORE"
  });

  assert.doesNotMatch(markup, /gamecast-celebration-(perimeter|discharge|trace|trail|leader)/);
  assert.doesNotMatch(css, /gamecast-celebration-(perimeter|discharge|trace|trail|leader)/);
  assert.doesNotMatch(markup, /<svg|<path|<rect/);
});

test("same celebration reattaches at elapsed time after Hero rerender", () => {
  const presentation = {
    event: { id: "score-1", intensity: "score" },
    label: "RUN SCORED",
    startedAt: Date.now() - 900,
    colors: null,
    logo: "https://example.test/mariners.svg"
  };
  const hero = loadHero(presentation);
  let inserted = "";
  const content = {
    querySelector: () => null,
    insertAdjacentHTML: (_position, markup) => { inserted = markup; }
  };
  hero.element = {
    querySelector: (selector) => selector === ".hero-active-content"
      ? content
      : null
  };
  hero.reconcileGamecastCelebration();

  assert.match(inserted, /RUN SCORED/);
  assert.match(inserted, /mariners\.svg/);
  assert.match(inserted, /--gamecast-celebration-delay: -9\d\dms/);
});

test("same celebration never inserts a duplicate popup overlay", () => {
  const presentation = {
    event: { id: "score-1", intensity: "score" },
    label: "RUN SCORED",
    startedAt: Date.now(),
    logo: "https://example.test/mariners.svg"
  };
  const hero = loadHero(presentation);
  let insertions = 0;
  const existingLayer = { dataset: { eventId: "score-1" } };
  const content = {
    querySelector: () => existingLayer,
    insertAdjacentHTML: () => { insertions += 1; }
  };
  hero.element = {
    querySelector: (selector) => selector === ".hero-active-content"
      ? content
      : null
  };

  hero.reconcileGamecastCelebration();
  hero.reconcileGamecastCelebration();

  assert.equal(insertions, 0);
});

test("missing presentation removes overlay and cannot appear on Resting Hero", () => {
  const hero = loadHero(null);
  let removed = false;
  const layer = { remove: () => { removed = true; } };
  const content = { querySelector: () => layer };
  hero.element = { querySelector: () => content };
  hero.reconcileGamecastCelebration();
  assert.equal(removed, true);

  hero.element = { querySelector: () => null };
  assert.doesNotThrow(() => hero.reconcileGamecastCelebration());
});

test("presentation uses theme fallback, future palette variables, and reduced motion", () => {
  assert.match(
    css,
    /--gamecast-celebration-primary:\s*var\(--color-accent\)/
  );
  assert.match(css, /--gamecast-celebration-highlight:/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)/);
  assert.match(css, /gamecast-celebration-popup-reduced/);
  assert.match(heroSource, /gamecast-celebration-logo/);
  assert.match(css, /pointer-events:\s*none/);
  assert.match(css, /position:\s*absolute/);
});
