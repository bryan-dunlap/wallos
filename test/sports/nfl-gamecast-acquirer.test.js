const test = require("node:test");
const assert = require("node:assert/strict");
const liveScoreboard = require(
  "../fixtures/sports/espn-nfl-gamecast-live-scoreboard.json"
);
const liveSummary = require(
  "../fixtures/sports/espn-nfl-gamecast-live-summary.json"
);
const finalSummary = require(
  "../fixtures/sports/espn-nfl-gamecast-final-summary.json"
);
const {
  acquireNflGamecast,
  deriveFirstDownYardLine,
  normalizeNflGamecast,
  toCanonicalFieldCoordinate
} = require("../../backend/sports/nfl-gamecast-acquirer");

function clone(value) {
  return structuredClone(value);
}

function liveEvent() {
  return clone(liveScoreboard.events[0]);
}

function normalizedLive(scoreboard = liveEvent(), summary = clone(liveSummary)) {
  return normalizeNflGamecast(scoreboard, summary);
}

test("normalizes NFL Hero Gamecast teams, score, and live game state", () => {
  const gamecast = normalizedLive();

  assert.equal(gamecast.status, "live");
  assert.equal(gamecast.eventId, "401772831");
  assert.deepEqual(gamecast.teams.away, {
    id: "NFL:SEA",
    providerId: "26",
    abbreviation: "SEA",
    name: "Seattle Seahawks",
    shortName: "Seahawks",
    logo: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png"
  });
  assert.equal(gamecast.teams.home.id, "NFL:SF");
  assert.equal(gamecast.teams.home.providerId, "25");
  assert.deepEqual(gamecast.score, { away: 24, home: 23 });
  assert.deepEqual(gamecast.gameState, {
    quarter: 4,
    clock: "2:48",
    phase: "regulation"
  });
});

test("matches possession by ESPN provider team identity", () => {
  const gamecast = normalizedLive();

  assert.deepEqual(gamecast.possession, {
    team: "away",
    providerTeamId: "26"
  });

  const event = liveEvent();
  event.competitions[0].situation.possession = "25";
  assert.equal(normalizedLive(event).possession.team, "home");

  event.competitions[0].situation.possession = "999";
  assert.equal(normalizedLive(event).possession.team, null);
});

test("normalizes down, distance, field position, and red-zone state", () => {
  const situation = normalizedLive().situation;

  assert.deepEqual(situation, {
    down: 3,
    distance: 4,
    shortText: "3rd & 4",
    fieldPositionText: "SEA 38",
    yardLine: 38,
    yardsToEndzone: 62,
    firstDownYardLine: 42,
    redZone: false
  });
});

test("converts ESPN field coordinates for both teams and territories", () => {
  const cases = [
    {
      label: "away possession in own territory",
      providerId: "26",
      espnYardLine: 75,
      expectedBall: 25,
      expectedFirstDown: 35
    },
    {
      label: "away possession in opponent territory",
      providerId: "26",
      espnYardLine: 25,
      expectedBall: 75,
      expectedFirstDown: 85
    },
    {
      label: "home possession in own territory",
      providerId: "25",
      espnYardLine: 25,
      expectedBall: 75,
      expectedFirstDown: 65
    },
    {
      label: "home possession in opponent territory",
      providerId: "25",
      espnYardLine: 75,
      expectedBall: 25,
      expectedFirstDown: 15
    }
  ];

  for (const scenario of cases) {
    const event = liveEvent();
    const situation = event.competitions[0].situation;
    situation.possession = scenario.providerId;
    situation.yardLine = scenario.espnYardLine;
    situation.distance = 10;
    const normalized = normalizedLive(event).situation;

    assert.equal(normalized.yardLine, scenario.expectedBall, scenario.label);
    assert.equal(
      normalized.firstDownYardLine,
      scenario.expectedFirstDown,
      scenario.label
    );
  }
});

test("derives and clamps first-down markers for goal-to-go situations", () => {
  assert.equal(toCanonicalFieldCoordinate(-10), 100);
  assert.equal(toCanonicalFieldCoordinate(120), 0);
  assert.equal(deriveFirstDownYardLine(95, 10, "away"), 100);
  assert.equal(deriveFirstDownYardLine(5, 10, "home"), 0);

  const event = liveEvent();
  const situation = event.competitions[0].situation;
  situation.possession = "26";
  situation.yardLine = 5;
  situation.distance = 10;
  situation.isRedZone = true;
  situation.downDistanceText = "1st & Goal at SF 5";
  situation.shortDownDistanceText = "1st & Goal";
  situation.possessionText = "SF 5";
  const normalized = normalizedLive(event).situation;

  assert.equal(normalized.yardLine, 95);
  assert.equal(normalized.firstDownYardLine, 100);
  assert.equal(normalized.redZone, true);
  assert.equal(normalized.shortText, "1st & Goal");
});

