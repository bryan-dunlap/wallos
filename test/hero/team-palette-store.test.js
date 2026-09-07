const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TeamPaletteStore,
  TEAM_PALETTE_BATCH_LIMIT
} = require("../../frontend/sports/team-palette-store");

const target = (teamId = "NFL:SEA", logoUrl = "https://logos.test/sea.png") =>
  ({ teamId, logoUrl });

const palette = (teamId = "NFL:SEA", overrides = {}) => ({
  schemaVersion: 1,
  algorithmVersion: 1,
  teamId,
  primary: "#002244",
  secondary: "#69be28",
  accent: "#a5acaf",
  textOnPrimary: "#ffffff",
  source: { type: "logo", identity: `sha256:${"a".repeat(64)}` },
  ...overrides
});

function response(palettes, options = {}) {
  return {
    ok: options.ok ?? true,
    json: async () => options.jsonError
      ? Promise.reject(new Error("bad json"))
      : ({ palettes })
  };
}

test("successful preload enables a synchronous normalized cache lookup", async () => {
  const calls = [];
  const store = new TeamPaletteStore({ fetch: async (url, options) => {
    calls.push({ url, options });
    return response({ "NFL:SEA": palette() });
  } });

  await store.preload([target()]);
  assert.equal(calls[0].url, "/api/team-palettes/resolve");
  assert.deepEqual(JSON.parse(calls[0].options.body), { teams: [target()] });
  assert.equal(store.getCached(target()).secondary, "#69BE28");
});

test("getCached is a synchronous network-free miss while preload is pending", async () => {
  let finish;
  let calls = 0;
  const store = new TeamPaletteStore({ fetch: () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  } });
  const pending = store.preload([target()]);

  assert.equal(store.getCached(target()), null);
  assert.equal(calls, 1);
  finish(response({ "NFL:SEA": palette() }));
  await pending;
});

test("concurrent and repeated preload requests are deduplicated", async () => {
  let calls = 0;
  let finish;
  const store = new TeamPaletteStore({ fetch: () => {
    calls += 1;
    return new Promise((resolve) => { finish = resolve; });
  } });

  const first = store.preload([target()]);
  const second = store.preload([target()]);
  let secondSettled = false;
  second.then(() => { secondSettled = true; });
  await Promise.resolve();
  assert.equal(calls, 1);
  assert.equal(secondSettled, false);
  finish(response({ "NFL:SEA": palette() }));
  await Promise.all([first, second]);
  assert.equal(secondSettled, true);
  await store.preload([target()]);
  assert.equal(calls, 1);
});

test("changed logos and cross-league IDs use independent keys", async () => {
  const calls = [];
  const store = new TeamPaletteStore({ fetch: async (url, options) => {
    const teams = JSON.parse(options.body).teams;
    calls.push(...teams);
    return response(Object.fromEntries(teams.map(
      (team) => [team.teamId, palette(team.teamId)]
    )));
  } });
  const oldNfl = target();
  const newNfl = target("NFL:SEA", "https://logos.test/sea-new.png");
  const mlb = target("MLB:SEA", "https://logos.test/mlb-sea.png");

  await store.preload([oldNfl]);
  assert.equal(store.getCached(newNfl), null);
  await store.preload([newNfl, mlb]);
  assert.equal(calls.length, 3);
  assert.equal(store.getCached(oldNfl).teamId, "NFL:SEA");
  assert.equal(store.getCached(newNfl).teamId, "NFL:SEA");
  assert.equal(store.getCached(mlb).teamId, "MLB:SEA");
});

test("preload splits batches at eight entries", async () => {
  const sizes = [];
  const store = new TeamPaletteStore({ fetch: async (url, options) => {
    const teams = JSON.parse(options.body).teams;
    sizes.push(teams.length);
    return response(Object.fromEntries(teams.map(
      ({ teamId }) => [teamId, palette(teamId)]
    )));
  } });
  const teams = Array.from(
    { length: TEAM_PALETTE_BATCH_LIMIT + 3 },
    (_, index) => target(`NFL:T${index}`, `https://logos.test/${index}.png`)
  );

  await store.preload(teams);
  assert.deepEqual(sizes, [8, 3]);
});

