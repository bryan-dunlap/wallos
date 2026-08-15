const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  CalendarFeedCache
} = require("../../backend/calendar/calendar-feed-cache");
const {
  IcalCalendarProvider
} = require("../../backend/calendar/ical-calendar-provider");

const fixturePath = path.join(
  __dirname,
  "..",
  "fixtures",
  "calendar"
);
const range = {
  start: new Date("2026-08-14T00:00:00-07:00"),
  end: new Date("2026-08-17T00:00:00-07:00")
};

function readFixture(name) {
  return fs.readFileSync(path.join(fixturePath, name), "utf8");
}

function createSource(overrides = {}) {
  return {
    id: "work",
    name: "Work",
    enabled: true,
    url: "https://calendar.test/feed.ics",
    ...overrides
  };
}

function createFetch(content) {
  return async () => new Response(content, {
    status: 200,
    headers: {
      "content-type": "text/calendar",
      etag: '"fixture"'
    }
  });
}

test("normalizes timed events and excludes cancelled events", async () => {
  const provider = new IcalCalendarProvider({
    fetchImpl: createFetch(readFixture("timed-events.ics"))
  });
  const events = await provider.getEvents({
    ...range,
    sources: [createSource()]
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Operations Review");
  assert.equal(events[0].allDay, false);
  assert.equal(events[0].location, "Conference Room");
  assert.equal(events[0].calendar.id, "work");
  assert.equal(events[0].calendar.name, "Work");
  assert.equal(events[0].provider.id, "ical");
  assert.ok(events[0].startTime instanceof Date);
});

test("normalizes all-day events", async () => {
  const provider = new IcalCalendarProvider({
    fetchImpl: createFetch(readFixture("all-day-events.ics"))
  });
  const events = await provider.getEvents({
    ...range,
    sources: [createSource({ id: "birthdays", name: "Birthdays" })]
  });

  assert.equal(events.length, 1);
  assert.equal(events[0].title, "Birthday");
  assert.equal(events[0].allDay, true);
  assert.equal(events[0].calendar.id, "birthdays");
});

test("expands recurring events within the requested range", async () => {
  const provider = new IcalCalendarProvider({
    fetchImpl: createFetch(readFixture("recurring-events.ics"))
  });
  const events = await provider.getEvents({
    ...range,
    sources: [createSource()]
  });

  assert.equal(events.length, 3);
  assert.deepEqual(
    events.map((event) => event.title),
    ["Daily Standup", "Daily Standup", "Daily Standup"]
  );
  assert.equal(new Set(events.map((event) => event.id)).size, 3);
});

test("does not fetch disabled sources", async () => {
  let requests = 0;
  const provider = new IcalCalendarProvider({
    fetchImpl: async () => {
      requests += 1;
      throw new Error("unexpected request");
    }
  });
  const events = await provider.getEvents({
    ...range,
    sources: [createSource({ enabled: false })]
  });

  assert.deepEqual(events, []);
  assert.equal(requests, 0);
});

test("uses stale cached content after a fetch failure", async () => {
  let now = 0;
  let requests = 0;
  const cache = new CalendarFeedCache({
    ttlMs: 100,
    now: () => now
  });
  const provider = new IcalCalendarProvider({
    cache,
    fetchImpl: async () => {
      requests += 1;

      if (requests === 1) {
        return new Response(readFixture("timed-events.ics"));
      }

      throw new Error("temporary failure");
    }
  });
  const options = { ...range, sources: [createSource()] };
  const firstEvents = await provider.getEvents(options);

  now = 101;

  const staleEvents = await provider.getEvents(options);

  assert.equal(firstEvents.length, 1);
  assert.equal(staleEvents.length, 1);
  assert.equal(staleEvents[0].title, "Operations Review");
});

test("does not replace a valid cache entry with malformed ICS", async () => {
  let now = 0;
  let requests = 0;
  const cache = new CalendarFeedCache({
    ttlMs: 100,
    now: () => now
  });
  const provider = new IcalCalendarProvider({
    cache,
    fetchImpl: async () => {
      requests += 1;

      return new Response(
        requests === 1
          ? readFixture("timed-events.ics")
          : "not an ics feed"
      );
    }
  });
  const options = { ...range, sources: [createSource()] };

  await provider.getEvents(options);
  now = 101;

  const events = await provider.getEvents(options);

  assert.equal(events.length, 1);
  assert.match(cache.get("work").content, /Operations Review/);
});

test("fails safely when no source or cache is available", async () => {
  const provider = new IcalCalendarProvider({
    fetchImpl: async () => {
      throw new Error("offline");
    }
  });

  await assert.rejects(
    provider.getEvents({ ...range, sources: [createSource()] }),
    /Calendar sources are unavailable/
  );
});
