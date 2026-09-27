const assert = require("node:assert/strict");
const test = require("node:test");
const fs = require("node:fs");
const path = require("node:path");

const {
  WeatherWidget,
  getWeatherFreshness
} = require("../../frontend/widgets/weather-widget");
const {
  selectUpcomingWeatherHours
} = require("../../frontend/providers/weather-provider");
const {
  createNormalizedSportsEvent
} = require("../../frontend/sports/sports-event-contract");
const {
  SportsWidgetQueue
} = require("../../frontend/sports/sports-widget-queue");

global.SportsWidgetQueue = SportsWidgetQueue;
global.MlbSportsEventAdapter = class {};
global.NflSportsEventAdapter = class {};
const sportsFeatureRequests = [];
global.window = {
  mosaicSportsWidgetRendererRegistry: null,
  mosaicApp: {
    eventBus: {
      publish: (event) => sportsFeatureRequests.push(event),
      subscribe: () => () => {}
    }
  }
};
const {
  SportsWidget,
  renderFeaturedPerformers
} = require("../../frontend/widgets/sports-widget");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

function fakeMount() {
  return { dataset: {}, innerHTML: "" };
}

function weatherPayload(overrides = {}) {
  return {
    status: "available",
    stale: false,
    location: "Tacoma, WA",
    temperature: 64,
    apparentTemperature: 62,
    condition: "Partly cloudy",
    icon: "🌤️",
    high: 70,
    low: 51,
    precipitation: 0,
    hourly: Array.from({ length: 7 }, (_, index) => ({
      at: `2026-09-26T${String(index + 10).padStart(2, "0")}:00`,
      temperature: 64 + index,
      precipitationChance: index === 2 ? 40 : 0,
      condition: "Partly cloudy",
      icon: "🌤️"
    })),
    ...overrides
  };
}

test("Weather stays compact until density changes and Expanded is richer", () => {
  const widget = new WeatherWidget();
  const mount = fakeMount();
  widget.element = mount;
  widget.showEvent({ payload: weatherPayload() });

  assert.equal(mount.dataset.normalWidgetDensity, "compact");
  assert.match(mount.innerHTML, /weather-content/);
  assert.doesNotMatch(mount.innerHTML, /weather-hourly-entry/);

  widget.setPresentationContext({ density: "expanded" });

  assert.equal(mount.dataset.normalWidgetDensity, "expanded");
  assert.match(mount.innerHTML, /Feels 62°/);
  assert.equal((mount.innerHTML.match(/weather-hourly-entry/g) || []).length, 5);
  assert.match(mount.innerHTML, /40%/);
  assert.doesNotMatch(mount.innerHTML, />0%</);

  widget.setPresentationContext({ density: "compact" });
  assert.doesNotMatch(mount.innerHTML, /weather-hourly-entry/);
});

test("Weather freshness is truthful for current, stale, and unavailable data", () => {
  assert.equal(getWeatherFreshness({ status: "available" }), "Current");
  assert.equal(
    getWeatherFreshness({ status: "available", stale: true }),
    "Last known"
  );
  assert.equal(getWeatherFreshness({ status: "unavailable" }), "Unavailable");
  assert.equal(getWeatherFreshness({ status: "loading" }), "Loading");
});

test("normal Weather event selection emits only five hours after the current hour", () => {
  const hours = Array.from({ length: 9 }, (_, index) => ({
    time: `2026-09-26T${String(index + 8).padStart(2, "0")}:00`
  }));
  const result = selectUpcomingWeatherHours(
    hours,
    "UTC",
    new Date("2026-09-26T10:35:00.000Z")
  );

  assert.deepEqual(
    result.map((hour) => hour.time),
    [
      "2026-09-26T11:00",
      "2026-09-26T12:00",
      "2026-09-26T13:00",
      "2026-09-26T14:00",
      "2026-09-26T15:00"
    ]
  );
});

function sportsEvent(id, status, league = "MLB", names = ["Mariners", "Angels"]) {
  return createNormalizedSportsEvent({
    league,
    id,
    type: "game",
    status,
    participants: {
      away: { name: names[0], record: "90-60", logo: "away.png" },
      home: { name: names[1], record: "70-80", logo: "home.png" }
    },
    scores: { away: status === "scheduled" ? null : 5, home: status === "scheduled" ? null : 3 },
    state: {
      scheduledTime: "7:10 PM",
      statusDetail: "Top 8th",
      clock: "04:12"
    },
    details: {
      baseball: { pitcher: "Hidden Pitcher", batter: "Hidden Batter", outs: 2 },
      football: { possession: "SEA", down: 3, distance: 7, redZone: true }
    }
  });
}

function createSportsWidget(events) {
  const widget = new SportsWidget();
  widget.element = fakeMount();
  widget.widgetConfig = { available: true, enabled: true, leagues: new Set(["MLB", "NFL"]) };
  widget.state = { payload: { availability: "available" } };
  widget.rendererRegistry = {
    get: () => ({
      render: (event) => ({
        status: event.status === "scheduled" ? "7:10 PM" : event.status === "live" ? "Top 8th" : "Final",
        content: `<div class="safe-scoreboard">${event.participants.away.name} ${event.scores.away ?? ""} ${event.participants.home.name} ${event.scores.home ?? ""}</div>`
      })
    })
  };
  widget.queue.replace(events);
  widget.startRotation = () => {};
  widget.stopRotation = () => {};
  return widget;
}

