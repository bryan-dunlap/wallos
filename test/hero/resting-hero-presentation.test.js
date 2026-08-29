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
  assert.match(mainCss, /grid-template-rows:\s*minmax\(260px, auto\)\s*minmax\(260px, 1\.2fr\)\s*minmax\(240px, 1fr\)/s);
  assert.doesNotMatch(mainCss, /@media\s*\(max-height:/s);
});
