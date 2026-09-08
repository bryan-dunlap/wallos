const assert = require("node:assert/strict");
const http = require("node:http");
const test = require("node:test");
const express = require("express");
const {
  createHomeAssistantRouter
} = require(
  "../../backend/home-assistant/home-assistant-routes"
);

const TOKEN = "route-private-test-token";

async function withTestServer(testConnectionImpl, callback, options = {}) {
  const app = express();
  app.use(
    "/api/home-assistant",
    createHomeAssistantRouter({ testConnectionImpl, ...options })
  );
  const server = http.createServer(app);

  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));

  try {
    const address = server.address();
    await callback(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => {
      if (error) reject(error);
      else resolve();
    }));
  }
}

async function request(baseUrl, {
  body = JSON.stringify({
    baseUrl: "http://homeassistant.local:8123",
    accessToken: TOKEN
  }),
  contentType = "application/json",
  origin
} = {}) {
  const headers = { "Content-Type": contentType };
  if (origin) headers.Origin = origin;
  const response = await fetch(
    `${baseUrl}/api/home-assistant/test-connection`,
    { method: "POST", headers, body }
  );

  return {
    body: await response.json(),
    cacheControl: response.headers.get("cache-control"),
    status: response.status
  };
}

async function entityRequest(baseUrl, query = "") {
  const response = await fetch(
    `${baseUrl}/api/home-assistant/entities${query}`
  );

  return {
    body: await response.json(),
    cacheControl: response.headers.get("cache-control"),
    status: response.status
  };
}

function emptySnapshot(status) {
  return {
    schemaVersion: 1,
    status,
    entities: [],
    updatedAt: null,
    stale: false,
    total: 0,
    truncated: false
  };
}

test("route accepts draft credentials without persisting or exposing them", async () => {
  let received;
  let calls = 0;

  await withTestServer(async (credentials) => {
    calls += 1;
    received = credentials;
    return { status: "connected" };
  }, async (baseUrl) => {
    const response = await request(baseUrl);

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: "connected" });
    assert.equal(response.cacheControl, "no-store");
    assert.equal(JSON.stringify(response).includes(TOKEN), false);
  });

  assert.equal(calls, 1);
  assert.equal(received.accessToken, TOKEN);
});

test("route can use a stored token without returning it to the frontend", async () => {
  let received;

  await withTestServer(async (credentials) => {
    received = credentials;
    return { status: "connected" };
  }, async (baseUrl) => {
    const response = await request(baseUrl, {
      body: JSON.stringify({
        baseUrl: "http://draft-home-assistant.local:8123",
        useStoredAccessToken: true
      })
    });

    assert.equal(response.status, 200);
    assert.deepEqual(response.body, { status: "connected" });
    assert.equal(JSON.stringify(response).includes(TOKEN), false);
  }, {
    getStoredConfig: () => ({ accessToken: TOKEN })
  });

  assert.equal(received.baseUrl, "http://draft-home-assistant.local:8123");
  assert.equal(received.accessToken, TOKEN);
});

test("stored-token mode rejects token mixing and missing stored credentials", async () => {
  await withTestServer(async () => ({ status: "connected" }), async (baseUrl) => {
    const mixed = await request(baseUrl, {
      body: JSON.stringify({
        baseUrl: "http://homeassistant.local:8123",
        accessToken: TOKEN,
        useStoredAccessToken: true
      })
    });
    const missing = await request(baseUrl, {
      body: JSON.stringify({
        baseUrl: "http://homeassistant.local:8123",
        useStoredAccessToken: true
      })
    });

    assert.equal(mixed.status, 400);
    assert.equal(missing.status, 400);
  });
});

test("route rejects malformed, missing, and unsupported request bodies", async () => {
  await withTestServer(async () => ({ status: "connected" }), async (baseUrl) => {
    const malformed = await request(baseUrl, { body: "{" });
    const missing = await request(baseUrl, { body: "{}" });
    const unsupported = await request(baseUrl, {
      body: "baseUrl=x&accessToken=y",
      contentType: "application/x-www-form-urlencoded"
    });

    assert.equal(malformed.status, 400);
    assert.equal(missing.status, 400);
    assert.equal(unsupported.status, 415);
    assert.equal(malformed.cacheControl, "no-store");
  });
});

test("route accepts same-origin and absent origins but rejects foreign origins", async () => {
  await withTestServer(async () => ({ status: "connected" }), async (baseUrl) => {
    const sameOrigin = await request(baseUrl, { origin: baseUrl });
    const absentOrigin = await request(baseUrl);
    const foreignOrigin = await request(baseUrl, {
      origin: "https://foreign.example.test"
    });

    assert.equal(sameOrigin.status, 200);
    assert.equal(absentOrigin.status, 200);
    assert.equal(foreignOrigin.status, 403);
    assert.deepEqual(foreignOrigin.body, { status: "forbidden" });
    assert.equal(foreignOrigin.cacheControl, "no-store");
  });
});

test("route maps sanitized client failures to stable HTTP responses", async () => {
  const cases = [
    ["invalid_url", 400],
    ["unauthorized", 401],
    ["timeout", 504],
    ["unreachable", 502],
    ["upstream_error", 502],
    ["unexpected_response", 502]
  ];

  for (const [status, expectedHttpStatus] of cases) {
    await withTestServer(async () => ({ status }), async (baseUrl) => {
      const response = await request(baseUrl);

      assert.equal(response.status, expectedHttpStatus);
      assert.deepEqual(response.body, { status });
      assert.equal(JSON.stringify(response).includes(TOKEN), false);
    });
  }
});

