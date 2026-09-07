const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const {
  TeamPaletteCache
} = require("../../backend/team-palettes/team-palette-cache");

const HASH = `sha256:${"a".repeat(64)}`;
const URL = "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png";

function palette(teamId = "NFL:SEA") {
  return {
    schemaVersion: 1,
    algorithmVersion: 1,
    teamId,
    primary: "#002244",
    secondary: "#69BE28",
    accent: "#A5ACAF",
    textOnPrimary: "#FFFFFF",
    source: { type: "logo", identity: HASH }
  };
}

function entry(teamId = "NFL:SEA", overrides = {}) {
  return {
    algorithmVersion: 1,
    sourceUrl: URL,
    sourceIdentity: HASH,
    etag: '"one"',
    lastModified: null,
    resolvedAt: "2026-09-07T00:00:00.000Z",
    lastCheckedAt: "2026-09-07T00:00:00.000Z",
    palette: palette(teamId),
    ...overrides
  };
}

async function temporaryCache(t) {
  const directory = await fs.promises.mkdtemp(path.join(os.tmpdir(), "mosaic-palettes-"));
  t.after(() => fs.promises.rm(directory, { recursive: true, force: true }));
  return path.join(directory, "nested", "team-palettes.v1.json");
}

test("missing and corrupt cache files load as empty", async (t) => {
  const filePath = await temporaryCache(t);
  const missing = new TeamPaletteCache({ filePath });
  await missing.load();
  assert.equal(missing.entries.size, 0);

  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, "{", "utf8");
  const corrupt = new TeamPaletteCache({ filePath });
  await corrupt.load();
  assert.equal(corrupt.entries.size, 0);
  assert.equal(corrupt.failures.size, 0);
});

test("loads valid records while ignoring partially bad records", async (t) => {
  const filePath = await temporaryCache(t);
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, JSON.stringify({
    schemaVersion: 1,
    entries: {
      "NFL:SEA": entry(),
      "NFL:BAD": { nope: true }
    },
    failures: {
      "MLB:SEA": {
        sourceUrl: "https://www.mlbstatic.com/team-logos/136.svg",
        failedAt: "2026-09-07T00:00:00.000Z",
        retryAfter: "2026-09-07T06:00:00.000Z",
        reasonCode: "timeout"
      },
      BAD: { reasonCode: "raw Error: private" }
    }
  }), "utf8");

  const cache = new TeamPaletteCache({ filePath });
  await cache.load();
  assert.equal(cache.entries.size, 1);
  assert.equal(cache.failures.size, 1);
  assert.equal(cache.getEntry("NFL:SEA", URL, 1).palette.primary, "#002244");
});

test("persistent success survives restart and writes atomically", async (t) => {
  const filePath = await temporaryCache(t);
  const cache = new TeamPaletteCache({ filePath });
  await cache.load();
  assert.equal(await cache.setSuccess("NFL:SEA", entry()), true);

  const directoryFiles = await fs.promises.readdir(path.dirname(filePath));
  assert.deepEqual(directoryFiles, ["team-palettes.v1.json"]);

  const restarted = new TeamPaletteCache({ filePath });
  await restarted.load();
  assert.deepEqual(restarted.getEntry("NFL:SEA", URL, 1), entry());
});

test("algorithm and source URL changes invalidate lookup without deleting data", async () => {
  const cache = new TeamPaletteCache({ filePath: null });
  await cache.load();
  await cache.setSuccess("NFL:SEA", entry());
  assert.ok(cache.getEntry("NFL:SEA", URL, 1));
  assert.equal(cache.getEntry("NFL:SEA", URL, 2), null);
  assert.equal(cache.getEntry("NFL:SEA", "https://a.espncdn.com/new.png", 1), null);
  assert.ok(cache.getAnyEntry("NFL:SEA"));
});

test("concurrent persistence writes are serialized", async () => {
  let activeWrites = 0;
  let maximumWrites = 0;
  const memory = new Map();
  const fsImpl = {
    readFile: async () => { throw Object.assign(new Error(), { code: "ENOENT" }); },
    mkdir: async () => {},
    writeFile: async (name, content) => {
      activeWrites += 1;
      maximumWrites = Math.max(maximumWrites, activeWrites);
      await new Promise((resolve) => setTimeout(resolve, 2));
      memory.set(name, content);
      activeWrites -= 1;
    },
    rename: async (from, to) => { memory.set(to, memory.get(from)); memory.delete(from); },
    unlink: async () => {}
  };
  const cache = new TeamPaletteCache({ filePath: "/virtual/cache.json", fsImpl });
  await cache.load();
  await Promise.all([
    cache.setSuccess("NFL:SEA", entry()),
    cache.setSuccess("MLB:SEA", entry("MLB:SEA", {
      sourceUrl: "https://www.mlbstatic.com/team-logos/136.svg"
    }))
  ]);
  assert.equal(maximumWrites, 1);
  const saved = JSON.parse(memory.get("/virtual/cache.json"));
  assert.deepEqual(Object.keys(saved.entries).sort(), ["MLB:SEA", "NFL:SEA"]);
});

test("write failure retains immediate in-memory success", async () => {
  const cache = new TeamPaletteCache({
    filePath: "/unwritable/cache.json",
    fsImpl: {
      readFile: async () => { throw new Error("missing"); },
      mkdir: async () => {},
      writeFile: async () => { throw new Error("read only"); },
      rename: async () => {},
      unlink: async () => {}
    }
  });
  await cache.load();
  assert.equal(await cache.setSuccess("NFL:SEA", entry()), false);
  assert.ok(cache.getEntry("NFL:SEA", URL, 1));
});

test("negative failures enforce cooldown, expire, and are URL-specific", async () => {
  let now = Date.parse("2026-09-07T00:00:00.000Z");
  const cache = new TeamPaletteCache({ filePath: null, now: () => now });
  await cache.load();
  await cache.setFailure("NFL:SEA", {
    sourceUrl: URL,
    failedAt: new Date(now).toISOString(),
    retryAfter: new Date(now + 1000).toISOString(),
    reasonCode: "timeout"
  });
  assert.ok(cache.getActiveFailure("NFL:SEA", URL));
  assert.equal(cache.getActiveFailure("NFL:SEA", `${URL}?changed=1`), null);
  now += 1001;
  assert.equal(cache.getActiveFailure("NFL:SEA", URL), null);
});

test("negative failure cooldown survives a persistent restart", async (t) => {
  const filePath = await temporaryCache(t);
  const now = Date.parse("2026-09-07T00:00:00.000Z");
  const cache = new TeamPaletteCache({ filePath, now: () => now });
  await cache.load();
  await cache.setFailure("NFL:SEA", {
    sourceUrl: URL,
    failedAt: new Date(now).toISOString(),
    retryAfter: new Date(now + 1000).toISOString(),
    reasonCode: "extraction_failed"
  });

  const restarted = new TeamPaletteCache({ filePath, now: () => now });
  await restarted.load();
  assert.equal(
    restarted.getActiveFailure("NFL:SEA", URL).reasonCode,
    "extraction_failed"
  );
});
