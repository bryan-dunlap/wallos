const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

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

  return context.LoadedClass;
}

function event(title, start, end, allDay = false) {
  return {
    title,
    startTime: start.toISOString(),
    endTime: end.toISOString(),
    allDay
  };
}

function dailyContext(overrides = {}) {
  return {
    schemaVersion: 1,
    date: "2026-08-27",
    greeting: { text: "Good Morning Bryan", period: "morning" },
    alerts: [],
    weather: null,
    sports: [],
    calendar: [],
    insights: [],
    generatedAt: new Date(2026, 7, 27, 9, 0).toISOString(),
    ...overrides
  };
}

function renderDailyContext(payload) {
  const MosaicHero = loadClass(
    "frontend/widgets/hero.js",
    "MosaicHero",
    { window: {} }
  );
  const hero = new MosaicHero(null);

  hero.state = { title: "Legacy title", subtitle: "", payload };
  return { hero, markup: hero.renderRestingTemplate() };
}

test("Resting Hero title-cases every greeting and preserves the configured name", () => {
  const DailySnapshotGenerator = loadClass(
    "frontend/providers/daily-snapshot-generator.js",
    "DailySnapshotGenerator"
  );
  const generator = new DailySnapshotGenerator();
  const name = "Bryan McDONALD";

  assert.equal(
    generator.createHeadline(new Date(2026, 7, 27, 8, 0), name),
    "Good Morning Bryan McDONALD"
  );
  assert.equal(
    generator.createHeadline(new Date(2026, 7, 27, 14, 0), name),
    "Good Afternoon Bryan McDONALD"
  );
  assert.equal(
    generator.createHeadline(new Date(2026, 7, 27, 20, 0), name),
    "Good Evening Bryan McDONALD"
  );
});

test("Resting Hero orders remaining events and reserves its last row for sports", () => {
  const DailySnapshotGenerator = loadClass(
    "frontend/providers/daily-snapshot-generator.js",
    "DailySnapshotGenerator"
  );
  const generator = new DailySnapshotGenerator();
  const now = new Date(2026, 7, 27, 15, 0);
  const gameTime = new Date(2026, 7, 27, 19, 10);
  const rows = generator.createRestingRows({
    calendar: {
      status: "available",
      timedEvents: [
        event("Dinner", new Date(2026, 7, 27, 18, 30), new Date(2026, 7, 27, 19, 30)),
        event("Completed", new Date(2026, 7, 27, 12, 0), new Date(2026, 7, 27, 13, 0)),
        event("Dentist", new Date(2026, 7, 27, 16, 0), new Date(2026, 7, 27, 17, 0)),
        event("Late event", new Date(2026, 7, 27, 20, 0), new Date(2026, 7, 27, 21, 0))
      ],
      allDayEvents: []
    },
    sports: {
      status: "available",
      favoriteTeam: { shortName: "Mariners" },
      game: {
        status: "scheduled",
        startTime: gameTime.toISOString()
      }
    }
  }, now);

  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    { type: "calendar", text: "Dentist — 4:00 PM" },
    { type: "calendar", text: "Dinner — 6:30 PM" },
    { type: "sports", text: "Mariners play tonight at 7:10 PM." }
  ]);
  assert.equal(rows.some((row) => row.text.includes("Completed")), false);
  assert.equal(rows.some((row) => /Remaining today|Next:|events?\./i.test(row.text)), false);
});

test("Resting Hero shows at most three calendar rows when sports is absent", () => {
  const DailySnapshotGenerator = loadClass(
    "frontend/providers/daily-snapshot-generator.js",
    "DailySnapshotGenerator"
  );
  const generator = new DailySnapshotGenerator();
  const now = new Date(2026, 7, 27, 9, 0);
  const timedEvents = [10, 11, 12, 13].map((hour, index) =>
    event(
      `Event ${index + 1}`,
      new Date(2026, 7, 27, hour, 0),
      new Date(2026, 7, 27, hour, 30)
    )
  );
  const rows = generator.createRestingRows({
    calendar: { status: "available", timedEvents, allDayEvents: [] },
    sports: { status: "unavailable", game: null }
  }, now);

  assert.equal(rows.length, 3);
  assert.deepEqual(
    JSON.parse(JSON.stringify(rows.map((row) => row.text))),
    ["Event 1 — 10:00 AM", "Event 2 — 11:00 AM", "Event 3 — 12:00 PM"]
  );
});