test("normalizes current drive totals, elapsed time, and field endpoints", () => {
  assert.deepEqual(normalizedLive().drive, {
    team: "away",
    plays: 8,
    yards: 62,
    elapsed: "4:17",
    result: null,
    start: {
      yardLine: 20,
      yardsToEndzone: null,
      fieldPositionText: "SEA 20",
      down: null,
      distance: null
    },
    end: {
      yardLine: 38,
      yardsToEndzone: null,
      fieldPositionText: "SEA 38",
      down: null,
      distance: null
    }
  });
});

test("prefers scoreboard last play over current-drive enrichment", () => {
  const lastPlay = normalizedLive().lastPlay;

  assert.equal(
    lastPlay.description,
    "G.Smith pass complete to D.Metcalf for 12 yards."
  );
  assert.equal(lastPlay.type, "Pass Reception");
  assert.equal(lastPlay.quarter, 4);
  assert.equal(lastPlay.clock, "2:48");
  assert.equal(lastPlay.start.yardLine, 26);
  assert.equal(lastPlay.end.yardLine, 38);
});

test("falls back to latest drive play when scoreboard last play is absent", () => {
  const event = liveEvent();
  delete event.competitions[0].situation.lastPlay;
  const summary = clone(liveSummary);
  summary.drives.current.plays[1].text = "Summary fallback play.";

  assert.equal(
    normalizedLive(event, summary).lastPlay.description,
    "Summary fallback play."
  );
});

test("retains regulation quarter scoring without inventing overtime", () => {
  assert.deepEqual(normalizedLive().lineScore, {
    periods: [1, 2, 3, 4],
    away: [7, 3, 7, 7],
    home: [3, 7, 6, 7],
    overtime: { away: null, home: null }
  });
});

test("final state falls back to the latest previous drive and keeps overtime", () => {
  const gamecast = normalizeNflGamecast(null, clone(finalSummary));

  assert.equal(gamecast.status, "final");
  assert.deepEqual(gamecast.score, { away: 30, home: 27 });
  assert.deepEqual(gamecast.gameState, {
    quarter: 5,
    clock: "0:00",
    phase: "final"
  });
  assert.equal(gamecast.drive.team, "away");
  assert.equal(gamecast.drive.plays, 5);
  assert.equal(gamecast.drive.yards, 75);
  assert.equal(gamecast.drive.elapsed, "2:01");
  assert.equal(gamecast.drive.result, "TOUCHDOWN");
  assert.equal(
    gamecast.lastPlay.description,
    "G.Smith pass complete for a 20-yard touchdown."
  );
  assert.deepEqual(gamecast.lineScore, {
    periods: [1, 2, 3, 4, 5],
    away: [7, 3, 7, 7, 6],
    home: [3, 7, 7, 10, 0],
    overtime: { away: 6, home: 0 }
  });
});

test("uses the last previous drive during live drive transitions", () => {
  const event = liveEvent();
  delete event.competitions[0].situation;
  const summary = clone(liveSummary);
  summary.drives.previous = [summary.drives.current];
  delete summary.drives.current;
  const gamecast = normalizedLive(event, summary);

  assert.equal(gamecast.drive.plays, 8);
  assert.equal(gamecast.drive.team, "away");
  assert.equal(gamecast.possession.team, "away");
  assert.equal(gamecast.lastPlay.clock, "2:48");
});

test("preserves nulls for missing optional Gamecast fields", () => {
  const event = liveEvent();
  delete event.competitions[0].situation;
  const gamecast = normalizedLive(event, { drives: { previous: [] } });

  assert.deepEqual(gamecast.possession, {
    team: null,
    providerTeamId: null
  });
  assert.deepEqual(gamecast.situation, {
    down: null,
    distance: null,
    shortText: null,
    fieldPositionText: null,
    yardLine: null,
    yardsToEndzone: null,
    firstDownYardLine: null,
    redZone: null
  });
  assert.equal(gamecast.drive, null);
  assert.equal(gamecast.lastPlay, null);
});

test("acquires scoreboard and summary through the shared ESPN client", async () => {
  const requests = [];
  const fetchImpl = async (url) => {
    requests.push(url);
    const payload = url.includes("/summary?")
      ? liveSummary
      : liveScoreboard;

    return {
      ok: true,
      status: 200,
      json: async () => clone(payload)
    };
  };
  const gamecast = await acquireNflGamecast(
    "2025-09-07",
    "401772831",
    { fetchImpl }
  );

  assert.equal(gamecast.eventId, "401772831");
  assert.equal(requests.length, 2);
  assert.ok(requests.some((url) =>
    url.endsWith("/scoreboard?dates=20250907")
  ));
  assert.ok(requests.some((url) =>
    url.endsWith("/summary?event=401772831")
  ));
});

test("acquisition rejects an event absent from the requested scoreboard", async () => {
  const fetchImpl = async (url) => ({
    ok: true,
    status: 200,
    json: async () => url.includes("/summary?")
      ? clone(liveSummary)
      : { events: [] }
  });

  await assert.rejects(
    acquireNflGamecast("2025-09-07", "missing", { fetchImpl }),
    /NFL Gamecast event missing was not found/
  );
});