test("duplicate team IDs with changed logos are sent in separate batches", async () => {
  const urls = [];
  const store = new TeamPaletteStore({ fetch: async (url, options) => {
    const team = JSON.parse(options.body).teams[0];
    urls.push(team.logoUrl);
    return response({ [team.teamId]: palette(team.teamId) });
  } });
  await store.preload([
    target(),
    target("NFL:SEA", "https://logos.test/sea-new.png")
  ]);
  assert.equal(urls.length, 2);
});

test("null and malformed entries do not poison valid entries", async () => {
  const store = new TeamPaletteStore({ fetch: async () => response({
    "NFL:SEA": palette(),
    "NFL:SF": null,
    "MLB:SEA": palette("MLB:SEA", { primary: "red" })
  }) });
  const valid = target();
  const missing = target("NFL:SF", "https://logos.test/sf.png");
  const malformed = target("MLB:SEA", "https://logos.test/mlb.png");

  await store.preload([valid, missing, malformed]);
  assert.equal(store.getCached(valid).teamId, "NFL:SEA");
  assert.equal(store.getCached(missing), null);
  assert.equal(store.getCached(malformed), null);
});

test("defensive validation rejects every malformed contract boundary", async () => {
  const invalid = [
    { schemaVersion: 2 },
    { algorithmVersion: 2 },
    { teamId: "MLB:SEA" },
    { secondary: "rgb(0, 0, 0)" },
    { accent: "#12345g" },
    { textOnPrimary: "var(--secret)" },
    { source: { type: "manual", identity: "x" } },
    { source: { type: "logo", identity: "" } }
  ];

  for (const overrides of invalid) {
    const store = new TeamPaletteStore({ fetch: async () => response({
      "NFL:SEA": palette("NFL:SEA", overrides)
    }) });
    await store.preload([target()]);
    assert.equal(store.getCached(target()), null);
  }
});

test("HTTP, network, and JSON failures silently remain cache misses", async () => {
  const fetches = [
    async () => response({}, { ok: false }),
    async () => { throw new Error("network secret"); },
    async () => response({}, { jsonError: true })
  ];

  for (const fetch of fetches) {
    const store = new TeamPaletteStore({ fetch });
    await assert.doesNotReject(store.preload([target()]));
    assert.equal(store.getCached(target()), null);
  }
});

test("unqualified IDs, absent logos, and non-HTTPS logos never fetch", async () => {
  let calls = 0;
  const store = new TeamPaletteStore({ fetch: async () => {
    calls += 1;
    return response({});
  } });
  await store.preload([
    target("SEA"),
    target("NFL:SEA", ""),
    target("NFL:SEA", "http://logos.test/sea.png")
  ]);
  assert.equal(calls, 0);
});

test("store contains no league-specific policy or persistent storage", () => {
  const source = require("node:fs").readFileSync(
    require.resolve("../../frontend/sports/team-palette-store"),
    "utf8"
  );
  assert.doesNotMatch(source, /\b(?:MLB|NFL)\b/);
  assert.doesNotMatch(source, /localStorage|indexedDB|scoreEvent|Hero/);
});

test("production-style bound browser fetch reaches the endpoint", async () => {
  const browserWindow = {
    calls: [],
    fetch(url, options) {
      assert.equal(this, browserWindow);
      this.calls.push({ url, options });
      const team = JSON.parse(options.body).teams[0];
      return Promise.resolve(response({
        [team.teamId]: palette(team.teamId)
      }));
    }
  };
  const store = new TeamPaletteStore({
    fetch: browserWindow.fetch.bind(browserWindow)
  });

  await store.preload([target()]);
  assert.equal(browserWindow.calls.length, 1);
  assert.equal(store.getCached(target()).teamId, "NFL:SEA");
});

test("representative preview metadata passes the frontend contract path", async () => {
  const previews = [
    target("NFL:SEA", "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png"),
    target("NFL:LV", "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png"),
    target("NFL:GB", "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png"),
    target("MLB:BAL", "https://www.mlbstatic.com/team-logos/110.svg")
  ];
  const store = new TeamPaletteStore({ fetch: async (url, options) => {
    const teams = JSON.parse(options.body).teams;
    return response(Object.fromEntries(
      teams.map((team) => [team.teamId, palette(team.teamId)])
    ));
  } });

  await store.preload(previews);
  for (const preview of previews) {
    assert.equal(store.getCached(preview).teamId, preview.teamId);
  }
});