test("Sports Compact stays single-event while Expanded stays on that game", () => {
  const events = [
    sportsEvent("one", "live"),
    sportsEvent("two", "scheduled", "NFL", ["Seahawks", "Rams"]),
    sportsEvent("three", "final", "MLB", ["Astros", "Yankees"]),
    sportsEvent("four", "scheduled", "NFL", ["Bills", "Dolphins"])
  ];
  const widget = createSportsWidget(events);

  widget.render();
  assert.match(widget.element.innerHTML, /safe-scoreboard/);
  assert.doesNotMatch(widget.element.innerHTML, /sports-expanded-row/);

  widget.setPresentationContext({ density: "expanded" });
  assert.match(widget.element.innerHTML, /Mariners/);
  assert.doesNotMatch(widget.element.innerHTML, /sports-expanded-row/);
  assert.doesNotMatch(widget.element.innerHTML, /Seahawks at Rams|Astros at Yankees/);
  assert.doesNotMatch(widget.element.innerHTML, /Bills at Dolphins/);
  assert.doesNotMatch(widget.element.innerHTML, /Hidden Pitcher|Hidden Batter|possession|redZone/);
});

test("Sports density transition reuses the same event rotation", () => {
  const widget = createSportsWidget([
    sportsEvent("one", "live"),
    sportsEvent("two", "final")
  ]);
  let starts = 0;
  let stops = 0;
  widget.startRotation = () => { starts += 1; };
  widget.stopRotation = () => { stops += 1; };

  widget.setPresentationContext({ density: "expanded" });
  assert.equal(stops, 1);
  assert.equal(starts, 1);

  widget.setPresentationContext({ density: "compact" });
  assert.equal(stops, 2);
  assert.equal(starts, 2);
});

test("Sports Expanded supports fewer than three events", () => {
  const event = sportsEvent("one", "final");
  const widget = createSportsWidget([event]);
  widget.setPresentationContext({ density: "expanded" });

  assert.match(widget.element.innerHTML, /Final/);
  assert.doesNotMatch(widget.element.innerHTML, /sports-expanded-row/);
});

test("Sports Expanded omits only an exact duplicate lifecycle status", () => {
  const finalWidget = createSportsWidget([sportsEvent("final", "final")]);
  finalWidget.setPresentationContext({ density: "expanded" });
  assert.equal((finalWidget.element.innerHTML.match(/Final/g) || []).length, 1);
  assert.doesNotMatch(
    finalWidget.element.innerHTML,
    /sports-expanded-meta[^>]*>[\s\S]*?<span>final<\/span>/
  );

  const liveWidget = createSportsWidget([sportsEvent("live", "live")]);
  liveWidget.setPresentationContext({ density: "expanded" });
  assert.match(liveWidget.element.innerHTML, /Top 8th/);
  assert.match(liveWidget.element.innerHTML, /<span>live<\/span>/);

  const scheduledWidget = createSportsWidget([
    sportsEvent("scheduled", "scheduled")
  ]);
  scheduledWidget.setPresentationContext({ density: "expanded" });
  assert.match(scheduledWidget.element.innerHTML, /7:10 PM/);
  assert.match(scheduledWidget.element.innerHTML, /<span>scheduled<\/span>/);
});

test("Sports Expanded renders league-neutral performer summaries", () => {
  const widget = createSportsWidget([sportsEvent("one", "final")]);
  widget.featuredPerformers.set("one", {
    teams: {
      away: { name: "Mariners", entries: [
        { role: "Batter", name: "Julio Rodríguez", summary: "2–4 · HR · 3 RBI" },
        { role: "Pitcher", name: "Logan Gilbert", summary: "6.0 IP · 2 ER · 7 K" }
      ] },
      home: { name: "Angels", entries: [] }
    }
  });
  widget.setPresentationContext({ density: "expanded" });
  assert.match(widget.element.innerHTML, /Top performers/);
  assert.match(widget.element.innerHTML, /Julio Rodríguez/);
  assert.match(widget.element.innerHTML, /6.0 IP · 2 ER · 7 K/);
  assert.doesNotMatch(widget.element.innerHTML, /atBats|rbi|inningsPitched/);
});

test("Sports performer presentation escapes external text fields", () => {
  const html = renderFeaturedPerformers({ teams: {
    away: { name: "A <script>", entries: [{
      role: "<Batter", name: "Player <img>", summary: "2–4 & dangerous"
    }] },
    home: { name: "Home", entries: [] }
  } });

  assert.doesNotMatch(html, /<script>|<img>/);
  assert.match(html, /A &lt;script&gt;/);
  assert.match(html, /Player &lt;img&gt;/);
  assert.match(html, /2–4 &amp; dangerous/);
});

test("Sports performer state is pruned and late obsolete responses are ignored", () => {
  const widget = createSportsWidget([sportsEvent("old", "final")]);
  widget.featuredPerformers.set("old", { teams: {} });
  const current = sportsEvent("current", "live");

  widget.pruneFeaturedPerformers([current]);
  widget.queue.replace([current]);
  widget.receiveFeaturedPerformers({
    eventId: "old", featuredPerformers: { teams: {} }
  });

  assert.equal(widget.featuredPerformers.has("old"), false);
});

test("shared Expanded CSS is density-scoped and leaves generic geometry intact", () => {
  const css = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );

  assert.match(css, /\[data-normal-widget-density="expanded"\]/);
  assert.match(css, /\.normal-widget-slot--expanded\s*\{[^}]*grid-row:\s*1 \/ -1/s);
  assert.doesNotMatch(css, /@media[^{]*\{[^}]*(weather-expanded|sports-expanded|homeAssistant-widget)/s);
});
