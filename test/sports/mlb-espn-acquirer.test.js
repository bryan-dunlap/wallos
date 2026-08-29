const test = require("node:test");
const assert = require("node:assert/strict");
const espnScoreboardFixture = require(
  "../fixtures/sports/espn-mlb-scoreboard.json"
);
const {
  acquireMlbDailySchedule,
  MLB_LIVE_CACHE_MS,
  MLB_SCHEDULED_CACHE_MS
} = require("../../backend/sports/mlb-espn-acquirer");
const {
  MlbSportsEventAdapter
} = require("../../frontend/sports/mlb-sports-event-adapter");
const {
  MlbSportsWidgetRenderer
} = require("../../frontend/sports/mlb-sports-widget-renderer");

function createFetch(payload, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    json: async () => payload
  });
}

function fixtureWithEvents(...indexes) {
  return {
    events: indexes.map((index) =>
      structuredClone(espnScoreboardFixture.events[index])
    )
  };
}

function fixtureEventWithTeams(eventId, awayTeam, homeTeam) {
  const event = structuredClone(espnScoreboardFixture.events[0]);
  event.id = eventId;

  for (const competitor of event.competitions[0].competitors) {
    const source = competitor.homeAway === "away" ? awayTeam : homeTeam;
    competitor.team = {
      ...competitor.team,
      ...source
    };
  }

  return event;
}

test("normalizes scheduled ESPN MLB data into the existing contract", async () => {
  const cache = new Map();
  let requestUrl = null;
  const result = await acquireMlbDailySchedule("2026-08-27", {
    cache,
    timeZone: "America/Los_Angeles",
    fetchImpl: async (url) => {
      requestUrl = url;
      return createFetch(fixtureWithEvents(0))();
    },
    now: () => Date.parse("2026-08-27T12:00:00Z")
  });
  const [game] = result.sportsEvents;

  assert.match(requestUrl, /scoreboard\?dates=20260827$/);
  assert.equal(result.sport, "MLB");
  assert.equal(game.eventId, "401000001");
  assert.equal(game.status.state, "Preview");
  assert.equal(game.status.detail, "1:10 PM PDT");
  assert.equal(game.scheduledTime, "1:10 PM");
  assert.equal(game.awayTeam.abbreviation, "SEA");
  assert.equal(game.awayTeam.name, "Seattle Mariners");
  assert.equal(game.awayTeam.shortName, "Mariners");
  assert.equal(game.awayTeam.logo, "https://a.espncdn.com/i/teamlogos/mlb/500/scoreboard/sea.png");
  assert.deepEqual(game.awayTeam.record, {
    wins: 70,
    losses: 58,
    ties: 0
  });
  assert.equal(game.awayTeam.score, null);
  assert.equal(game.awayTeam.runs, null);
  assert.equal(game.linescore, null);
  assert.equal(cache.get(result.date).ttl, MLB_SCHEDULED_CACHE_MS);
});

test("normalizes complete ESPN MLB display names without nickname truncation", async () => {
  const result = await acquireMlbDailySchedule("2026-08-27", {
    cache: new Map(),
    fetchImpl: createFetch({
      events: [
        fixtureEventWithTeams(
          "complete-names-1",
          {
            id: "2",
            abbreviation: "BOS",
            displayName: "Boston Red Sox",
            shortDisplayName: "Red Sox"
          },
          {
            id: "4",
            abbreviation: "CHW",
            displayName: "Chicago White Sox",
            shortDisplayName: "White Sox"
          }
        ),
        fixtureEventWithTeams(
          "complete-names-2",
          {
            id: "14",
            abbreviation: "TOR",
            displayName: "Toronto Blue Jays",
            shortDisplayName: "Blue Jays"
          },
          {
            id: "12",
            abbreviation: "SEA",
            displayName: "Seattle Mariners",
            shortDisplayName: "Mariners"
          }
        )
      ]
    })
  });
  const names = result.sportsEvents.flatMap(
    (game) => [game.awayTeam.name, game.homeTeam.name]
  );
  const compactNames = result.sportsEvents.flatMap((game) => {
    const event = new MlbSportsEventAdapter().adaptGame(game);
    return [event.participants.away.name, event.participants.home.name];
  });

  assert.deepEqual(new Set(names), new Set([
    "Boston Red Sox",
    "Chicago White Sox",
    "Toronto Blue Jays",
    "Seattle Mariners"
  ]));
  assert.deepEqual(new Set(compactNames), new Set([
    "Red Sox",
    "White Sox",
    "Blue Jays",
    "Mariners"
  ]));
  assert.ok(compactNames.every((name) => ![
    "Boston",
    "Chicago",
    "Toronto",
    "Seattle"
  ].some((location) => name.includes(location))));
});

