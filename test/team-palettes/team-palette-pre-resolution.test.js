const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  createNflDailyScheduleHandler,
  createNflGamecastHandler
} = require("../../backend/server");
const {
  enqueueAggregateSportsPalettes,
  enqueueFavoriteTeamPalettes,
  enqueueGamecastPalettes,
  enqueueSportsSchedulePalettes,
  enqueueTeamPaletteResolution,
  qualifyTeamPaletteId
} = require(
  "../../backend/team-palettes/team-palette-pre-resolution"
);

const ESPN_SEA = "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png";
const ESPN_SF = "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png";
const MLB_SEA = "https://www.mlbstatic.com/team-logos/136.svg";
const MLB_BOS = "https://www.mlbstatic.com/team-logos/111.svg";

function flush() {
  return new Promise((resolve) => setImmediate(resolve));
}

function createResponse() {
  return {
    statusCode: 200,
    body: null,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; }
  };
}

function validGamecast() {
  return {
    status: "live",
    eventId: "401772831",
    teams: {
      away: {
        id: "NFL:SEA",
        abbreviation: "SEA",
        logo: ESPN_SEA
      },
      home: {
        id: "NFL:SF",
        abbreviation: "SF",
        logo: ESPN_SF
      }
    },
    score: { away: 24, home: 23 },
    gameState: { quarter: 4, clock: "2:48" },
    possession: null,
    situation: null,
    drive: null,
    lastPlay: null,
    lineScore: { periods: [1, 2, 3, 4], away: [], home: [] }
  };
}

test("qualification uses explicit league context and preserves qualified IDs", () => {
  assert.equal(qualifyTeamPaletteId("MLB", {
    id: 136,
    abbreviation: "sea"
  }), "MLB:SEA");
  assert.equal(qualifyTeamPaletteId("NFL", {
    id: "NFL:SEA",
    abbreviation: "SEA"
  }), "NFL:SEA");
  assert.equal(qualifyTeamPaletteId(null, { id: "SEA" }), null);
  assert.equal(qualifyTeamPaletteId("MLB", { id: 136 }), null);
  assert.equal(qualifyTeamPaletteId("NFL", { id: "MLB:SEA" }), null);
});

test("configured favorites enqueue in order and normalize legacy MLB identity", async () => {
  const calls = [];
  const resolver = {
    resolve: async (input) => { calls.push(input); return null; }
  };
  const favorites = [
    { id: "SEA", abbreviation: "SEA", league: "MLB", logo: MLB_SEA },
    { id: "NFL:SEA", abbreviation: "SEA", league: "NFL", logo: ESPN_SEA },
    { id: "NFL:SF", abbreviation: "SF", league: "NFL", logo: "" }
  ];

  assert.equal(enqueueFavoriteTeamPalettes(resolver, favorites), 2);
  assert.deepEqual(calls, []);
  await flush();
  assert.deepEqual(calls, [
    { teamId: "MLB:SEA", logoUrl: MLB_SEA },
    { teamId: "NFL:SEA", logoUrl: ESPN_SEA }
  ]);
  assert.deepEqual(favorites.map((team) => team.id), [
    "SEA",
    "NFL:SEA",
    "NFL:SF"
  ]);
});

test("enqueue is fire-and-forget and never waits for palette completion", async () => {
  let release;
  let settled = false;
  const pending = new Promise((resolve) => { release = resolve; });
  const resolver = {
    resolve: () => pending.then(() => { settled = true; })
  };

  assert.equal(enqueueTeamPaletteResolution({
    resolver,
    league: "NFL",
    team: { id: "NFL:SEA", logo: ESPN_SEA }
  }), true);
  assert.equal(settled, false);
  await flush();
  assert.equal(settled, false);
  release();
  await flush();
  assert.equal(settled, true);
});

test("ordinary null is silent and unexpected rejection is sanitized", async () => {
  const warnings = [];
  const logger = { warn: (message) => warnings.push(message) };
  enqueueTeamPaletteResolution({
    resolver: { resolve: async () => null },
    league: "NFL",
    team: { id: "NFL:SEA", logo: `${ESPN_SEA}?private=secret` },
    logger
  });
  await flush();
  assert.deepEqual(warnings, []);

  enqueueTeamPaletteResolution({
    resolver: {
      resolve: async () => { throw new Error("private upstream body"); }
    },
    league: "NFL",
    team: { id: "NFL:SEA", logo: `${ESPN_SEA}?private=secret` },
    logger
  });
  await flush();
  assert.deepEqual(warnings, [
    "Team palette pre-resolution failed for NFL:SEA."
  ]);
  assert.equal(warnings[0].includes("secret"), false);
});

test("MLB and NFL schedule metadata enqueue both teams independently", async () => {
  const calls = [];
  const resolver = { resolve: async (input) => { calls.push(input); } };
  const mlbSchedule = {
    sportsEvents: [{
      awayTeam: { id: 111, abbreviation: "BOS", logo: MLB_BOS },
      homeTeam: { id: 136, abbreviation: "SEA", logo: MLB_SEA }
    }]
  };
  const nflSchedule = {
    sportsEvents: [{
      awayTeam: { id: "NFL:SEA", abbreviation: "SEA", logo: ESPN_SEA },
      homeTeam: { id: "NFL:SF", abbreviation: "SF", logo: ESPN_SF }
    }]
  };

  assert.equal(enqueueSportsSchedulePalettes(resolver, "MLB", mlbSchedule), 2);
  assert.equal(enqueueSportsSchedulePalettes(resolver, "NFL", nflSchedule), 2);
  await flush();
  assert.deepEqual(calls.map((call) => call.teamId), [
    "MLB:BOS",
    "MLB:SEA",
    "NFL:SEA",
    "NFL:SF"
  ]);
});

