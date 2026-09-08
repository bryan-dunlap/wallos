const express = require("express");
const {
  testConnection
} = require("./home-assistant-client");
const {
  isHomeAssistantConfigured,
  normalizeHomeAssistantConfig
} = require("./home-assistant-config");
const {
  createUnavailableSnapshot,
  HomeAssistantStateCache,
  MAX_HOME_ASSISTANT_ENTITIES
} = require("./home-assistant-state-cache");

const HOME_ASSISTANT_REQUEST_LIMIT = "4kb";

function createHomeAssistantRouter({
  testConnectionImpl = testConnection,
  getStoredConfig = () => null,
  stateCache = new HomeAssistantStateCache()
} = {}) {
  const router = express.Router();
  const jsonParser = express.json({
    limit: HOME_ASSISTANT_REQUEST_LIMIT,
    strict: true,
    type: "application/json"
  });

  router.get("/entities", setNoStore, async (req, res) => {
    const unsupportedQuery = Object.keys(req.query).some(
      (key) => !["domain", "limit"].includes(key)
    );
    const domains = normalizeDomainFilter(req.query.domain);
    const limit = normalizeResponseLimit(req.query.limit);

    if (unsupportedQuery || domains === null || limit === null) {
      return res.status(400).json({ status: "invalid_request" });
    }

    const config = normalizeHomeAssistantConfig(getStoredConfig());

    if (!config.enabled) {
      return res.json(createUnavailableSnapshot("disabled"));
    }

    if (!isHomeAssistantConfigured(config)) {
      return res.json(createUnavailableSnapshot("unconfigured"));
    }

    let snapshot;

    try {
      snapshot = await stateCache.getSnapshot(config);
    } catch {
      snapshot = createUnavailableSnapshot();
    }

    return res.json(filterSnapshot(snapshot, domains, limit));
  });

  router.post(
    "/test-connection",
    setNoStore,
    validateRequestOrigin,
    requireJsonContentType,
    jsonParser,
    async (req, res) => {
      const baseUrl = req.body?.baseUrl;
      const useStoredAccessToken =
        req.body?.useStoredAccessToken === true;
      const draftAccessToken = req.body?.accessToken;
      const storedAccessToken = useStoredAccessToken
        ? getStoredConfig()?.accessToken
        : null;
      const accessToken = useStoredAccessToken
        ? storedAccessToken
        : draftAccessToken;

      if (
        typeof baseUrl !== "string" || !baseUrl.trim() ||
        (
          useStoredAccessToken &&
          typeof draftAccessToken !== "undefined"
        ) ||
        typeof accessToken !== "string" || !accessToken.trim()
      ) {
        return res.status(400).json({ status: "invalid_request" });
      }

      let result;

      try {
        result = await testConnectionImpl({ baseUrl, accessToken });
      } catch {
        result = { status: "unreachable" };
      }

      const status = normalizeConnectionStatus(result?.status);

      return res.status(getResultHttpStatus(status)).json({ status });
    }
  );

  router.use((error, req, res, next) => {
    if (!error) return next();

    if (error.type === "entity.too.large") {
      return res.status(413).json({ status: "invalid_request" });
    }

    if (error instanceof SyntaxError && error.status === 400) {
      return res.status(400).json({ status: "invalid_request" });
    }

    return res.status(400).json({ status: "invalid_request" });
  });

  return router;
}

function normalizeDomainFilter(value) {
  if (typeof value === "undefined") return [];

  const values = Array.isArray(value) ? value : [value];

  if (
    values.length === 0 ||
    values.length > 20 ||
    values.some((domain) =>
      typeof domain !== "string" ||
      !/^[a-z0-9_]+$/.test(domain)
    )
  ) {
    return null;
  }

  return [...new Set(values)];
}

function normalizeResponseLimit(value) {
  if (typeof value === "undefined") return MAX_HOME_ASSISTANT_ENTITIES;

  if (
    typeof value !== "string" ||
    !/^\d+$/.test(value) ||
    Number(value) < 1 ||
    Number(value) > MAX_HOME_ASSISTANT_ENTITIES
  ) {
    return null;
  }

  return Number(value);
}

function filterSnapshot(snapshot, domains, limit) {
  if (snapshot?.status !== "available") {
    return createUnavailableSnapshot(snapshot?.status || "unavailable");
  }

  const requestedDomains = new Set(domains);
  const filtered = domains.length === 0
    ? snapshot.entities
    : snapshot.entities.filter((entity) =>
      requestedDomains.has(entity.domain)
    );
  const total = domains.length === 0
    ? snapshot.total
    : domains.reduce(
      (sum, domain) => sum + (snapshot.domainTotals?.[domain] || 0),
      0
    );

  return {
    schemaVersion: 1,
    status: "available",
    entities: filtered.slice(0, limit),
    updatedAt: snapshot.updatedAt,
    stale: snapshot.stale === true,
    total,
    truncated:
      snapshot.truncated === true ||
      filtered.length > limit ||
      total > filtered.length
  };
}

function setNoStore(req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}

function validateRequestOrigin(req, res, next) {
  const origin = req.get("origin");

  if (!origin) return next();

  try {
    const expectedOrigin = `${req.protocol}://${req.get("host")}`;

    if (new URL(origin).origin === expectedOrigin) return next();
  } catch {}

  return res.status(403).json({ status: "forbidden" });
}

function requireJsonContentType(req, res, next) {
  if (req.is("application/json")) return next();

  return res.status(415).json({ status: "unsupported_media_type" });
}

function getResultHttpStatus(status) {
  if (status === "connected") return 200;
  if (status === "invalid_url") return 400;
  if (status === "unauthorized") return 401;
  if (status === "timeout") return 504;

  return 502;
}

function normalizeConnectionStatus(status) {
  return [
    "connected",
    "unauthorized",
    "invalid_url",
    "timeout",
    "unreachable",
    "upstream_error",
    "unexpected_response"
  ].includes(status)
    ? status
    : "upstream_error";
}

module.exports = {
  filterSnapshot,
  HOME_ASSISTANT_REQUEST_LIMIT,
  createHomeAssistantRouter,
  getResultHttpStatus,
  normalizeDomainFilter,
  normalizeConnectionStatus,
  normalizeResponseLimit,
  validateRequestOrigin
};
