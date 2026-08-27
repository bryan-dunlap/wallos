const test = require("node:test");
const assert = require("node:assert/strict");
const {
  fetchScoreboard,
  fetchSummary,
  toNullableNumber
} = require("../../backend/sports/espn-client");

function createFetch(payload) {
  return async (url, options) => ({
    ok: true,
    status: 200,
    json: async () => ({ payload, url, options })
  });
}

test("shared ESPN client builds date-scoped scoreboard requests", async () => {
  const result = await fetchScoreboard({
    sport: "baseball",
    league: "mlb",
    date: "2026-08-27",
    fetchImpl: createFetch("scoreboard")
  });

  assert.match(
    result.url,
    /\/sports\/baseball\/mlb\/scoreboard\?dates=20260827$/
  );
  assert.equal(result.options.headers.accept, "application/json");
  assert.ok(result.options.signal instanceof AbortSignal);
});

test("shared ESPN client is ready for event summary requests", async () => {
  const result = await fetchSummary({
    sport: "baseball",
    league: "mlb",
    eventId: "401000002",
    fetchImpl: createFetch("summary")
  });

  assert.match(
    result.url,
    /\/sports\/baseball\/mlb\/summary\?event=401000002$/
  );
});

test("shared ESPN client rejects HTTP errors and normalizes numbers", async () => {
  await assert.rejects(
    fetchScoreboard({
      sport: "football",
      league: "nfl",
      date: "2026-09-13",
      fetchImpl: async () => ({ ok: false, status: 503 })
    }),
    /ESPN NFL scoreboard request failed: 503/
  );

  assert.equal(toNullableNumber("3"), 3);
  assert.equal(toNullableNumber(""), null);
  assert.equal(toNullableNumber("unknown"), null);
});
