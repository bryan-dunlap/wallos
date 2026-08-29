const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function read(relativePath) {
  return fs.readFileSync(path.join(PROJECT_ROOT, relativePath), "utf8");
}

function loadScaleController(width = 1512, height = 982) {
  const source = read("frontend/layout/canvas-scale-controller.js");
  const properties = new Map();
  const listeners = new Map();
  const frames = [];
  const documentElement = {
    clientWidth: width,
    clientHeight: height,
    style: {
      setProperty: (name, value) => properties.set(name, value)
    }
  };
  const window = {
    requestAnimationFrame: (callback) => {
      frames.push(callback);
      return frames.length;
    },
    cancelAnimationFrame: () => {},
    addEventListener: (type, listener) => listeners.set(type, listener),
    removeEventListener: (type) => listeners.delete(type)
  };
  const context = vm.createContext({
    document: { documentElement },
    window
  });

  vm.runInContext(
    `${source}; this.calculateScale = calculateMosaicCanvasScale;`,
    context
  );

  return {
    context,
    documentElement,
    properties,
    listeners,
    frames
  };
}

test("canonical canvas uses the approved fixed design dimensions", () => {
  const variablesCss = read("frontend/css/variables.css");
  const mainCss = read("frontend/css/main.css");

  assert.match(variablesCss, /--mosaic-canvas-width:\s*1512px;/);
  assert.match(variablesCss, /--mosaic-canvas-height:\s*982px;/);
  assert.match(mainCss, /\.mosaic-dashboard\s*\{[^}]*width:\s*var\(--mosaic-canvas-width\);[^}]*height:\s*var\(--mosaic-canvas-height\);/s);
  assert.match(mainCss, /transform:\s*scale\(var\(--mosaic-scale\)\)/);
  assert.doesNotMatch(mainCss, /@media\s*\(max-height:/);
});

test("canvas scale uses the smaller viewport ratio", () => {
  const { context } = loadScaleController();

  assert.equal(context.calculateScale(1512, 982), 1);
  assert.equal(context.calculateScale(1920, 1080), 1080 / 982);
  assert.equal(context.calculateScale(1366, 768), 768 / 982);
  assert.equal(context.calculateScale(1280, 800), 800 / 982);
});

test("scale controller publishes one uniform scale and coalesces resize work", () => {
  const state = loadScaleController(1024, 600);

  assert.equal(
    Number(state.properties.get("--mosaic-scale")),
    600 / 982
  );
  assert.ok(state.listeners.has("resize"));

  state.listeners.get("resize")();
  state.listeners.get("resize")();
  assert.equal(state.frames.length, 1);

  state.documentElement.clientWidth = 800;
  state.documentElement.clientHeight = 480;
  state.frames.shift()();
  assert.equal(
    Number(state.properties.get("--mosaic-scale")),
    480 / 982
  );
});

test("viewport stage centers one uniformly transformed canvas", () => {
  const mainCss = read("frontend/css/main.css");
  const indexHtml = read("frontend/index.html");

  assert.match(mainCss, /\.mosaic-viewport-stage\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*overflow:\s*hidden;/s);
  assert.match(indexHtml, /<div class="mosaic-viewport-stage">\s*<main class="mosaic-dashboard">/s);
  assert.doesNotMatch(mainCss, /scaleX\(|scaleY\(/);
});

test("major zones share the canonical 12px perimeter rhythm", () => {
  const mainCss = read("frontend/css/main.css");
  const variablesCss = read("frontend/css/variables.css");
  const widgetsCss = read("frontend/widgets/widgets.css");

  assert.match(variablesCss, /--space-zone-padding:\s*12px;/);
  assert.match(
    mainCss,
    /\.dashboard-zone\s*\{[^}]*padding:\s*var\(--space-zone-padding\);/s
  );
  assert.match(
    mainCss,
    /\.planning-layout\s*\{[^}]*gap:\s*var\(--space-card-gap\);/s
  );
  assert.doesNotMatch(mainCss, /\.live-zone\s*\{[^}]*padding:/s);
  assert.match(
    widgetsCss,
    /\.widget-grid\s*\{[^}]*grid-template-rows:\s*minmax\(0, 1fr\) minmax\(0, 1fr\);[^}]*gap:\s*12px;/s
  );
  assert.match(
    widgetsCss,
    /\.weather-widget\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;[^}]*align-self:\s*stretch;/s
  );
  assert.match(
    widgetsCss,
    /\.sports-widget\s*\{[^}]*min-height:\s*0;[^}]*height:\s*100%;[^}]*align-self:\s*stretch;/s
  );
});

test("canonical major rows give Planning modestly more space", () => {
  const mainCss = read("frontend/css/main.css");

  assert.match(
    mainCss,
    /grid-template-rows:\s*minmax\(260px, auto\)\s*minmax\(260px, 1\.2fr\)\s*minmax\(240px, 1fr\)/s
  );
});

test("Weather uses a contained remaining-height body without smaller type", () => {
  const widgetsCss = read("frontend/widgets/widgets.css");

  assert.match(
    widgetsCss,
    /\.weather-content\s*\{[^}]*min-height:\s*0;[^}]*flex:\s*1 1 auto;[^}]*overflow:\s*hidden;[^}]*gap:\s*0;/s
  );
  assert.match(
    widgetsCss,
    /\.weather-widget\s*\{[^}]*padding-block:\s*8px;/s
  );
  assert.match(widgetsCss, /\.weather-temperature\s*\{[^}]*font-size:\s*4rem;/s);
  assert.match(widgetsCss, /\.weather-rotating\s*\{[^}]*font-size:\s*1\.25rem;/s);
  assert.match(widgetsCss, /\.weather-details\s*\{[^}]*font-size:\s*1\.1rem;/s);
});

test("internal presentation no longer depends on the outer viewport", () => {
  const mainCss = read("frontend/css/main.css");
  const internalMainCss = mainCss.replace(/body\s*\{[^}]*\}/s, "");
  const presentationCss = [
    internalMainCss,
    read("frontend/widgets/widgets.css")
  ].join("\n");

  assert.doesNotMatch(presentationCss, /[0-9.]v[wh]/);
});