test("preserves MLB identity while retaining ESPN IDs separately", async () => {
  const result = await acquireMlbDailySchedule("2026-08-27", {
    cache: new Map(),
    fetchImpl: createFetch(fixtureWithEvents(0))
  });
  const [game] = result.sportsEvents;

  assert.equal(game.awayTeam.id, 136);
  assert.equal(game.awayTeam.providerId, 136);
  assert.equal(game.awayTeam.espnProviderId, "12");
  assert.notEqual(game.awayTeam.providerId, game.awayTeam.espnProviderId);
});

test("normalizes live ESPN MLB score, R/H/E, inning, and linescore", async () => {
  const cache = new Map();
  const result = await acquireMlbDailySchedule("2026-08-27", {
    cache,
    fetchImpl: createFetch(fixtureWithEvents(1))
  });
  const [game] = result.sportsEvents;

  assert.equal(game.status.state, "Live");
  assert.equal(game.status.detail, "Bottom 7th");
  assert.equal(game.awayTeam.runs, 3);
  assert.equal(game.homeTeam.runs, 2);
  assert.equal(game.awayTeam.hits, 8);
  assert.equal(game.homeTeam.errors, 1);
  assert.deepEqual(game.linescore.inning, {
    number: 7,
    half: "Bottom"
  });
  assert.deepEqual(game.linescore.innings.at(-1), {
    number: 7,
    away: 2,
    home: 0
  });
  assert.equal(game.linescore.batter, null);
  assert.equal(game.linescore.pitcher, null);
  assert.equal(cache.get(result.date).ttl, MLB_LIVE_CACHE_MS);
});

test("normalizes final and postponed ESPN MLB states", async () => {
  const result = await acquireMlbDailySchedule("2026-08-27", {
    cache: new Map(),
    fetchImpl: createFetch(fixtureWithEvents(2, 3))
  });
  const [final, postponed] = result.sportsEvents;

  assert.equal(final.status.state, "Final");
  assert.equal(final.awayTeam.runs, 5);
  assert.equal(final.awayTeam.hits, 10);
  assert.equal(final.homeTeam.errors, 2);
  assert.equal(final.linescore.inning.number, 9);
  assert.equal(postponed.status.state, "Preview");
  assert.equal(postponed.status.detail, "Postponed");
  assert.equal(postponed.awayTeam.score, null);
});

test("existing MLB adapter and renderer accept ESPN-origin events unchanged", async () => {
  const result = await acquireMlbDailySchedule("2026-08-27", {
    cache: new Map(),
    fetchImpl: createFetch(fixtureWithEvents(1))
  });
  const event = new MlbSportsEventAdapter().adaptGame(
    result.sportsEvents[0]
  );
  const presentation = new MlbSportsWidgetRenderer().render(event);

  assert.equal(event.league, "MLB");
  assert.equal(event.status, "live");
  assert.deepEqual(event.scores, { away: 3, home: 2 });
  assert.equal(event.details.baseball.teamStats.away.hits, 8);
  assert.equal(presentation.status, "Bottom 7th");
  assert.match(presentation.content, /mlb-widget-scoreboard/);
  assert.match(presentation.content, /sports-scoreboard-heading">R/);
});

test("returns stale ESPN MLB data after a transient failure", async (t) => {
  t.mock.method(console, "error", () => {});
  const cache = new Map();
  let currentTime = Date.parse("2026-08-27T12:00:00Z");
  const initial = await acquireMlbDailySchedule("2026-08-27", {
    cache,
    fetchImpl: createFetch(fixtureWithEvents(0)),
    now: () => currentTime
  });

  currentTime += MLB_SCHEDULED_CACHE_MS + 1;
  const fallback = await acquireMlbDailySchedule("2026-08-27", {
    cache,
    fetchImpl: createFetch({}, 503),
    now: () => currentTime
  });

  assert.deepEqual(fallback.sportsEvents, initial.sportsEvents);
  assert.equal(fallback.stale, true);
});
