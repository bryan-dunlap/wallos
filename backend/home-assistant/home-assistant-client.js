const {
  normalizeHomeAssistantConfig
} = require("./home-assistant-config");

const DEFAULT_HOME_ASSISTANT_TIMEOUT_MS = 10 * 1000;
const MAX_HOME_ASSISTANT_RESPONSE_BYTES = 16 * 1024;
const MAX_HOME_ASSISTANT_STATES_RESPONSE_BYTES = 4 * 1024 * 1024;
const MAX_HOME_ASSISTANT_REDIRECTS = 3;

async function testConnection(
  { baseUrl, accessToken } = {},
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_HOME_ASSISTANT_TIMEOUT_MS
  } = {}
) {
  const config = normalizeHomeAssistantConfig({
    enabled: false,
    baseUrl,
    accessToken
  });

  if (!config.baseUrl) return { status: "invalid_url" };
  if (!config.accessToken) return { status: "unauthorized" };
  if (typeof fetchImpl !== "function") return { status: "unreachable" };

  const endpoint = `${config.baseUrl}/api/`;
  const signal = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchImpl(endpoint, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${config.accessToken}`
      },
      redirect: "manual",
      ...(signal ? { signal } : {})
    });

    if (response.status === 401 || response.status === 403) {
      return { status: "unauthorized" };
    }

    if (!response.ok) return { status: "upstream_error" };

    const payload = await readBoundedJson(
      response,
      MAX_HOME_ASSISTANT_RESPONSE_BYTES
    );

    return payload?.message === "API running."
      ? { status: "connected" }
      : { status: "unexpected_response" };
  } catch (error) {
    if (signal?.aborted || isAbortError(error)) {
      return { status: "timeout" };
    }

    if (error instanceof UnexpectedResponseError) {
      return { status: "unexpected_response" };
    }

    return { status: "unreachable" };
  }
}

async function acquireStates(
  { baseUrl, accessToken } = {},
  {
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_HOME_ASSISTANT_TIMEOUT_MS
  } = {}
) {
  const config = normalizeHomeAssistantConfig({
    enabled: true,
    baseUrl,
    accessToken
  });

  if (!config.baseUrl || !config.accessToken) {
    throw new HomeAssistantClientError("invalid_configuration");
  }

  if (typeof fetchImpl !== "function") {
    throw new HomeAssistantClientError("unreachable");
  }

  const endpoint = new URL(`${config.baseUrl}/api/states`);
  const signal = createTimeoutSignal(timeoutMs);

  try {
    const response = await fetchWithValidatedRedirects(
      endpoint,
      config.accessToken,
      { fetchImpl, signal }
    );

    if (response.status === 401 || response.status === 403) {
      throw new HomeAssistantClientError("unauthorized");
    }

    if (!response.ok) {
      throw new HomeAssistantClientError("upstream_error");
    }

    if (!isJsonResponse(response)) {
      throw new HomeAssistantClientError("unexpected_response");
    }

    const payload = await readBoundedJson(
      response,
      MAX_HOME_ASSISTANT_STATES_RESPONSE_BYTES
    );

    if (!Array.isArray(payload)) {
      throw new HomeAssistantClientError("unexpected_response");
    }

    return payload;
  } catch (error) {
    if (error instanceof HomeAssistantClientError) throw error;

    if (signal?.aborted || isAbortError(error)) {
      throw new HomeAssistantClientError("timeout");
    }

    if (error instanceof UnexpectedResponseError) {
      throw new HomeAssistantClientError("unexpected_response");
    }

    throw new HomeAssistantClientError("unreachable");
  }
}

async function fetchWithValidatedRedirects(
  initialUrl,
  accessToken,
  { fetchImpl, signal }
) {
  const authorizedOrigin = initialUrl.origin;
  let currentUrl = initialUrl;

  for (let redirects = 0; redirects <= MAX_HOME_ASSISTANT_REDIRECTS; redirects += 1) {
    const response = await fetchImpl(currentUrl.href, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      redirect: "manual",
      ...(signal ? { signal } : {})
    });

    if (!isRedirectResponse(response)) return response;
    if (redirects === MAX_HOME_ASSISTANT_REDIRECTS) {
      throw new HomeAssistantClientError("upstream_error");
    }

    const location = response.headers?.get?.("location");
    let nextUrl;

    try {
      nextUrl = new URL(location, currentUrl);
    } catch {
      throw new HomeAssistantClientError("upstream_error");
    }

    if (
      !location ||
      nextUrl.origin !== authorizedOrigin ||
      !["http:", "https:"].includes(nextUrl.protocol) ||
      nextUrl.username ||
      nextUrl.password
    ) {
      throw new HomeAssistantClientError("upstream_error");
    }

    currentUrl = nextUrl;
  }

  throw new HomeAssistantClientError("upstream_error");
}

function createTimeoutSignal(timeoutMs) {
  return typeof AbortSignal?.timeout === "function" &&
    Number.isFinite(timeoutMs) && timeoutMs > 0
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError";
}

function isRedirectResponse(response) {
  return [301, 302, 303, 307, 308].includes(response.status);
}

function isJsonResponse(response) {
  const contentType = response.headers?.get?.("content-type") || "";

  return /^application\/json(?:\s*;|$)/i.test(contentType);
}

async function readBoundedJson(
  response,
  maxBytes = MAX_HOME_ASSISTANT_RESPONSE_BYTES
) {
  const declaredLength = Number(response.headers?.get?.("content-length"));

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > maxBytes
  ) {
    throw new UnexpectedResponseError();
  }

  const text = await readBoundedText(response, maxBytes);

  try {
    return JSON.parse(text);
  } catch {
    throw new UnexpectedResponseError();
  }
}

async function readBoundedText(
  response,
  maxBytes = MAX_HOME_ASSISTANT_RESPONSE_BYTES
) {
  if (!response.body?.getReader) {
    const text = await response.text();

    if (Buffer.byteLength(text, "utf8") > maxBytes) {
      throw new UnexpectedResponseError();
    }

    return text;
  }

  const reader = response.body.getReader();
  const chunks = [];
  let totalBytes = 0;

  while (true) {
    const { done, value } = await reader.read();

    if (done) break;

    totalBytes += value.byteLength;

    if (totalBytes > maxBytes) {
      await reader.cancel();
      throw new UnexpectedResponseError();
    }

    chunks.push(Buffer.from(value));
  }

  return Buffer.concat(chunks).toString("utf8");
}

class UnexpectedResponseError extends Error {
  constructor() {
    super("Home Assistant returned an unexpected response.");
    this.name = "UnexpectedResponseError";
  }
}

class HomeAssistantClientError extends Error {
  constructor(code) {
    super("Home Assistant request failed.");
    this.name = "HomeAssistantClientError";
    this.code = code;
  }
}

module.exports = {
  acquireStates,
  DEFAULT_HOME_ASSISTANT_TIMEOUT_MS,
  HomeAssistantClientError,
  MAX_HOME_ASSISTANT_REDIRECTS,
  MAX_HOME_ASSISTANT_RESPONSE_BYTES,
  MAX_HOME_ASSISTANT_STATES_RESPONSE_BYTES,
  testConnection
};
