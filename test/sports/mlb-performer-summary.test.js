const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MlbGameDetailCache,
  MlbGameIdResolver
} = require("../../backend/sports/mlb-game-detail-cache");
const {
  createMlbFeaturedPerformers,
  normalizeBatters,
  normalizePitchers,
  selectTopBatter,
  selectTopPitcher
} = require("../../backend/sports/mlb-performer-summary");

function player(id, name, batting, pitching) {
  return { person: { id, fullName: name }, stats: { batting, pitching } };
}

function feed() {
  return { liveData: { boxscore: { teams: {
    away: { team: { teamName: "Mariners" }, players: {
      ID1: player(1, "Current Batter", { atBats: 4, hits: 1, runs: 0, doubles: 0, triples: 0, homeRuns: 0, rbi: 0, baseOnBalls: 0 }),
      ID2: player(2, "Top Batter", { atBats: 4, hits: 2, runs: 2, doubles: 1, triples: 0, homeRuns: 1, rbi: 3, baseOnBalls: 1 }),
      ID3: player(3, "Top Pitcher", null, { inningsPitched: "6.0", earnedRuns: 2, strikeOuts: 7, hits: 5, baseOnBalls: 1 }),
      ID4: player(4, "Current Pitcher", null, { inningsPitched: "1.0", earnedRuns: 0, strikeOuts: 1, hits: 0, baseOnBalls: 0 })
    } },
    home: { team: { teamName: "Angels" }, players: {
      ID5: player(5, "Home Batter", { atBats: 3, hits: 2, runs: 1, doubles: 0, triples: 0, homeRuns: 0, rbi: 1, baseOnBalls: 0 }),
      ID6: player(6, "Home Pitcher", null, { inningsPitched: "5.1", earnedRuns: 4, strikeOuts: 5, hits: 7, baseOnBalls: 2 })
    } }
  } } } };
}

test("normalizes team-associated batting and pitching lines without raw leakage", () => {
  const summary = createMlbFeaturedPerformers(feed(), "123");
  assert.equal(summary.teams.away.entries[0].name, "Top Batter");
  assert.equal(summary.teams.away.entries[1].name, "Top Pitcher");
  assert.match(summary.teams.away.entries[0].summary, /2–4 · HR · 2B · 3 RBI/);
  assert.equal(summary.teams.home.association, "home");
  assert.equal("liveData" in summary, false);
  assert.equal(JSON.stringify(summary).includes("Current Batter"), false);
});

test("top batter ranking is deterministic and current status has no privilege", () => {
  const players = normalizeBatters(feed().liveData.boxscore.teams.away.players, "away");
  assert.equal(selectTopBatter(players).name, "Top Batter");
  const tied = [
    { id: 2, name: "Zulu", rbi: 1 },
    { id: 1, name: "Alpha", rbi: 1 }
  ];
  assert.equal(selectTopBatter(tied).name, "Alpha");
});

test("top pitcher favors innings, then run prevention and strikeouts deterministically", () => {
  const players = normalizePitchers(feed().liveData.boxscore.teams.away.players, "away");
  assert.equal(selectTopPitcher(players).name, "Top Pitcher");
  assert.equal(selectTopPitcher([
    { id: 2, name: "Zulu", inningsPitched: "2.0", earnedRuns: 0, strikeouts: 3 },
    { id: 1, name: "Alpha", inningsPitched: "2.0", earnedRuns: 0, strikeouts: 3 }
  ]).name, "Alpha");
});

test("shared detail cache supports live/final reuse, in-flight dedupe, and stale fallback", async () => {
  let requests = 0;
  let resolveFetch;
  const cache = new MlbGameDetailCache({
    fetch: () => {
      requests += 1;
      return new Promise((resolve) => { resolveFetch = () => resolve({ ok: true, json: async () => feed() }); });
    },
    now: () => 100
  });
  const first = cache.acquire("123", { status: "live" });
  const second = cache.acquire("123", { status: "live" });
  resolveFetch();
  assert.deepEqual(await first, await second);
  assert.equal(requests, 1);
  let finalRequests = 0;
  const finalCache = new MlbGameDetailCache({
    fetch: async () => {
      finalRequests += 1;
      return { ok: true, json: async () => feed() };
    },
    now: () => 100
  });
  assert.equal((await finalCache.acquire("123", { status: "final" })).cached, false);
  assert.equal((await finalCache.acquire("123", { status: "final" })).cached, true);
  assert.equal(finalRequests, 1);

  const staleCache = new MlbGameDetailCache({
    fetch: async () => ({ ok: false, status: 500 }),
    now: () => 10000,
    liveTtlMs: 1,
    cache: new Map([["123", { data: feed(), timestamp: 0 }]])
  });
  assert.equal((await staleCache.acquire("123", { status: "live" })).stale, true);
});

test("StatsAPI game IDs resolve once per date from authoritative team association", async () => {
  let requests = 0;
  const resolver = new MlbGameIdResolver({
    fetch: async () => {
      requests += 1;
      return { ok: true, json: async () => ({ dates: [{ games: [{
        gamePk: 777,
        teams: { away: { team: { id: 136 } }, home: { team: { id: 108 } } }
      }] }] }) };
    },
    now: () => 100
  });
  const input = { date: "2026-09-26", awayTeamId: 136, homeTeamId: 108 };
  assert.equal(await resolver.resolve(input), "777");
  assert.equal(await resolver.resolve(input), "777");
  assert.equal(requests, 1);
});

test("StatsAPI game ID resolution rejects ambiguous doubleheaders", async () => {
  const resolver = new MlbGameIdResolver({
    fetch: async () => ({ ok: true, json: async () => ({ dates: [{ games: [
      { gamePk: 777, teams: { away: { team: { id: 136 } }, home: { team: { id: 108 } } } },
      { gamePk: 778, teams: { away: { team: { id: 136 } }, home: { team: { id: 108 } } } }
    ] }] }) })
  });

  assert.equal(await resolver.resolve({
    date: "2026-09-26", awayTeamId: 136, homeTeamId: 108
  }), null);
});

test("missing player detail yields empty team entries without harming the base event", () => {
  const summary = createMlbFeaturedPerformers({ liveData: { boxscore: { teams: {} } } }, "123");
  assert.deepEqual(summary.teams.away.entries, []);
  assert.deepEqual(summary.teams.home.entries, []);
});