test("route strips unexpected client data and sanitizes thrown errors", async () => {
  await withTestServer(async () => ({
    status: "connected",
    accessToken: TOKEN
  }), async (baseUrl) => {
    const response = await request(baseUrl);

    assert.deepEqual(response.body, { status: "connected" });
    assert.equal(JSON.stringify(response).includes(TOKEN), false);
  });

  await withTestServer(async () => {
    throw new Error(`failed with ${TOKEN}`);
  }, async (baseUrl) => {
    const response = await request(baseUrl);

    assert.equal(response.status, 502);
    assert.deepEqual(response.body, { status: "unreachable" });
    assert.equal(JSON.stringify(response).includes(TOKEN), false);
  });
});

test("entities route distinguishes disabled and unconfigured settings", async () => {
  for (const [storedConfig, status] of [
    [{ enabled: false }, "disabled"],
    [{ enabled: true, baseUrl: "https://ha.example.test" }, "unconfigured"]
  ]) {
    await withTestServer(null, async (baseUrl) => {
      const response = await entityRequest(baseUrl);

      assert.equal(response.status, 200);
      assert.equal(response.cacheControl, "no-store");
      assert.deepEqual(response.body, emptySnapshot(status));
    }, { getStoredConfig: () => storedConfig });
  }
});

test("entities route uses stored credentials and returns only normalized data", async () => {
  let receivedConfig;
  const stateCache = {
    getSnapshot: async (config) => {
      receivedConfig = config;
      return {
        schemaVersion: 1,
        status: "available",
        entities: [{
          entityId: "sensor.safe",
          domain: "sensor",
          state: "1",
          displayName: "Safe",
          unit: null,
          deviceClass: null,
          stateClass: null,
          icon: null,
          availability: "available",
          lastChanged: null,
          updatedAt: null
        }],
        updatedAt: "2026-09-07T18:00:00.000Z",
        stale: false,
        total: 1,
        truncated: false,
        context: { id: "raw-context" },
        attributes: { secret_metadata: "raw-attribute" }
      };
    }
  };

  await withTestServer(null, async (baseUrl) => {
    const response = await entityRequest(baseUrl);
    const serialized = JSON.stringify(response.body);

    assert.equal(response.status, 200);
    assert.equal(response.cacheControl, "no-store");
    assert.equal(response.body.status, "available");
    assert.equal(serialized.includes(TOKEN), false);
    assert.equal(serialized.includes("raw-context"), false);
    assert.equal(serialized.includes("raw-attribute"), false);
  }, {
    getStoredConfig: () => ({
      enabled: true,
      baseUrl: "https://ha.example.test",
      accessToken: TOKEN
    }),
    stateCache
  });

  assert.equal(receivedConfig.accessToken, TOKEN);
});

test("entities route preserves unavailable and stale snapshot contracts", async () => {
  for (const snapshot of [
    emptySnapshot("unavailable"),
    {
      schemaVersion: 1,
      status: "available",
      entities: [],
      updatedAt: "2026-09-07T18:00:00.000Z",
      stale: true,
      total: 0,
      truncated: false
    }
  ]) {
    await withTestServer(null, async (baseUrl) => {
      const response = await entityRequest(baseUrl);
      assert.equal(response.status, 200);
      assert.equal(response.body.status, snapshot.status);
      assert.equal(response.body.stale, snapshot.stale);
    }, {
      getStoredConfig: () => ({
        enabled: true,
        baseUrl: "https://ha.example.test",
        accessToken: TOKEN
      }),
      stateCache: { getSnapshot: async () => snapshot }
    });
  }
});

test("entities route filters repeated domains and applies a bounded limit", async () => {
  const snapshot = {
    schemaVersion: 1,
    status: "available",
    entities: [
      { entityId: "light.a", domain: "light" },
      { entityId: "sensor.a", domain: "sensor" },
      { entityId: "sensor.b", domain: "sensor" }
    ],
    updatedAt: "2026-09-07T18:00:00.000Z",
    stale: false,
    total: 4,
    truncated: true
  };
  Object.defineProperty(snapshot, "domainTotals", {
    value: { light: 1, sensor: 3 },
    enumerable: false
  });

  await withTestServer(null, async (baseUrl) => {
    const response = await entityRequest(
      baseUrl,
      "?domain=sensor&domain=light&limit=2"
    );

    assert.equal(response.status, 200);
    assert.deepEqual(
      response.body.entities.map((entity) => entity.entityId),
      ["light.a", "sensor.a"]
    );
    assert.equal(response.body.total, 4);
    assert.equal(response.body.truncated, true);
  }, {
    getStoredConfig: () => ({
      enabled: true,
      baseUrl: "https://ha.example.test",
      accessToken: TOKEN
    }),
    stateCache: { getSnapshot: async () => snapshot }
  });
});

test("entities route rejects invalid filters, limits, and credential overrides", async () => {
  await withTestServer(null, async (baseUrl) => {
    for (const query of [
      "?domain=Sensor",
      "?domain=sensor.bad",
      "?limit=0",
      "?limit=2001",
      "?limit=1.5",
      `?accessToken=${TOKEN}`,
      "?baseUrl=https%3A%2F%2Fother.example.test"
    ]) {
      const response = await entityRequest(baseUrl, query);

      assert.equal(response.status, 400);
      assert.deepEqual(response.body, { status: "invalid_request" });
      assert.equal(response.cacheControl, "no-store");
    }
  }, {
    getStoredConfig: () => ({
      enabled: true,
      baseUrl: "https://ha.example.test",
      accessToken: TOKEN
    }),
    stateCache: { getSnapshot: async () => emptySnapshot("unavailable") }
  });
});
