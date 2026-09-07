const express = require("express");

const TEAM_PALETTE_BATCH_LIMIT = 8;
const TEAM_PALETTE_REQUEST_LIMIT = "8kb";

function createTeamPaletteRouter({ resolver } = {}) {
  if (!resolver) throw new TypeError("Team palette router requires a resolver.");

  const router = express.Router();
  const jsonParser = express.json({
    limit: TEAM_PALETTE_REQUEST_LIMIT,
    strict: true,
    type: "application/json"
  });

  router.post(
    "/resolve",
    setNoStore,
    validateRequestOrigin,
    requireJsonContentType,
    jsonParser,
    async (req, res) => {
      const teams = req.body?.teams;
      if (!Array.isArray(teams) || teams.length > TEAM_PALETTE_BATCH_LIMIT) {
        return res.status(400).json({ status: "invalid_request" });
      }

      const results = await Promise.all(teams.map(async (team) => {
        const teamId = typeof team?.teamId === "string"
          ? team.teamId.trim().toUpperCase()
          : "";
        if (!teamId) return null;

        try {
          return [teamId, await resolver.resolve({
            teamId,
            logoUrl: team?.logoUrl
          })];
        } catch {
          return [teamId, null];
        }
      }));
      const palettes = {};

      for (const result of results) {
        if (!result) continue;
        const [teamId, palette] = result;
        palettes[teamId] = palette || null;
      }

      return res.json({ palettes });
    }
  );

  router.use((error, req, res, next) => {
    if (!error) return next();
    const status = error.type === "entity.too.large" ? 413 : 400;
    return res.status(status).json({ status: "invalid_request" });
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

module.exports = {
  TEAM_PALETTE_BATCH_LIMIT,
  TEAM_PALETTE_REQUEST_LIMIT,
  createTeamPaletteRouter,
  validateRequestOrigin
};
