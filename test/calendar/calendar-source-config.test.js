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
