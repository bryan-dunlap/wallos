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
