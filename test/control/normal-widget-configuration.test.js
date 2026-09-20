const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { once } = require("node:events");
const {
  app,
  isNormalWidgetTimingRelevant,
  normalizeNormalWidgetsConfig,
  renderNormalWidgetTimingControls,
  resolveNormalWidgetControlUpdate
} = require("../../backend/server");

const serverSource = fs.readFileSync(
  path.join(__dirname, "..", "..", "backend", "server.js"),
  "utf8"
);
let controlServer;
let controlHtml;

before(async () => {
  controlServer = app.listen(0, "127.0.0.1");
  await once(controlServer, "listening");
  const { port } = controlServer.address();
  const response = await fetch(`http://127.0.0.1:${port}/control`);
  assert.equal(response.status, 200);
  controlHtml = await response.text();
});

after(async () => {
  if (!controlServer) return;
  controlServer.close();
  await once(controlServer, "close");
});

const currentConfig = {
  weather: {
    enabled: false,
    widget: { enabled: true, dormantWidgetValue: "weather" },
    hero: { enabled: false, dormantHeroValue: "weather" },
    dormantIntegrationValue: "weather"
  },
  sports: {
    enabled: false,
    widget: {
      enabled: true,
      leagues: ["MLB", "NHL"],
      internalRotationSeconds: 9
    },
    hero: { enabled: false },
    favoriteTeams: [{ id: "SEA", league: "MLB" }]
  },
  homeAssistant: {
    enabled: true,
    baseUrl: "https://ha.example.test",
    accessToken: "private",
    entities: ["light.office"],
    widget: { enabled: false }
  },
  normalWidgets: {
    mode: "pair",
    order: ["weather", "sports", "homeAssistant"],
    rotationSeconds: 17,
    timingMode: "global",
    durations: { weather: 17, sports: 25, homeAssistant: 30, future: 35 }
  }
};

function update(overrides = {}) {
  return {
    weatherWidgetEnabled: false,
    sportsWidgetEnabled: true,
    homeAssistantWidgetEnabled: true,
    mode: "expanded",
    order: ["sports", "homeAssistant", "weather"],
    rotationSeconds: 25,
    timingMode: "global",
    durations: { weather: 5, sports: 15, homeAssistant: 25 },
    ...overrides
  };
}

test("actual /control response renders Widgets navigation and controls", () => {
  assert.match(controlHtml, /data-settings-target="widgets"[^>]*title="Widgets"/);
  assert.match(controlHtml, /data-settings-panel="widgets"/);
  assert.match(controlHtml, /name="weatherWidgetEnabled"/);
  assert.match(controlHtml, /name="sportsWidgetEnabled"/);
  assert.match(controlHtml, /name="homeAssistantWidgetEnabled"/);
  assert.match(controlHtml, /name="normalWidgetsMode"/);
  assert.match(controlHtml, /value="pair"[^>]*>Pair Rotation/);
  assert.match(controlHtml, /value="expanded"[^>]*>Expanded Rotation/);
  assert.match(controlHtml, /<select id="normal-widgets-rotation-seconds" name="normalWidgetsRotationSeconds"/);
  assert.doesNotMatch(controlHtml, /name="normalWidgetsRotationSeconds"[^>]*type="number"/);
  assert.match(controlHtml, /name="normalWidgetsTimingMode"[^>]*value="global"/);
  assert.match(controlHtml, /name="normalWidgetsTimingMode"[^>]*value="perWidget"/);
  assert.match(controlHtml, /name="normalWidgetsDurationsDraft"/);
  assert.match(controlHtml, /name="normalWidgetsOrder"[^>]*value="weather"/);
  assert.match(controlHtml, /name="normalWidgetsOrder"[^>]*value="sports"/);
  assert.match(controlHtml, /name="normalWidgetsOrder"[^>]*value="homeAssistant"/);
  assert.match(controlHtml, /data-widget-layout-info/);
  assert.equal((controlHtml.match(/name="sportsWidgetEnabled"/g) || []).length, 1);
});