test("aggregate acquisition preserves league and game ordering", async () => {
  const calls = [];
  const resolver = { resolve: async (input) => { calls.push(input.teamId); } };
  const acquisition = {
    leagues: [
      {
        league: "NFL",
        sportsEvents: [{ teams: {
          away: { id: "NFL:SEA", logo: ESPN_SEA },
          home: { id: "NFL:SF", logo: ESPN_SF }
        }}]
      },
      {
        league: "MLB",
        sportsEvents: [{
          awayTeam: { abbreviation: "BOS", logo: MLB_BOS },
          homeTeam: { abbreviation: "SEA", logo: MLB_SEA }
        }]
      }
    ]
  };
  assert.equal(enqueueAggregateSportsPalettes(resolver, acquisition), 4);
  await flush();
  assert.deepEqual(calls, ["NFL:SEA", "NFL:SF", "MLB:BOS", "MLB:SEA"]);
  assert.equal(acquisition.leagues[0].sportsEvents[0].palette, undefined);
});

test("detailed MLB and NFL Gamecast metadata enqueue both sides", async () => {
  const calls = [];
  const resolver = { resolve: async (input) => { calls.push(input.teamId); } };
  enqueueGamecastPalettes(resolver, "MLB", {
    teams: {
      away: { abbreviation: "BOS", logo: MLB_BOS },
      home: { abbreviation: "SEA", logo: MLB_SEA }
    }
  });
  enqueueGamecastPalettes(resolver, "NFL", { gamecast: validGamecast() });
  await flush();
  assert.deepEqual(calls, ["MLB:BOS", "MLB:SEA", "NFL:SEA", "NFL:SF"]);
});

test("NFL schedule response completes while palette work remains pending", async () => {
  const schedule = {
    sport: "NFL",
    sportsEvents: [{
      awayTeam: { id: "NFL:SEA", logo: ESPN_SEA },
      homeTeam: { id: "NFL:SF", logo: ESPN_SF }
    }]
  };
  const never = new Promise(() => {});
  const handler = createNflDailyScheduleHandler(
    async () => schedule,
    { paletteResolver: { resolve: () => never } }
  );
  const response = createResponse();
  await handler({ query: { date: "2026-09-07" } }, response);
  assert.equal(response.body, schedule);
  assert.equal(response.statusCode, 200);
});

test("NFL detailed Gamecast response and stale contract ignore palette failure", async () => {
  const gamecast = validGamecast();
  const handler = createNflGamecastHandler({
    cache: new Map(),
    requestsInFlight: new Map(),
    acquire: async () => gamecast,
    paletteResolver: {
      resolve: async () => { throw new Error("palette unavailable"); }
    },
    logger: { warn: () => {} },
    now: () => Date.parse("2026-09-07T00:00:00.000Z")
  });
  const response = createResponse();
  await handler({
    query: { date: "2026-09-07", eventId: "401772831" }
  }, response);
  assert.equal(response.statusCode, 200);
  assert.equal(response.body.gamecast, gamecast);
  assert.equal(response.body.stale, false);
  await flush();
});

test("startup and config hooks occur after readiness/persistence without awaiting", () => {
  const serverSource = fs.readFileSync(path.join(
    __dirname,
    "..",
    "..",
    "backend",
    "server.js"
  ), "utf8");

  assert.match(serverSource,
    /app\.listen\([\s\S]*?Project Mosaic running[\s\S]*?enqueueFavoriteTeamPalettes/);
  assert.match(serverSource,
    /await writeConfig\(config\);[\s\S]*?enqueueFavoriteTeamPalettes\([\s\S]*?config\.sports\.favoriteTeams/);
  assert.match(serverSource,
    /await writeConfig\(savedConfig\);\s*enqueueFavoriteTeamPalettes\(teamPaletteResolver, favoriteTeams\)/);
  assert.doesNotMatch(serverSource, /await enqueue(?:Favorite|Sports|Gamecast)/);
});

test("removal only re-enqueues remaining favorites and never deletes cache", () => {
  const serverSource = fs.readFileSync(path.join(
    __dirname,
    "..",
    "..",
    "backend",
    "server.js"
  ), "utf8");
  const removal = serverSource.slice(
    serverSource.indexOf('app.post("/control/favorite-teams/remove"'),
    serverSource.indexOf('app.post("/control/calendar-sources/add"')
  );
  assert.match(removal, /enqueueFavoriteTeamPalettes\(teamPaletteResolver, favoriteTeams\)/);
  assert.doesNotMatch(removal, /teamPaletteResolver\.(?:delete|remove)|palette.*cache.*(?:delete|remove)/i);
});

test("lifecycle hooks do not alter sports, score, renderer, or frontend contracts", () => {
  const root = path.join(__dirname, "..", "..");
  const normalizedContract = fs.readFileSync(path.join(
    root,
    "frontend/sports/sports-event-contract.js"
  ), "utf8");
  const scoreContract = fs.readFileSync(path.join(
    root,
    "frontend/sports/gamecast/score-event-detector.js"
  ), "utf8");
  const helper = fs.readFileSync(path.join(
    root,
    "backend/team-palettes/team-palette-pre-resolution.js"
  ), "utf8");

  assert.doesNotMatch(normalizedContract, /palette|textOnPrimary/);
  assert.doesNotMatch(scoreContract, /palette|textOnPrimary/);
  assert.doesNotMatch(helper, /frontend|renderer|hero|score-event|celebration/i);
});
