const ESPN_SITE_API_ROOT =
  "https://site.api.espn.com/apis/site/v2/sports";
const DEFAULT_ESPN_TIMEOUT_MS = 10 * 1000;

function toEspnDate(date) {
  return String(date || "").replaceAll("-", "");
}

function buildEspnUrl({ sport, league, resource }) {
  const normalizedSport = encodeURIComponent(String(sport || "").trim());
  const normalizedLeague = encodeURIComponent(String(league || "").trim());

  if (!normalizedSport || !normalizedLeague) {
    throw new Error("ESPN sport and league are required.");
  }

  return `${ESPN_SITE_API_ROOT}/${normalizedSport}/${normalizedLeague}/${resource}`;
}

function createTimeoutSignal(timeoutMs) {
  return typeof AbortSignal?.timeout === "function" && timeoutMs > 0
    ? AbortSignal.timeout(timeoutMs)
    : undefined;
}

async function fetchEspnJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;

  if (typeof fetchImpl !== "function") {
    throw new Error("ESPN fetch is unavailable.");
  }

  const signal = options.signal || createTimeoutSignal(
    options.timeoutMs ?? DEFAULT_ESPN_TIMEOUT_MS
  );
  const response = await fetchImpl(url, {
    headers: { accept: "application/json" },
    ...(signal ? { signal } : {})
  });

  if (!response.ok) {
    throw new Error(
      `${options.requestName || "ESPN request"} failed: ${response.status}`
    );
  }

  return response.json();
}

async function fetchScoreboard({
  sport,
  league,
  date,
  fetchImpl,
  timeoutMs,
  signal
}) {
  const query = new URLSearchParams({ dates: toEspnDate(date) });
  const url = `${buildEspnUrl({
    sport,
    league,
    resource: "scoreboard"
  })}?${query}`;

  return fetchEspnJson(url, {
    fetchImpl,
    timeoutMs,
    signal,
    requestName: `ESPN ${String(league).toUpperCase()} scoreboard request`
  });
}

async function fetchSummary({
  sport,
  league,
  eventId,
  fetchImpl,
  timeoutMs,
  signal
}) {
  const query = new URLSearchParams({ event: String(eventId || "") });
  const url = `${buildEspnUrl({
    sport,
    league,
    resource: "summary"
  })}?${query}`;

  return fetchEspnJson(url, {
    fetchImpl,
    timeoutMs,
    signal,
    requestName: `ESPN ${String(league).toUpperCase()} summary request`
  });
}

function toNullableNumber(value) {
  if (value === null || value === undefined || value === "") return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

module.exports = {
  DEFAULT_ESPN_TIMEOUT_MS,
  fetchScoreboard,
  fetchSummary,
  toEspnDate,
  toNullableNumber
};