test("Display toggles update only widget participation", () => {
  const saved = resolveNormalWidgetControlUpdate(currentConfig, update());

  assert.equal(saved.weather.widget.enabled, false);
  assert.equal(saved.weather.enabled, false);
  assert.equal(saved.weather.hero.enabled, false);
  assert.equal(saved.weather.dormantIntegrationValue, "weather");
  assert.equal(saved.weather.widget.dormantWidgetValue, "weather");
  assert.equal(saved.weather.hero.dormantHeroValue, "weather");
  assert.equal(saved.sports.widget.enabled, true);
  assert.equal(saved.sports.enabled, false);
  assert.equal(saved.sports.hero.enabled, false);
  assert.equal(saved.homeAssistant.enabled, true);
  assert.equal(saved.homeAssistant.widget.enabled, true);
  assert.deepEqual(saved.sports.widget.leagues, ["MLB", "NHL"]);
  assert.deepEqual(saved.sports.favoriteTeams, [{ id: "SEA", league: "MLB" }]);
  assert.equal(saved.normalWidgets.durations.future, 35);
});

test("layout is explicit and never inferred from enabled widget count", () => {
  const neitherEnabled = resolveNormalWidgetControlUpdate(
    currentConfig,
    update({ weatherWidgetEnabled: false, sportsWidgetEnabled: false })
  );
  const pair = resolveNormalWidgetControlUpdate(
    currentConfig,
    update({ mode: "pair", weatherWidgetEnabled: true })
  );

  assert.equal(neitherEnabled.normalWidgets.mode, "expanded");
  assert.equal(pair.normalWidgets.mode, "pair");
});

test("rotation accepts inclusive 5–300 whole-second values", () => {
  for (const rotationSeconds of [5, 15, 300]) {
    assert.equal(
      resolveNormalWidgetControlUpdate(
        currentConfig,
        update({ rotationSeconds })
      ).normalWidgets.rotationSeconds,
      rotationSeconds
    );
  }
  for (const rotationSeconds of [4, 301, 12.5, "invalid"]) {
    assert.throws(
      () => resolveNormalWidgetControlUpdate(
        currentConfig,
        update({ rotationSeconds })
      ),
      /Widget rotation interval/
    );
  }
  assert.equal(currentConfig.sports.widget.internalRotationSeconds, 9);
});

test("legacy timing defaults to global without changing valid odd-second values", () => {
  const normalized = normalizeNormalWidgetsConfig({
    mode: "pair",
    order: ["weather", "sports"],
    rotationSeconds: 17,
    durations: { weather: 7, future: 19 }
  });

  assert.equal(normalized.timingMode, "global");
  assert.equal(normalized.rotationSeconds, 17);
  assert.deepEqual(normalized.durations, {
    weather: 7,
    future: 19,
    sports: 17,
    homeAssistant: 17
  });
  assert.match(serverSource, /seconds % 5 !== 0[\s\S]*" \(current\)"/);
});

test("Display Timing uses 5-second selects and progressive disclosure", () => {
  const globalSelect = controlHtml.match(
    /<select id="normal-widgets-rotation-seconds"[\s\S]*?<\/select>/
  )?.[0];
  assert.ok(globalSelect);
  const standardValues = [...globalSelect.matchAll(/<option value="(\d+)"/g)]
    .map((match) => Number(match[1]))
    .filter((value) => value % 5 === 0);
  assert.deepEqual(
    standardValues,
    Array.from({ length: 60 }, (_, index) => (index + 1) * 5)
  );
  assert.match(controlHtml, /data-widget-timing-global/);
  assert.match(controlHtml, /data-normal-widget-duration="weather"/);
  assert.match(controlHtml, /data-normal-widget-duration="sports"/);
  assert.match(controlHtml, /data-normal-widget-duration="homeAssistant"/);
  assert.doesNotMatch(controlHtml, /data-normal-widget-duration[^>]*type="number"/);
  assert.match(serverSource, /globalControls\.hidden = timingMode !== "global"/);
  assert.match(serverSource, /individualControls\.hidden = timingMode !== "perWidget"/);
  assert.match(serverSource, /choice\.addEventListener\("change", revealSelectedTiming\)/);

  const base = normalizeNormalWidgetsConfig({
    rotationSeconds: 15,
    durations: { weather: 5, sports: 15, homeAssistant: 20 }
  });
  const globalMarkup = renderNormalWidgetTimingControls(base);
  const individualMarkup = renderNormalWidgetTimingControls({
    ...base,
    timingMode: "perWidget"
  });
  assert.match(globalMarkup, /value="global" checked/);
  assert.match(globalMarkup, /data-widget-timing-global>/);
  assert.match(globalMarkup, /data-widget-timing-individual hidden/);
  assert.match(individualMarkup, /value="perWidget" checked/);
  assert.match(individualMarkup, /data-widget-timing-global hidden/);
  assert.match(individualMarkup, /data-widget-timing-individual>/);
});

