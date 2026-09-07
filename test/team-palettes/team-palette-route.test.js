const test = require("node:test");
const assert = require("node:assert/strict");
const express = require("express");
const http = require("node:http");
const {
  TEAM_PALETTE_BATCH_LIMIT,
  createTeamPaletteRouter
} = require("../../backend/team-palettes/team-palette-routes");

function palette(teamId) {
  return {
    schemaVersion: 1,
    algorithmVersion: 1,
    teamId,
    primary: "#002244",
    secondary: "#69BE28",
    accent: "#A5ACAF",
    textOnPrimary: "#FFFFFF",
    source: { type: "logo", identity: `sha256:${"a".repeat(64)}` }
  };
}

async function withServer(resolver, callback) {
  const app = express();
  app.use("/api/team-palettes", createTeamPaletteRouter({ resolver }));
  const server = http.createServer(app);
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function request(baseUrl, body, options = {}) {
  const response = await fetch(`${baseUrl}/api/team-palettes/resolve`, {
    method: "POST",
    headers: {
      "content-type": options.contentType || "application/json",
      ...(options.origin ? { origin: options.origin } : {})
    },
    body: typeof body === "string" ? body : JSON.stringify(body)
  });
  return {
    status: response.status,
    cacheControl: response.headers.get("cache-control"),
    body: await response.json()
  };
}

test("valid bounded batch returns palettes and isolated null failures", async () => {
  const seen = [];
  const resolver = {
    resolve: async (input) => {
      seen.push(input);
      return input.teamId === "NFL:SEA" ? palette(input.teamId) : null;
    }
  };
  await withServer(resolver, async (baseUrl) => {
    const result = await request(baseUrl, {
      teams: [
        { teamId: "NFL:SEA", logoUrl: "https://a.espncdn.com/sea.png" },
        { teamId: "NFL:SF", logoUrl: "https://a.espncdn.com/sf.png" }
      ]
    });
    assert.equal(result.status, 200);
    assert.equal(result.cacheControl, "no-store");
    assert.equal(result.body.palettes["NFL:SEA"].primary, "#002244");
    assert.equal(result.body.palettes["NFL:SF"], null);
    assert.equal(seen.length, 2);
  });
});

test("invalid entries are isolated and unqualified identity is not guessed", async () => {
  const resolver = {
    resolve: async ({ teamId, logoUrl }) =>
      teamId.includes(":") && logoUrl.startsWith("https://a.espncdn.com/")
        ? palette(teamId)
        : null
  };
  await withServer(resolver, async (baseUrl) => {
    const result = await request(baseUrl, {
      teams: [
        null,
        { teamId: "SEA", logoUrl: "https://a.espncdn.com/sea.png" },
        { teamId: "NFL:SEA", logoUrl: "https://evil.test/logo.png" }
      ]
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.palettes.SEA, null);
    assert.equal(result.body.palettes["NFL:SEA"], null);
    assert.equal(Object.keys(result.body.palettes).length, 2);
  });
});

test("one resolver failure cannot fail the batch or expose raw errors", async () => {
  const resolver = {
    resolve: async ({ teamId }) => {
      if (teamId === "NFL:SF") throw new Error("secret upstream URL and body");
      return palette(teamId);
    }
  };
  await withServer(resolver, async (baseUrl) => {
    const result = await request(baseUrl, {
      teams: [
        { teamId: "NFL:SEA", logoUrl: "https://a.espncdn.com/sea.png" },
        { teamId: "NFL:SF", logoUrl: "https://a.espncdn.com/sf.png" }
      ]
    });
    assert.equal(result.status, 200);
    assert.equal(result.body.palettes["NFL:SEA"].teamId, "NFL:SEA");
    assert.equal(result.body.palettes["NFL:SF"], null);
    assert.equal(JSON.stringify(result).includes("secret"), false);
  });
});

test("rejects oversized batches, malformed JSON, and unsupported content", async () => {
  const resolver = { resolve: async () => null };
  await withServer(resolver, async (baseUrl) => {
    const oversized = await request(baseUrl, {
      teams: Array.from({ length: TEAM_PALETTE_BATCH_LIMIT + 1 }, () => ({}))
    });
    const malformed = await request(baseUrl, "{");
    const unsupported = await request(baseUrl, "teams=x", {
      contentType: "application/x-www-form-urlencoded"
    });
    assert.equal(oversized.status, 400);
    assert.equal(malformed.status, 400);
    assert.equal(unsupported.status, 415);
  });
});

test("rejects foreign origins", async () => {
  const resolver = { resolve: async () => null };
  await withServer(resolver, async (baseUrl) => {
    const result = await request(baseUrl, { teams: [] }, {
      origin: "https://foreign.example.test"
    });
    assert.equal(result.status, 403);
    assert.deepEqual(result.body, { status: "forbidden" });
  });
});
