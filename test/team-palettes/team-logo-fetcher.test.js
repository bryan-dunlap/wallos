const test = require("node:test");
const assert = require("node:assert/strict");
const {
  TeamLogoFetcher
} = require("../../backend/team-palettes/team-logo-fetcher");

const ESPN = "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png";
const MLB = "https://www.mlbstatic.com/team-logos/136.svg";

function response(body, {
  status = 200,
  contentType = "image/png",
  headers = {}
} = {}) {
  return new Response(body, {
    status,
    headers: { "content-type": contentType, ...headers }
  });
}

test("accepts only current trusted HTTPS logo hosts", async () => {
  const calls = [];
  const fetcher = new TeamLogoFetcher({
    fetchImpl: async (url) => {
      calls.push(url);
      return response(Buffer.from("logo"));
    }
  });

  assert.equal((await fetcher.fetch(ESPN)).ok, true);
  assert.equal((await fetcher.fetch(MLB)).ok, true);
  assert.equal(calls.length, 2);
});

test("representative preview URLs retain exact trusted metadata", async () => {
  const previews = [
    ["NFL:SEA", ESPN, "image/png"],
    [
      "NFL:LV",
      "https://a.espncdn.com/i/teamlogos/nfl/500/lv.png",
      "image/png"
    ],
    [
      "NFL:GB",
      "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png",
      "image/png"
    ],
    [
      "MLB:BAL",
      "https://www.mlbstatic.com/team-logos/110.svg",
      "image/svg+xml"
    ]
  ];
  const fetcher = new TeamLogoFetcher({
    fetchImpl: async (url) => response(Buffer.from("logo"), {
      contentType: url.endsWith(".svg") ? "image/svg+xml" : "image/png"
    })
  });

  for (const [teamId, url, contentType] of previews) {
    assert.match(teamId, /^(?:NFL|MLB):[A-Z]+$/);
    assert.equal(fetcher.normalizeUrl(url), url);
    const result = await fetcher.fetch(url);
    assert.equal(result.ok, true);
    assert.equal(result.finalUrl, url);
    assert.equal(result.contentType, contentType);
  }
});

test("rejects unsafe URLs before network access", async () => {
  let calls = 0;
  const fetcher = new TeamLogoFetcher({
    fetchImpl: async () => { calls += 1; }
  });
  const unsafe = [
    ESPN.replace("https:", "http:"),
    "https://localhost/logo.png",
    "https://127.0.0.1/logo.png",
    "https://10.0.0.1/logo.png",
    "https://169.254.1.1/logo.png",
    "https://user:secret@a.espncdn.com/logo.png",
    "https://a.espncdn.com:8443/logo.png",
    "file:///tmp/logo.png",
    "data:image/png;base64,AA==",
    "https://example.com/logo.png"
  ];

  for (const url of unsafe) {
    assert.deepEqual(await fetcher.fetch(url), {
      ok: false,
      reasonCode: "invalid_url"
    });
  }
  assert.equal(calls, 0);
});

test("follows trusted redirects and rejects untrusted destinations", async () => {
  const calls = [];
  const fetcher = new TeamLogoFetcher({
    fetchImpl: async (url) => {
      calls.push(url);
      if (calls.length === 1) {
        return response(null, {
          status: 302,
          headers: { location: MLB }
        });
      }
      return response(Buffer.from("svg"), { contentType: "image/svg+xml" });
    }
  });
  const success = await fetcher.fetch(ESPN);
  assert.equal(success.ok, true);
  assert.equal(success.finalUrl, MLB);

  const rejected = new TeamLogoFetcher({
    fetchImpl: async () => response(null, {
      status: 302,
      headers: { location: "https://example.com/logo.png" }
    })
  });
  assert.deepEqual(await rejected.fetch(ESPN), {
    ok: false,
    reasonCode: "invalid_redirect"
  });
});

test("enforces the redirect limit", async () => {
  let calls = 0;
  const fetcher = new TeamLogoFetcher({
    redirectLimit: 2,
    fetchImpl: async () => {
      calls += 1;
      return response(null, { status: 302, headers: { location: ESPN } });
    }
  });
  assert.deepEqual(await fetcher.fetch(ESPN), {
    ok: false,
    reasonCode: "redirect_limit"
  });
  assert.equal(calls, 3);
});

test("reports timeouts without exposing upstream details", async () => {
  const fetcher = new TeamLogoFetcher({
    timeoutMs: 5,
    fetchImpl: (_url, { signal }) => new Promise((resolve, reject) => {
      signal.addEventListener("abort", () => {
        const error = new Error("secret upstream detail");
        error.name = "AbortError";
        reject(error);
      });
    })
  });
  assert.deepEqual(await fetcher.fetch(ESPN), {
    ok: false,
    reasonCode: "timeout"
  });
});

test("rejects non-success responses and unsupported content types", async () => {
  const nonSuccess = new TeamLogoFetcher({
    fetchImpl: async () => response("private body", { status: 500 })
  });
  assert.deepEqual(await nonSuccess.fetch(ESPN), {
    ok: false,
    reasonCode: "http_error"
  });

  const wrongType = new TeamLogoFetcher({
    fetchImpl: async () => response("<html>", { contentType: "text/html" })
  });
  assert.deepEqual(await wrongType.fetch(ESPN), {
    ok: false,
    reasonCode: "unsupported_content_type"
  });
});

test("rejects declared and streamed bodies above the encoded limit", async () => {
  const declared = new TeamLogoFetcher({
    maxBytes: 4,
    fetchImpl: async () => response("x", {
      headers: { "content-length": "5" }
    })
  });
  assert.deepEqual(await declared.fetch(ESPN), {
    ok: false,
    reasonCode: "response_too_large"
  });

  const streamed = new TeamLogoFetcher({
    maxBytes: 4,
    fetchImpl: async () => response("12345")
  });
  assert.deepEqual(await streamed.fetch(ESPN), {
    ok: false,
    reasonCode: "response_too_large"
  });
});

test("passes conditional validators and accepts 304", async () => {
  let headers;
  const fetcher = new TeamLogoFetcher({
    fetchImpl: async (_url, options) => {
      headers = options.headers;
      return response(null, { status: 304, contentType: "" });
    }
  });
  const result = await fetcher.fetch(ESPN, {
    etag: '"one"',
    lastModified: "Mon, 07 Sep 2026 00:00:00 GMT"
  });
  assert.equal(result.ok, true);
  assert.equal(result.notModified, true);
  assert.equal(headers["if-none-match"], '"one"');
  assert.equal(headers["if-modified-since"], "Mon, 07 Sep 2026 00:00:00 GMT");
});

test("does not forward conditional validators across a redirect", async () => {
  const requests = [];
  const fetcher = new TeamLogoFetcher({
    fetchImpl: async (url, options) => {
      requests.push({ url, headers: options.headers });
      return requests.length === 1
        ? response(null, { status: 302, headers: { location: MLB } })
        : response(Buffer.from("svg"), { contentType: "image/svg+xml" });
    }
  });
  assert.equal((await fetcher.fetch(ESPN, { etag: '"espn"' })).ok, true);
  assert.equal(requests[0].headers["if-none-match"], '"espn"');
  assert.equal(requests[1].headers["if-none-match"], undefined);
});
