const test = require("node:test");
const assert = require("node:assert/strict");
const {
  ScoreEventDetector,
  createDetailedGamecastSnapshot
} = require(
  "../../frontend/sports/gamecast/score-event-detector"
);

function snapshot(overrides = {}) {
  return createDetailedGamecastSnapshot({
    gameId: "123456",
    sport: "baseball",
    league: "MLB",
    score: { away: 2, home: 5 },
    teams: {
      away: { id: "BOS" },
      home: { id: "SEA" }
    },
    sourceRevision: "revision-1",
    ...overrides
  });
}

function detectorHarness() {
  const emitted = [];
  const detector = new ScoreEventDetector({
    now: () => new Date("2026-09-06T20:00:00.000Z"),
    onEvent: (event) => emitted.push(event)
  });

  return { detector, emitted };
}

test("first non-zero snapshot establishes a baseline without emitting", () => {
  const { detector, emitted } = detectorHarness();

  assert.deepEqual(detector.accept(snapshot()), []);
  assert.deepEqual(emitted, []);
  assert.equal(detector.activeGameId, "MLB:123456");
});

test("duplicate score and duplicate provider revision emit nothing", () => {
  const { detector } = detectorHarness();
  detector.accept(snapshot());

  assert.deepEqual(detector.accept(snapshot()), []);
  assert.deepEqual(detector.accept(snapshot({
    score: { away: 3, home: 5 }
  })), []);
});

test("positive away transition emits one qualified MLB run", () => {
  const { detector, emitted } = detectorHarness();
  detector.accept(snapshot());
  const [event] = detector.accept(snapshot({
    score: { away: 3, home: 5 },
    sourceRevision: "revision-2"
  }));

  assert.equal(emitted.length, 1);
  assert.equal(event.gameId, "MLB:123456");
  assert.equal(event.scoringTeamId, "MLB:BOS");
  assert.equal(event.scoringSide, "away");
  assert.equal(event.eventType, "run");
  assert.equal(event.points, 1);
  assert.equal(event.intensity, "score");
});

test("positive home transition emits one event", () => {
  const { detector } = detectorHarness();
  detector.accept(snapshot());
  const [event] = detector.accept(snapshot({
    score: { away: 2, home: 6 },
    sourceRevision: "revision-2"
  }));

  assert.equal(event.scoringTeamId, "MLB:SEA");
  assert.equal(event.scoringSide, "home");
});

test("both positive transitions emit deterministically away then home", () => {
  const { detector } = detectorHarness();
  detector.accept(snapshot());
  const events = detector.accept(snapshot({
    score: { away: 3, home: 7 },
    sourceRevision: "revision-2"
  }));

  assert.deepEqual(events.map((event) => event.scoringSide), ["away", "home"]);
  assert.deepEqual(events.map((event) => event.points), [1, 2]);
});

test("multi-point jump is one observed transition", () => {
  const { detector } = detectorHarness();
  detector.accept(snapshot());
  const events = detector.accept(snapshot({
    score: { away: 2, home: 9 },
    sourceRevision: "revision-2"
  }));

  assert.equal(events.length, 1);
  assert.equal(events[0].points, 4);
});

test("negative correction emits nothing and safely advances baseline", () => {
  const { detector } = detectorHarness();
  detector.accept(snapshot());
  assert.deepEqual(detector.accept(snapshot({
    score: { away: 2, home: 4 },
    sourceRevision: "revision-2"
  })), []);

  const [event] = detector.accept(snapshot({
    score: { away: 2, home: 5 },
    sourceRevision: "revision-3"
  }));
  assert.equal(event.points, 1);
  assert.deepEqual(event.previousScore, { away: 2, home: 4 });
});

test("stale snapshot neither emits nor advances baseline", () => {
  const { detector } = detectorHarness();
  detector.accept(snapshot());
  assert.deepEqual(detector.accept(snapshot({
    score: { away: 2, home: 7 },
    stale: true,
    sourceRevision: "stale-revision"
  })), []);

  const [event] = detector.accept(snapshot({
    score: { away: 2, home: 6 },
    sourceRevision: "revision-2"
  }));
  assert.equal(event.points, 1);
  assert.deepEqual(event.previousScore, { away: 2, home: 5 });
});

test("reset and disarm make the next snapshot a new baseline", () => {
  for (const method of ["reset", "disarm"]) {
    const { detector } = detectorHarness();
    detector.accept(snapshot());
    detector[method]();
    assert.deepEqual(detector.accept(snapshot({
      score: { away: 3, home: 5 },
      sourceRevision: "revision-2"
    })), []);
  }
});

test("game identity change automatically establishes a new baseline", () => {
  const { detector } = detectorHarness();
  detector.accept(snapshot());

  assert.deepEqual(detector.accept(snapshot({
    gameId: "654321",
    score: { away: 9, home: 8 },
    sourceRevision: "other-game"
  })), []);
  assert.equal(detector.activeGameId, "MLB:654321");
});

test("event IDs are deterministic and timestamps retain distinct meanings", () => {
  const transition = () => {
    const { detector } = detectorHarness();
    detector.accept(snapshot());
    return detector.accept(snapshot({
      score: { away: 3, home: 5 },
      sourceRevision: "revision-2"
    }))[0];
  };
  const first = transition();
  const second = transition();

  assert.equal(first.id, second.id);
  assert.equal(first.occurredAt, null);
  assert.equal(first.observedAt, "2026-09-06T20:00:00.000Z");
  assert.equal(first.sourceRevision, "revision-2");
  assert.deepEqual(first.previousScore, { away: 2, home: 5 });
  assert.deepEqual(first.currentScore, { away: 3, home: 5 });
});

test("NFL snapshots retain qualified identity and conservative classification", () => {
  const { detector } = detectorHarness();
  const nflSnapshot = (score, revision, providerEvent = null) =>
    createDetailedGamecastSnapshot({
      gameId: "401772831",
      sport: "football",
      league: "NFL",
      score,
      teams: {
        away: { id: "NFL:SEA" },
        home: { id: "NFL:SF" }
      },
      sourceRevision: revision,
      providerEvent
    });

  detector.accept(nflSnapshot({ away: 24, home: 23 }, "revision-1"));
  const [event] = detector.accept(nflSnapshot(
    { away: 30, home: 23 },
    "revision-2",
    { id: "play-10", period: 4, gameClock: "1:12" }
  ));

  assert.equal(event.gameId, "NFL:401772831");
  assert.equal(event.scoringTeamId, "NFL:SEA");
  assert.equal(event.eventType, "score");
  assert.equal(event.points, 6);
  assert.equal(event.providerEventId, "play-10");
  assert.equal(event.period, 4);
  assert.equal(event.gameClock, "1:12");
  assert.equal(event.occurredAt, null);
});

test("invalid snapshots do not establish or alter detector state", () => {
  const { detector } = detectorHarness();
  assert.deepEqual(detector.accept({ schemaVersion: 1 }), []);
  assert.equal(detector.activeGameId, null);
});
