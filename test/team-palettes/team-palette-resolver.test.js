const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  TeamPaletteCache
} = require("../../backend/team-palettes/team-palette-cache");
const {
  TeamPaletteResolver,
  hashBytes
} = require("../../backend/team-palettes/team-palette-resolver");

const URL = "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png";
const OTHER_URL = "https://www.mlbstatic.com/team-logos/136.svg";
const BYTES = Buffer.from("same-logo-bytes");

function makePalette(teamId, sourceIdentity = hashBytes(BYTES)) {
  return {
    schemaVersion: 1,
    algorithmVersion: 1,
    teamId,
    primary: "#002244",
    secondary: "#69BE28",
    accent: "#A5ACAF",
    textOnPrimary: "#FFFFFF",
    source: { type: "logo", identity: sourceIdentity }
  };
}

function harness(options = {}) {
  let fetchCalls = 0;
  let extractCalls = 0;
  let now = options.now ?? Date.parse("2026-09-07T00:00:00.000Z");
  const cache = options.cache || new TeamPaletteCache({
    filePath: null,
    now: () => now
  });
  const fetcher = options.fetcher || {
    normalizeUrl: (url) => [URL, OTHER_URL].includes(url) ? url : null,
    fetch: async () => {
      fetchCalls += 1;
      if (options.fetchFailure) return { ok: false, reasonCode: "timeout" };
      return {
        ok: true,
        notModified: false,
        bytes: BYTES,
        contentType: "image/png",
        etag: '"one"',
        lastModified: null
      };
    }
  };
  const extract = options.extract || (async ({ teamId, sourceIdentity }) => {
    extractCalls += 1;
    return options.extractNull ? null : makePalette(teamId, sourceIdentity);
  });
  const resolver = new TeamPaletteResolver({
    cache,
    fetcher,
    extract,
    now: () => now,
    negativeCacheMs: 1000,
    revalidateAfterMs: 1000
  });

  return {
    cache,
    resolver,
    calls: () => ({ fetchCalls, extractCalls }),
    setNow: (value) => { now = value; }
  };
}

test("requires qualified identity and a trusted normalized URL", async () => {
  const { resolver, calls } = harness();
  assert.equal(await resolver.resolve({ teamId: "SEA", logoUrl: URL }), null);
  assert.equal(await resolver.resolve({ teamId: "NFL:SEA", logoUrl: "https://bad.test/x" }), null);
  assert.deepEqual(calls(), { fetchCalls: 0, extractCalls: 0 });
});

test("successful fetch extracts, hashes, caches, and returns a palette", async () => {
  const { resolver, cache, calls } = harness();
  const palette = await resolver.resolve({ teamId: "nfl:sea", logoUrl: URL });
  assert.equal(palette.teamId, "NFL:SEA");
  assert.equal(palette.source.identity, hashBytes(BYTES));
  assert.deepEqual(calls(), { fetchCalls: 1, extractCalls: 1 });
  assert.equal(cache.getAnyEntry("NFL:SEA").sourceIdentity, hashBytes(BYTES));
});

test("hot and persistent hits avoid fetch and extraction", async () => {
  const first = harness();
  await first.resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL });
  await first.resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL });
  assert.deepEqual(first.calls(), { fetchCalls: 1, extractCalls: 1 });

  const restarted = harness({ cache: first.cache });
  await restarted.resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL });
  assert.deepEqual(restarted.calls(), { fetchCalls: 0, extractCalls: 0 });
});

test("simultaneous identical work shares one fetch and extraction", async () => {
  let release;
  let fetchCalls = 0;
  const gate = new Promise((resolve) => { release = resolve; });
  const fetcher = {
    normalizeUrl: (url) => url === URL ? url : null,
    fetch: async () => {
      fetchCalls += 1;
      await gate;
      return { ok: true, bytes: BYTES, contentType: "image/png" };
    }
  };
  const { resolver } = harness({ fetcher });
  const first = resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL });
  const second = resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  assert.deepEqual(await Promise.all([first, second]), [
    makePalette("NFL:SEA"),
    makePalette("NFL:SEA")
  ]);
  assert.equal(fetchCalls, 1);
});

test("qualified leagues maintain independent hot and persistent records", async () => {
  const { resolver, cache } = harness();
  const nfl = await resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL });
  const mlb = await resolver.resolve({ teamId: "MLB:SEA", logoUrl: URL });
  assert.equal(nfl.teamId, "NFL:SEA");
  assert.equal(mlb.teamId, "MLB:SEA");
  assert.equal(cache.entries.size, 2);
});