test("Resting Hero renders all-day events without inventing a time", () => {
  const DailySnapshotGenerator = loadClass(
    "frontend/providers/daily-snapshot-generator.js",
    "DailySnapshotGenerator"
  );
  const generator = new DailySnapshotGenerator();
  const day = new Date(2026, 7, 27, 0, 0);
  const rows = generator.createCalendarRows({
    status: "available",
    timedEvents: [],
    allDayEvents: [event("Conference", day, new Date(2026, 7, 28), true)]
  }, new Date(2026, 7, 27, 15, 0));

  assert.deepEqual(JSON.parse(JSON.stringify(rows)), [
    { type: "calendar", text: "Conference" }
  ]);
});

test("MosaicHero renders the greeting before normalized rows and omits summary prose", () => {
  const MosaicHero = loadClass(
    "frontend/widgets/hero.js",
    "MosaicHero",
    { window: {} }
  );
  const hero = new MosaicHero(null);

  hero.state = {
    title: "Good evening Bryan",
    subtitle: "Remaining today: 2 events. Next: Dentist at 4:00 PM.",
    payload: {
      rows: [
        { type: "calendar", text: "Dentist — 4:00 PM" },
        { type: "sports", text: "Mariners play tonight at 7:10 PM." }
      ]
    }
  };

  const markup = hero.renderRestingTemplate();

  assert.ok(markup.indexOf("Good evening Bryan") < markup.indexOf("Dentist"));
  assert.ok(markup.indexOf("Dentist") < markup.indexOf("Mariners"));
  assert.doesNotMatch(markup, /Remaining today|Next:/);
});

test("normal weather stays in daily context but does not render in Resting Hero", () => {
  const start = new Date(2026, 7, 27, 13, 10);
  const calendarStart = new Date(2026, 7, 27, 15, 30);
  const { markup } = renderDailyContext(dailyContext({
    weather: {
      current: {
        temperature: 62,
        condition: { label: "Partly Cloudy", icon: "🌤️" }
      },
      today: { high: 69, low: 54 }
    },
    sports: [{
      id: "MLB:SEA:game",
      state: "upcoming",
      favoriteTeam: { shortName: "Mariners" },
      opponent: "Rays",
      startsAt: start.toISOString()
    }],
    calendar: [{
      id: "dentist",
      title: "Dentist",
      startsAt: calendarStart.toISOString(),
      allDay: false,
      state: "upcoming"
    }]
  }));

  assert.match(markup, /Good Morning Bryan/);
  assert.doesNotMatch(markup, /62°|Partly Cloudy|69° \/ 54°|🌤️/);
  assert.match(markup, /Mariners vs\. Rays ·/);
  assert.match(markup, /Dentist/);
});

test("useful insight coexists while normal weather remains absent", () => {
  const { markup } = renderDailyContext(dailyContext({
    weather: {
      current: { temperature: 58, condition: { label: "Rain" } },
      today: { high: 61, low: 50 }
    },
    sports: [{
      id: "MLB:SEA:game",
      state: "upcoming",
      favoriteTeam: { shortName: "Mariners" },
      opponent: "Rays",
      startsAt: new Date(2026, 7, 27, 13, 10).toISOString()
    }],
    insights: [{
      headline: "Rain likely later",
      summary: "Around 4:00 PM",
      emphasis: "significant"
    }],
    calendar: [{
      id: "dinner",
      title: "Dinner",
      startsAt: new Date(2026, 7, 27, 18, 0).toISOString(),
      allDay: false,
      state: "upcoming"
    }]
  }));

  ["Mariners", "Rain likely later", "Around 4:00 PM", "Dinner"]
    .forEach((text) => assert.ok(markup.includes(text)));
  assert.match(markup, /hero-insight-glyph/);
  assert.match(markup, /hero-calendar-glyph/);
  assert.doesNotMatch(markup, /58°|>Rain</);
});

