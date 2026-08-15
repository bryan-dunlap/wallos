const assert = require("node:assert/strict");
const test = require("node:test");
const {
  normalizeCalendarSources,
  createPublicCalendarConfig
} = require("../../backend/calendar/calendar-source-config");

test("normalizes private iCalendar source configuration", () => {
  const sources = normalizeCalendarSources([
    {
      id: "personal",
      name: "Personal",
      enabled: true,
      url: "https://calendar.test/private.ics?token=secret"
    }
  ]);

  assert.equal(sources.length, 1);
  assert.match(sources[0].url, /token=secret/);
});

test("public Calendar configuration excludes source URLs", () => {
  const publicConfig = createPublicCalendarConfig({
    enabled: true,
    provider: "ical",
    sources: [{
      id: "personal",
      name: "Personal",
      enabled: true,
      url: "https://calendar.test/private.ics?token=secret"
    }]
  });

  assert.deepEqual(publicConfig, {
    enabled: true,
    provider: "ical",
    sources: [{
      id: "personal",
      name: "Personal",
      enabled: true
    }]
  });
  assert.equal(JSON.stringify(publicConfig).includes("secret"), false);
});

test("rejects invalid and duplicate Calendar sources", () => {
  const sources = normalizeCalendarSources([
    {
      id: "personal",
      name: "Personal",
      enabled: true,
      url: "not a URL"
    },
    {
      id: "work",
      name: "Work",
      enabled: true,
      url: "https://calendar.test/work.ics"
    },
    {
      id: "work",
      name: "Duplicate Work",
      enabled: true,
      url: "https://calendar.test/duplicate.ics"
    }
  ]);

  assert.deepEqual(sources, [{
    id: "work",
    name: "Work",
    enabled: true,
    url: "https://calendar.test/work.ics"
  }]);
});

test("accepts HTTPS and webcal URLs but rejects invalid protocols", () => {
  const sources = normalizeCalendarSources([
    {
      id: "https-source",
      name: "HTTPS",
      enabled: true,
      url: "https://calendar.test/feed.ics"
    },
    {
      id: "webcal-source",
      name: "Webcal",
      enabled: true,
      url: "webcal://calendar.test/private.ics?token=secret"
    },
    {
      id: "invalid-source",
      name: "Invalid",
      enabled: true,
      url: "ftp://calendar.test/feed.ics"
    }
  ]);

  assert.equal(sources.length, 2);
  assert.equal(sources[0].url, "https://calendar.test/feed.ics");
  assert.equal(
    sources[1].url,
    "webcal://calendar.test/private.ics?token=secret"
  );
});