test("same bytes at a changed trusted URL reuse prior extraction", async () => {
  const { resolver, calls } = harness();
  await resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL });
  await resolver.resolve({ teamId: "NFL:SEA", logoUrl: OTHER_URL });
  assert.deepEqual(calls(), { fetchCalls: 2, extractCalls: 1 });
});

test("fetch and extraction failures return null and enter cooldown", async () => {
  for (const option of [{ fetchFailure: true }, { extractNull: true }]) {
    const { resolver, cache, calls } = harness(option);
    assert.equal(await resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL }), null);
    assert.equal(await resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL }), null);
    assert.equal(calls().fetchCalls, 1);
    assert.ok(cache.getActiveFailure("NFL:SEA", URL));
    assert.match(cache.failures.get("NFL:SEA").reasonCode, /^(timeout|extraction_failed)$/);
  }
});

test("changed URL bypasses failure and expired cooldown retries", async () => {
  let fail = true;
  let calls = 0;
  const fetcher = {
    normalizeUrl: (url) => [URL, OTHER_URL].includes(url) ? url : null,
    fetch: async () => {
      calls += 1;
      return fail
        ? { ok: false, reasonCode: "network_error" }
        : { ok: true, bytes: BYTES, contentType: "image/png" };
    }
  };
  const state = harness({ fetcher });
  assert.equal(await state.resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL }), null);
  fail = false;
  assert.ok(await state.resolver.resolve({ teamId: "NFL:SEA", logoUrl: OTHER_URL }));

  const retry = harness({ fetcher });
  fail = true;
  assert.equal(await retry.resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL }), null);
  fail = false;
  retry.setNow(Date.parse("2026-09-07T00:00:01.001Z"));
  assert.ok(await retry.resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL }));
  assert.equal(calls, 4);
});

test("cache persistence failure does not hide a usable in-memory result", async () => {
  const cache = new TeamPaletteCache({
    filePath: "/unwritable/palettes.json",
    fsImpl: {
      readFile: async () => { throw new Error("missing"); },
      mkdir: async () => {},
      writeFile: async () => { throw new Error("read only"); },
      rename: async () => {},
      unlink: async () => {}
    }
  });
  const { resolver } = harness({ cache });
  const palette = await resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL });
  assert.equal(palette.primary, "#002244");
  assert.equal(cache.getAnyEntry("NFL:SEA").palette.primary, "#002244");
});

test("explicit stale revalidation uses validators and preserves last known good", async () => {
  let now = Date.parse("2026-09-07T00:00:00.000Z");
  let conditional;
  let mode = "initial";
  const cache = new TeamPaletteCache({ filePath: null, now: () => now });
  const fetcher = {
    normalizeUrl: (url) => url === URL ? url : null,
    fetch: async (_url, validators) => {
      conditional = validators;
      if (mode === "failure") return { ok: false, reasonCode: "timeout" };
      if (mode === "not-modified") {
        return { ok: true, notModified: true, etag: '"one"', lastModified: null };
      }
      return {
        ok: true,
        notModified: false,
        bytes: BYTES,
        contentType: "image/png",
        etag: '"one"'
      };
    }
  };
  const resolver = new TeamPaletteResolver({
    cache,
    fetcher,
    extract: async ({ teamId, sourceIdentity }) => makePalette(teamId, sourceIdentity),
    now: () => now,
    revalidateAfterMs: 1000,
    negativeCacheMs: 1000
  });
  await resolver.resolve({ teamId: "NFL:SEA", logoUrl: URL });
  now += 1001;
  mode = "not-modified";
  assert.ok(await resolver.revalidate({ teamId: "NFL:SEA", logoUrl: URL }));
  assert.equal(conditional.etag, '"one"');
  assert.equal(cache.getAnyEntry("NFL:SEA").lastCheckedAt, new Date(now).toISOString());

  now += 1001;
  mode = "failure";
  assert.equal(
    (await resolver.revalidate({ teamId: "NFL:SEA", logoUrl: URL })).primary,
    "#002244"
  );
  assert.ok(cache.getActiveFailure("NFL:SEA", URL));
});

test("resolver infrastructure imports no sports or presentation modules", () => {
  const root = path.join(__dirname, "..", "..", "backend", "team-palettes");
  const sources = [
    "team-logo-fetcher.js",
    "team-palette-cache.js",
    "team-palette-resolver.js"
  ].map((name) => fs.readFileSync(path.join(root, name), "utf8")).join("\n");
  assert.doesNotMatch(sources, /require\([^)]*(sports|frontend|hero|gamecast)/i);
  assert.doesNotMatch(sources, /score-event|celebration/i);
});