test("completed win renders one natural-language line without Final or duplication", () => {
  const { markup } = renderDailyContext(dailyContext({
    greeting: { text: "Good Afternoon Bryan", period: "afternoon" },
    weather: {
      current: { temperature: 62, condition: { label: "Partly Cloudy" } },
      today: { high: 69, low: 54 }
    },
    sports: [{
      id: "MLB:SEA:game",
      state: "completed",
      favoriteTeam: {
        name: "Seattle Mariners",
        shortName: "Mariners",
        sport: "baseball",
        logo: "https://example.com/mariners.png"
      },
      league: "MLB",
      opponent: "Red Sox",
      score: { favoriteTeam: 5, opponent: 3 },
      result: "Mariners win 5-3",
      startsAt: new Date(2026, 7, 27, 13, 10).toISOString()
    }],
    calendar: [{
      id: "dinner",
      title: "Dinner",
      startsAt: new Date(2026, 7, 27, 18, 0).toISOString(),
      allDay: false,
      state: "upcoming"
    }]
  }));

  ["Good Afternoon Bryan", "Mariners beat Red Sox 5–3", "Dinner"]
    .forEach((text) => assert.ok(markup.includes(text)));
  assert.match(markup, /hero-sports-glyph/);
  assert.match(markup, /data-sport="baseball"[^>]*>\s*⚾/);
  assert.doesNotMatch(markup, /hero-sports-logo|mariners\.png|<img/);
  assert.doesNotMatch(markup, /Seattle Mariners|Boston Red Sox|Mariners vs\.|Mariners win|Final|62°/);
  assert.equal((markup.match(/Mariners/g) || []).length, 1);
});

test("completed loss renders concise natural-language loss result", () => {
  const { markup } = renderDailyContext(dailyContext({
    sports: [{
      id: "MLB:SEA:game",
      state: "completed",
      favoriteTeam: { shortName: "Mariners" },
      opponent: "Boston",
      score: { favoriteTeam: 3, opponent: 8 },
      result: "Seattle Mariners lose 3-8",
      startsAt: new Date(2026, 7, 27, 13, 10).toISOString()
    }]
  }));

  assert.match(markup, /Mariners lost to Boston 3–8/);
  assert.doesNotMatch(markup, /Final|Mariners vs\./);
});

test("upcoming game uses one concise matchup and time line", () => {
  const { markup } = renderDailyContext(dailyContext({
    sports: [{
      id: "MLB:SEA:game",
      state: "upcoming",
      favoriteTeam: { shortName: "Mariners" },
      opponent: "Boston",
      startsAt: new Date(2026, 7, 27, 13, 10).toISOString()
    }]
  }));

  assert.match(markup, /Mariners vs\. Boston · 1:10 PM/);
  assert.doesNotMatch(markup, /Today|hero-daily-sport-status/);
});

test("Resting Hero maps known and unknown sports to generic glyphs", () => {
  const sports = [
    ["MLB", "baseball", "Mariners", "Red Sox", "⚾"],
    ["NFL", "football", "Seahawks", "Rams", "🏈"],
    ["NHL", "hockey", "Kraken", "Canucks", "🏒"],
    ["NBA", "basketball", "Storm", "Liberty", "🏀"],
    ["OTHER", "curling", "Seattle", "Portland", "•"]
  ].map(([league, sport, team, opponent, glyph], index) => ({
    id: `${league}:${index}`,
    league,
    state: "upcoming",
    favoriteTeam: {
      name: `City ${team}`,
      shortName: team,
      sport,
      logo: `https://example.com/${team}.png`
    },
    opponent,
    startsAt: new Date(2026, 7, 27, 13 + index).toISOString(),
    glyph
  }));
  const { hero } = renderDailyContext(dailyContext());

  sports.forEach((item) => {
    const markup = hero.renderDailySports([item]);
    assert.ok(markup.includes(item.glyph));
    assert.ok(markup.includes(`${item.favoriteTeam.shortName} vs. ${item.opponent}`));
    assert.doesNotMatch(markup, /City |<img|\.png/);
  });
});

