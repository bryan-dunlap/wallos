const assert = require("node:assert/strict");
const test = require("node:test");
const {
  MAX_HOME_ASSISTANT_RESPONSE_BYTES,
  testConnection
} = require(
  "../../backend/home-assistant/home-assistant-client"
);

const TOKEN = "private-test-token";

function jsonResponse(payload, init = {}) {
  return new Response(JSON.stringify(payload), {
    status: init.status || 200,
    headers: { "content-type": "application/json" }
  });
}

test("authenticated Home Assistant API response connects", async () => {
  let requestedUrl;
  let requestOptions;
  const result = await testConnection(
    {
      baseUrl: "https://ha.example.test/installation/",
      accessToken: TOKEN
    },
    {
      fetchImpl: async (url, options) => {
        requestedUrl = url;
        requestOptions = options;
        return jsonResponse({ message: "API running." });
      }
    }
  );

  assert.deepEqual(result, { status: "connected" });
  assert.equal(requestedUrl, "https://ha.example.test/installation/api/");
  assert.equal(requestedUrl.includes(TOKEN), false);
  assert.equal(requestOptions.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(requestOptions.headers.Accept, "application/json");
  assert.equal(requestOptions.method, "GET");
  assert.equal(requestOptions.redirect, "manual");
});

test("authorization failures use the stable unauthorized result", async () => {
  for (const status of [401, 403]) {
    const result = await testConnection(
      { baseUrl: "https://ha.example.test", accessToken: TOKEN },
      { fetchImpl: async () => new Response(null, { status }) }
    );

    assert.deepEqual(result, { status: "unauthorized" });
  }
});

test("invalid URLs fail before fetch", async () => {
  let calls = 0;
  const result = await testConnection(
    { baseUrl: "ftp://ha.example.test", accessToken: TOKEN },
    { fetchImpl: async () => { calls += 1; } }
  );

  assert.deepEqual(result, { status: "invalid_url" });
  assert.equal(calls, 0);
});

test("timeout and network failures have distinct stable results", async () => {
  const timeout = await testConnection(
    { baseUrl: "https://ha.example.test", accessToken: TOKEN },
    {
      timeoutMs: 1,
      fetchImpl: async (url, { signal }) => new Promise((resolve, reject) => {
        signal.addEventListener("abort", () => reject(signal.reason));
      })
    }
  );
  const unreachable = await testConnection(
    { baseUrl: "https://ha.example.test", accessToken: TOKEN },
    { fetchImpl: async () => { throw new Error(`network ${TOKEN}`); } }
  );

  assert.deepEqual(timeout, { status: "timeout" });
  assert.deepEqual(unreachable, { status: "unreachable" });
  assert.equal(JSON.stringify([timeout, unreachable]).includes(TOKEN), false);
});

test("non-success and redirect responses are upstream errors", async () => {
  for (const status of [302, 500]) {
    const result = await testConnection(
      { baseUrl: "https://ha.example.test", accessToken: TOKEN },
      { fetchImpl: async () => new Response(null, { status }) }
    );

    assert.deepEqual(result, { status: "upstream_error" });
  }
});

test("invalid JSON and unexpected success shapes are rejected", async () => {
  const invalidJson = await testConnection(
    { baseUrl: "https://ha.example.test", accessToken: TOKEN },
    { fetchImpl: async () => new Response("not json", { status: 200 }) }
  );
  const wrongShape = await testConnection(
    { baseUrl: "https://ha.example.test", accessToken: TOKEN },
    { fetchImpl: async () => jsonResponse({ message: "another service" }) }
  );

  assert.deepEqual(invalidJson, { status: "unexpected_response" });
  assert.deepEqual(wrongShape, { status: "unexpected_response" });
});

test("oversized responses are rejected without exposing the token", async () => {
  const result = await testConnection(
    { baseUrl: "https://ha.example.test", accessToken: TOKEN },
    {
      fetchImpl: async () => new Response(
        JSON.stringify({ message: "x".repeat(
          MAX_HOME_ASSISTANT_RESPONSE_BYTES
        ) }),
        { status: 200 }
      )
    }
  );

  assert.deepEqual(result, { status: "unexpected_response" });
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});
