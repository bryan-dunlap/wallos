const assert = require("node:assert/strict");
const test = require("node:test");
const {
  acquireStates,
  HomeAssistantClientError,
  MAX_HOME_ASSISTANT_RESPONSE_BYTES,
  MAX_HOME_ASSISTANT_STATES_RESPONSE_BYTES,
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

async function assertStatesFailure(fetchImpl, code, options = {}) {
  await assert.rejects(
    acquireStates(
      { baseUrl: "https://ha.example.test", accessToken: TOKEN },
      { fetchImpl, ...options }
    ),
    (error) =>
      error instanceof HomeAssistantClientError && error.code === code
  );
}

test("acquires authenticated Home Assistant states without exposing token", async () => {
  const requests = [];
  const states = [{ entity_id: "sensor.safe", state: "1", attributes: {} }];
  const result = await acquireStates(
    { baseUrl: "https://ha.example.test/root/", accessToken: TOKEN },
    {
      fetchImpl: async (url, options) => {
        requests.push({ url, options });
        return jsonResponse(states);
      }
    }
  );

  assert.deepEqual(result, states);
  assert.equal(requests[0].url, "https://ha.example.test/root/api/states");
  assert.equal(requests[0].options.headers.Authorization, `Bearer ${TOKEN}`);
  assert.equal(requests[0].options.redirect, "manual");
  assert.equal(JSON.stringify(result).includes(TOKEN), false);
});

test("states acquisition follows only validated same-origin redirects", async () => {
  const urls = [];
  const result = await acquireStates(
    { baseUrl: "https://ha.example.test", accessToken: TOKEN },
    {
      fetchImpl: async (url) => {
        urls.push(url);
        return urls.length === 1
          ? new Response(null, {
            status: 307,
            headers: { location: "/api/states/" }
          })
          : jsonResponse([]);
      }
    }
  );

  assert.deepEqual(result, []);
  assert.deepEqual(urls, [
    "https://ha.example.test/api/states",
    "https://ha.example.test/api/states/"
  ]);

  for (const location of [
    "https://other.example.test/api/states",
    "http://[invalid"
  ]) {
    await assertStatesFailure(
      async () => new Response(null, {
        status: 302,
        headers: { location }
      }),
      "upstream_error"
    );
  }
});

test("states acquisition sanitizes timeout, network, and HTTP failures", async () => {
  await assertStatesFailure(
    async (url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => reject(signal.reason));
    }),
    "timeout",
    { timeoutMs: 1 }
  );
  await assertStatesFailure(
    async () => { throw new Error(`network ${TOKEN}`); },
    "unreachable"
  );

  for (const status of [401, 403]) {
    await assertStatesFailure(
      async () => new Response(null, { status }),
      "unauthorized"
    );
  }

  for (const status of [404, 500]) {
    await assertStatesFailure(
      async () => new Response(null, { status }),
      "upstream_error"
    );
  }
});

test("states acquisition rejects wrong content, JSON, and top-level shape", async () => {
  await assertStatesFailure(
    async () => new Response("[]", {
      status: 200,
      headers: { "content-type": "text/plain" }
    }),
    "unexpected_response"
  );
  await assertStatesFailure(
    async () => new Response("not json", {
      status: 200,
      headers: { "content-type": "application/json" }
    }),
    "unexpected_response"
  );
  await assertStatesFailure(
    async () => jsonResponse({ states: [] }),
    "unexpected_response"
  );
});

test("states acquisition enforces the four MiB body limit", async () => {
  await assertStatesFailure(
    async () => new Response("[]", {
      status: 200,
      headers: {
        "content-type": "application/json",
        "content-length": String(MAX_HOME_ASSISTANT_STATES_RESPONSE_BYTES + 1)
      }
    }),
    "unexpected_response"
  );
  await assertStatesFailure(
    async () => new Response(
      `["${"x".repeat(MAX_HOME_ASSISTANT_STATES_RESPONSE_BYTES)}"]`,
      {
        status: 200,
        headers: { "content-type": "application/json" }
      }
    ),
    "unexpected_response"
  );
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