test("empty sections render no headings or placeholders", () => {
  const withCalendar = renderDailyContext(dailyContext({
    weather: {
      current: { temperature: 62, condition: { label: "Clear" } },
      today: { high: 70, low: 52 }
    },
    calendar: [{
      id: "conference",
      title: "Conference",
      startsAt: "2026-08-27",
      allDay: true,
      state: "active"
    }]
  })).markup;
  const noCalendar = renderDailyContext(dailyContext({
    weather: {
      current: { temperature: 62, condition: { label: "Clear" } },
      today: { high: 70, low: 52 }
    }
  })).markup;

  assert.match(withCalendar, /Conference/);
  assert.match(withCalendar, /All day/);
  assert.doesNotMatch(noCalendar, /hero-daily-calendar/);
  assert.doesNotMatch(withCalendar, />\s*(WEATHER|SPORTS|CALENDAR)\s*</i);
});

test("greeting-only context uses the simple spacious state", () => {
  const { markup } = renderDailyContext(dailyContext());

  assert.match(markup, /is-greeting-only/);
  assert.match(markup, /Good Morning Bryan/);
  assert.match(markup, /hero-daily-rule/);
  assert.match(markup, /hero-daily-content" aria-hidden="true">\s*<\/div>/);
  assert.doesNotMatch(markup, /No events|Nothing scheduled|Weather/);
});

test("capacity policy deterministically caps sports and preserves calendar", () => {
  const sports = ["A", "B", "C"].map((name, index) => ({
    id: `MLB:${name}`,
    state: "upcoming",
    favoriteTeam: { shortName: name },
    opponent: "Opponent",
    startsAt: new Date(2026, 7, 27, 13 + index).toISOString()
  }));
  const calendar = ["One", "Two", "Three", "Four"].map((title, index) => ({
    id: title,
    title,
    startsAt: new Date(2026, 7, 27, 17 + index).toISOString(),
    allDay: false,
    state: "upcoming"
  }));
  const { hero } = renderDailyContext(dailyContext({ sports, calendar }));
  const composition = hero.createDailyComposition(dailyContext({ sports, calendar }));

  assert.deepEqual(
    JSON.parse(JSON.stringify(composition.sports.map((item) => item.id))),
    ["MLB:A", "MLB:B"]
  );
  assert.deepEqual(
    JSON.parse(JSON.stringify(composition.calendar.map((item) => item.id))),
    ["One", "Two", "Three", "Four"]
  );
});

test("normalized alert coexists with sports and calendar while empty alerts render nothing", () => {
  const alertMarkup = renderDailyContext(dailyContext({
    alerts: [{
      id: "alert:1",
      headline: "Wind advisory",
      summary: "Until 11:00 AM"
    }],
    sports: [{
      id: "MLB:SEA:game",
      state: "upcoming",
      favoriteTeam: { shortName: "Mariners" },
      opponent: "Boston",
      startsAt: new Date(2026, 7, 27, 13, 10).toISOString()
    }],
    calendar: [{
      id: "dentist",
      title: "Dentist",
      startsAt: new Date(2026, 7, 27, 15, 30).toISOString(),
      allDay: false,
      state: "upcoming"
    }]
  })).markup;
  const emptyMarkup = renderDailyContext(dailyContext()).markup;

  assert.match(alertMarkup, /Wind advisory/);
  assert.match(alertMarkup, /Until 11:00 AM/);
  assert.match(alertMarkup, /Mariners vs\. Boston/);
  assert.match(alertMarkup, /Dentist/);
  assert.match(alertMarkup, /hero-alert-glyph/);
  assert.match(alertMarkup, /hero-sports-glyph/);
  assert.match(alertMarkup, /hero-calendar-glyph/);
  assert.equal((alertMarkup.match(/hero-context-row/g) || []).length, 3);
  assert.ok(alertMarkup.indexOf("hero-daily-content") < alertMarkup.indexOf("hero-context-row"));
  assert.doesNotMatch(emptyMarkup, /hero-daily-alert/);
});

test("legacy resting candidate keeps headline, subtitle, rows, and safe escaping", () => {
  const MosaicHero = loadClass(
    "frontend/widgets/hero.js",
    "MosaicHero",
    { window: {} }
  );
  const hero = new MosaicHero(null);

  hero.state = {
    title: "Clear <evening>",
    subtitle: "72° & calm",
    payload: null
  };
  const markup = hero.renderRestingTemplate();

  assert.match(markup, /Clear &lt;evening&gt;/);
  assert.match(markup, /72° &amp; calm/);
  assert.doesNotMatch(markup, /hero-resting-daily/);
});

test("MosaicHero preserves Active Hero renderer delegation and summary hiding", () => {
  const contentRegion = { innerHTML: "", hidden: true, payload: null };
  const summaryRegion = { hidden: false };
  const element = {
    innerHTML: "",
    querySelector(selector) {
      if (selector === ".hero-active-content") return contentRegion;
      if (selector === ".hero-active-summary") return summaryRegion;
      return null;
    }
  };
  const renderer = { render: () => "<div>Gamecast</div>" };
  const MosaicHero = loadClass(
    "frontend/widgets/hero.js",
    "MosaicHero",
    {
      window: {
        mosaicActiveRendererRegistry: {
          getForPayload: () => renderer
        }
      }
    }
  );
  const hero = new MosaicHero(element);
  const payload = { type: "baseball-game" };

  hero.renderActiveHero({
    headline: "Live baseball",
    summary: "Game in progress",
    payload
  });

  assert.equal(contentRegion.payload, payload);
  assert.equal(contentRegion.innerHTML, "<div>Gamecast</div>");
  assert.equal(contentRegion.hidden, false);
  assert.equal(summaryRegion.hidden, true);
  assert.doesNotMatch(element.innerHTML, /hero-resting-daily|hero-daily-rule|hero-context-glyph/);
});

test("Hero typography uses canonical canvas geometry", () => {
  const widgetsCss = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/widgets/widgets.css"),
    "utf8"
  );
  const mainCss = fs.readFileSync(
    path.join(PROJECT_ROOT, "frontend/css/main.css"),
    "utf8"
  );

  assert.match(widgetsCss, /\.hero-resting \.hero-title\s*\{[^}]*69\.552px/s);
  assert.match(widgetsCss, /\.hero-resting-row\s*\{[^}]*32\.508px/s);
  assert.match(widgetsCss, /\.hero-resting-highlight-title\s*\{[^}]*30\.24px/s);
  assert.match(widgetsCss, /\.baseball-game-team-score\s*\{[^}]*87\.696px/s);
  assert.match(widgetsCss, /\.hero-container\s*\{[^}]*padding:\s*16px/s);
  assert.match(widgetsCss, /\.hero-resting-daily::before\s*\{[^}]*radial-gradient/s);
  assert.match(widgetsCss, /\.hero-resting-daily:not\(\.is-greeting-only\) \.hero-title\s*\{[^}]*58\.968px/s);
  assert.match(widgetsCss, /\.hero-resting-daily\.is-greeting-only \.hero-title\s*\{[^}]*83\.916px/s);
  assert.match(widgetsCss, /\.hero-daily-rule\s*\{[^}]*width:\s*560px[^}]*height:\s*4px[^}]*background:\s*var\(--color-accent\)[^}]*box-shadow:/s);
  assert.match(widgetsCss, /\.hero-daily-content\s*\{[^}]*width:\s*fit-content[^}]*max-width:\s*min\(56%, 620px\)[^}]*margin-left:\s*auto[^}]*text-align:\s*left/s);
  assert.match(widgetsCss, /\.hero-context-row\s*\{[^}]*grid-template-columns:\s*32px minmax\(0, 1fr\)/s);
  assert.match(widgetsCss, /\.hero-daily-sport\s*\{[^}]*28\.728px/s);
  assert.match(widgetsCss, /\.hero-context-glyph\s*\{[^}]*font-size:\s*21px/s);
  assert.match(mainCss, /grid-template-rows:\s*minmax\(260px, auto\)\s*minmax\(260px, 1\.2fr\)\s*minmax\(240px, 1fr\)/s);
  assert.doesNotMatch(mainCss, /@media\s*\(max-height:/s);
});