test("Display Timing visibility matches Pair and Expanded rotation thresholds", () => {
  for (const [mode, expectations] of [
    ["pair", [false, false, false, true, true]],
    ["expanded", [false, false, true, true, true]]
  ]) {
    expectations.forEach((expected, enabledWidgetCount) => {
      assert.equal(
        isNormalWidgetTimingRelevant(mode, enabledWidgetCount),
        expected,
        `${mode} with ${enabledWidgetCount} enabled widgets`
      );
    });
  }
});

test("Display Timing reacts to draft layout and display changes without resetting state", () => {
  assert.match(serverSource, /data-normal-widget-display="weather"/);
  assert.match(serverSource, /data-normal-widget-display="sports"/);
  assert.match(serverSource, /data-normal-widget-display="homeAssistant"/);
  assert.match(serverSource, /layoutSelect\?\.addEventListener\("change", revealRelevantTiming\)/);
  assert.match(serverSource, /toggle\.addEventListener\("change", revealRelevantTiming\)/);
  assert.match(serverSource, /enabledWidgetCount < 2[\s\S]*enabledWidgetCount < 3/);
  const relevanceSource = serverSource.match(
    /const revealRelevantTiming = \(\) => \{[\s\S]*?\n      \};/
  )?.[0];
  assert.ok(relevanceSource);
  assert.doesNotMatch(relevanceSource, /(\.value\s*=(?!=)|durations\[)/);

  const timing = normalizeNormalWidgetsConfig({
    mode: "expanded",
    rotationSeconds: 17,
    timingMode: "perWidget",
    durations: { weather: 5, sports: 15, homeAssistant: 25 }
  });
  const visibleMarkup = renderNormalWidgetTimingControls(timing, true);
  const hiddenMarkup = renderNormalWidgetTimingControls(timing, false);
  assert.match(visibleMarkup, /data-widget-timing-controls>/);
  assert.match(hiddenMarkup, /data-widget-timing-controls hidden>/);
  for (const retained of [
    /value="perWidget" checked/,
    /value="17" selected>17 seconds \(current\)/,
    /data-normal-widget-duration="weather"[\s\S]*value="5" selected/,
    /data-normal-widget-duration="sports"[\s\S]*value="15" selected/,
    /data-normal-widget-duration="homeAssistant"[\s\S]*value="25" selected/
  ]) {
    assert.match(visibleMarkup, retained);
    assert.match(hiddenMarkup, retained);
  }
  assert.doesNotMatch(serverSource, /fetch\("\/control\/normal-widgets/);
});

test("timing modes retain dormant global, individual, and future values", () => {
  const individual = resolveNormalWidgetControlUpdate(
    currentConfig,
    update({
      timingMode: "perWidget",
      rotationSeconds: 17,
      durations: { weather: 5, sports: 15, homeAssistant: 25 }
    })
  );
  assert.equal(individual.normalWidgets.rotationSeconds, 17);
  assert.deepEqual(individual.normalWidgets.durations, {
    weather: 5,
    sports: 15,
    homeAssistant: 25,
    future: 35
  });

  const global = resolveNormalWidgetControlUpdate(
    { ...currentConfig, normalWidgets: individual.normalWidgets },
    update({
      timingMode: "global",
      rotationSeconds: 10,
      durations: { weather: 5, sports: 15, homeAssistant: 25, future: 35 }
    })
  );
  assert.equal(global.normalWidgets.rotationSeconds, 10);
  assert.deepEqual(global.normalWidgets.durations, {
    weather: 5,
    sports: 15,
    homeAssistant: 25,
    future: 35
  });
});

test("order uses stable IDs, readable metadata, and keeps disabled widgets", () => {
  const saved = resolveNormalWidgetControlUpdate(
    currentConfig,
    update({ sportsWidgetEnabled: false })
  );
  assert.deepEqual(saved.normalWidgets.order, [
    "sports", "homeAssistant", "weather"
  ]);
  assert.match(serverSource, /NORMAL_WIDGET_CONTROL_METADATA/);
  assert.match(serverSource, /label: "Weather"/);
  assert.match(serverSource, /label: "Sports"/);
  assert.match(serverSource, /label: "Home Assistant"/);
  assert.match(serverSource, /name="normalWidgetsOrder"[^>]*value="\$\{widgetId\}"/);
  assert.match(serverSource, /data-move-normal-widget="up"/);
  assert.match(serverSource, /data-move-normal-widget="down"/);
  assert.match(serverSource, /dispatchEvent\(\s*new Event\("input", \{ bubbles: true \}\)/);
});

test("normal-widget changes remain draft-only until the shared save", () => {
  for (const name of [
    "weatherWidgetEnabled",
    "sportsWidgetEnabled",
    "homeAssistantWidgetEnabled",
    "normalWidgetsMode",
    "normalWidgetsRotationSeconds",
    "normalWidgetsTimingMode",
    "normalWidgetsDurationsDraft",
    "normalWidgetsOrder"
  ]) {
    assert.match(serverSource, new RegExp(`"${name}"`));
  }
  assert.match(controlHtml, /<form class="settings-form" method="post" action="\/control">/);
  assert.match(controlHtml, /Save Changes/);
  assert.match(controlHtml, /const savedFieldNames = new Set\(\[/);
  assert.match(controlHtml, /"normalWidgetsMode"/);
  assert.match(controlHtml, /"normalWidgetsOrder"/);
  assert.doesNotMatch(controlHtml, /fetch\("\/control\/normal-widgets/);
});

test("layout info popover supports pointer, focus, activation, and Escape", () => {
  assert.match(controlHtml, /data-widget-layout-info/);
  assert.match(controlHtml, /addEventListener\("mouseenter", show\)/);
  assert.match(controlHtml, /addEventListener\("focusin", show\)/);
  assert.match(controlHtml, /button\.addEventListener\("click"/);
  assert.match(controlHtml, /event\.key === "Escape"/);
  assert.match(controlHtml, /aria-expanded="false"/);
  assert.match(
    controlHtml,
    /data-pair-layout-schematic[^>]*>[\s\S]*?layout-widget-stack[^>]*>[\s\S]*?>A<[\s\S]*?>B<[\s\S]*?<\/span><\/span>/
  );
  assert.match(
    controlHtml,
    /\.layout-widget-stack \{ display: grid; gap: 3px; \}/
  );
  assert.match(
    controlHtml,
    /data-pair-rotation-schematic[^>]*>[\s\S]*?>A<[\s\S]*?>B<[\s\S]*?→[\s\S]*?>B<[\s\S]*?>C<[\s\S]*?→[\s\S]*?>C<[\s\S]*?>A</
  );
  assert.match(
    controlHtml,
    /data-expanded-layout-schematic[^>]*>[\s\S]*?layout-expanded-state[^>]*>A<[\s\S]*?→[\s\S]*?layout-expanded-state[^>]*>B</
  );
  assert.match(controlHtml, /\.layout-expanded-state \{[^}]*min-height: 62px/);
  assert.match(controlHtml, /shows up to two widgets at once/i);
  assert.match(controlHtml, /shows one expanded widget at a time/i);
  assert.doesNotMatch(controlHtml, /widget-layout[^\n]*(\.png|\.jpg|\.webp)/i);
});

test("Control save preserves existing subsystem update paths", () => {
  assert.match(serverSource, /resolveHomeAssistantConfigUpdate\(currentConfig\.homeAssistant/);
  assert.match(serverSource, /resolveDisplayPowerScheduleUpdate\(\s*currentConfig\.display\.powerSchedule/);
  assert.match(serverSource, /sportsHero: currentConfig\.sports\.hero/);
  assert.match(serverSource, /leagues: sportsWidgetLeagues/);
  assert.match(serverSource, /normalWidgets: normalWidgetControl\.normalWidgets/);
});
