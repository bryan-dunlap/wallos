const express = require("express");
const {
  testConnection
} = require("./home-assistant-client");

const HOME_ASSISTANT_REQUEST_LIMIT = "4kb";

function createHomeAssistantRouter({
  testConnectionImpl = testConnection
} = {}) {
  const router = express.Router();
  const jsonParser = express.json({
    limit: HOME_ASSISTANT_REQUEST_LIMIT,
    strict: true,
    type: "application/json"
  });

  router.post(
    "/test-connection",
    setNoStore,
    validateRequestOrigin,
    requireJsonContentType,
    jsonParser,
    async (req, res) => {
      const baseUrl = req.body?.baseUrl;
      const accessToken = req.body?.accessToken;

      if (
        typeof baseUrl !== "string" || !baseUrl.trim() ||
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
  HOME_ASSISTANT_REQUEST_LIMIT,
  createHomeAssistantRouter,
  getResultHttpStatus,
  normalizeConnectionStatus,
  validateRequestOrigin
};
