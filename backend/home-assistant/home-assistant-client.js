const {
  normalizeHomeAssistantConfig
} = require("./home-assistant-config");

const DEFAULT_HOME_ASSISTANT_TIMEOUT_MS = 10 * 1000;
const MAX_HOME_ASSISTANT_RESPONSE_BYTES = 16 * 1024;

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

    const payload = await readBoundedJson(response);

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

function createTimeoutSignal(timeoutMs) {
  return typeof AbortSignal?.timeout === "function" &&
    Number.isFinite(timeoutMs) && timeoutMs > 0
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

function isAbortError(error) {
  return error?.name === "AbortError" || error?.name === "TimeoutError";
}

async function readBoundedJson(response) {
  const declaredLength = Number(response.headers?.get?.("content-length"));

  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_HOME_ASSISTANT_RESPONSE_BYTES
  ) {
    throw new UnexpectedResponseError();
  }

  const text = await readBoundedText(response);

  try {
    return JSON.parse(text);
  } catch {
    throw new UnexpectedResponseError();
  }
}

async function readBoundedText(response) {
  if (!response.body?.getReader) {
    const text = await response.text();

    if (Buffer.byteLength(text, "utf8") > MAX_HOME_ASSISTANT_RESPONSE_BYTES) {
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

    if (totalBytes > MAX_HOME_ASSISTANT_RESPONSE_BYTES) {
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

module.exports = {
  DEFAULT_HOME_ASSISTANT_TIMEOUT_MS,
  MAX_HOME_ASSISTANT_RESPONSE_BYTES,
  testConnection
};
