const {
  chooseTextColor,
  deriveRelatedColor,
  isNearBlack,
  isNearWhite,
  perceptualDistance,
  rgbToHex,
  rgbToOklab
} = require("./color-utils");
const { decodeTeamLogo } = require("./team-image-decoder");

const TEAM_PALETTE_SCHEMA_VERSION = 1;
const TEAM_PALETTE_ALGORITHM_VERSION = 1;
const MIN_ALPHA = 96;
const MIN_CHROMA = 0.035;
const MIN_CLUSTER_DISTANCE = 0.08;
const QUALIFIED_TEAM_ID = /^[A-Z0-9][A-Z0-9_-]*:[A-Z0-9][A-Z0-9_-]*$/;

async function extractTeamPalette({
  bytes,
  contentType,
  teamId,
  sourceIdentity
} = {}) {
  const normalizedTeamId = normalizeTeamId(teamId);
  const normalizedSourceIdentity = normalizeSourceIdentity(sourceIdentity);
  if (!normalizedTeamId || !normalizedSourceIdentity) return null;

  const decoded = await decodeTeamLogo(bytes, contentType);
  if (!decoded) return null;

  const candidates = buildCandidates(decoded);
  if (candidates.length === 0) return null;

  const primary = candidates[0].hex;
  const secondaryCandidate = candidates.find(
    (candidate) => perceptualDistance(candidate.lab, candidates[0].lab) >=
      MIN_CLUSTER_DISTANCE
  );
  const secondary = secondaryCandidate?.hex || deriveRelatedColor(primary, {
    lightnessDelta: candidates[0].lab.l < 0.58 ? 0.2 : -0.18,
    chromaScale: 0.9
  });
  const accentCandidate = candidates.find((candidate) =>
    candidate.hex !== secondary &&
    perceptualDistance(candidate.hex, primary) >= MIN_CLUSTER_DISTANCE &&
    perceptualDistance(candidate.hex, secondary) >= MIN_CLUSTER_DISTANCE
  );
  const accent = accentCandidate?.hex || deriveRelatedColor(primary, {
    lightnessDelta: candidates[0].lab.l < 0.55 ? 0.36 : -0.32,
    chromaScale: 0.65
  });
  const textOnPrimary = chooseTextColor(primary);

  if (!secondary || !accent || !textOnPrimary) return null;

  return {
    schemaVersion: TEAM_PALETTE_SCHEMA_VERSION,
    algorithmVersion: TEAM_PALETTE_ALGORITHM_VERSION,
    teamId: normalizedTeamId,
    primary,
    secondary,
    accent,
    textOnPrimary,
    source: {
      type: "logo",
      identity: normalizedSourceIdentity
    }
  };
}

function buildCandidates({ data, width, height, channels }) {
  if (channels !== 4 || data.length !== width * height * channels) return [];

  const bins = new Map();
  let eligibleWeight = 0;

  for (let index = 0; index < data.length; index += 4) {
    const alpha = data[index + 3];
    if (alpha < MIN_ALPHA) continue;

    const color = { r: data[index], g: data[index + 1], b: data[index + 2] };
    const lab = rgbToOklab(color);
    const chroma = Math.hypot(lab.a, lab.b);
    if (
      chroma < MIN_CHROMA ||
      isNearWhite(color) ||
      isNearBlack(color)
    ) {
      continue;
    }

    const alphaWeight = (alpha / 255) ** 2;
    const key = [color.r, color.g, color.b]
      .map((channel) => Math.round(channel / 16))
      .join(":");
    const bin = bins.get(key) || {
      weight: 0,
      red: 0,
      green: 0,
      blue: 0
    };
    bin.weight += alphaWeight;
    bin.red += color.r * alphaWeight;
    bin.green += color.g * alphaWeight;
    bin.blue += color.b * alphaWeight;
    bins.set(key, bin);
    eligibleWeight += alphaWeight;
  }

  if (eligibleWeight < 1) return [];

  const candidates = [...bins.values()].map((bin) => {
    const rgb = {
      r: bin.red / bin.weight,
      g: bin.green / bin.weight,
      b: bin.blue / bin.weight
    };
    const lab = rgbToOklab(rgb);
    const chroma = Math.hypot(lab.a, lab.b);
    const usefulLightness = Math.max(0.2, 1 - Math.abs(lab.l - 0.55));

    return {
      hex: rgbToHex(rgb),
      lab,
      weight: bin.weight,
      score: bin.weight * (0.6 + chroma * 2.5) * usefulLightness
    };
  }).filter((candidate) => candidate.weight / eligibleWeight >= 0.002);

  candidates.sort(compareCandidates);
  return mergeNearDuplicateCandidates(candidates);
}

function mergeNearDuplicateCandidates(candidates, distance = 0.035) {
  const merged = [];

  for (const candidate of candidates) {
    const existing = merged.find(
      (entry) => perceptualDistance(entry.lab, candidate.lab) < distance
    );

    if (!existing) {
      merged.push({ ...candidate });
      continue;
    }

    existing.weight += candidate.weight;
    existing.score += candidate.score;
  }

  return merged.sort(compareCandidates);
}

function compareCandidates(first, second) {
  return second.score - first.score || first.hex.localeCompare(second.hex);
}

function normalizeTeamId(value) {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  return QUALIFIED_TEAM_ID.test(normalized) ? normalized : null;
}

function normalizeSourceIdentity(value) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

module.exports = {
  TEAM_PALETTE_ALGORITHM_VERSION,
  TEAM_PALETTE_SCHEMA_VERSION,
  buildCandidates,
  extractTeamPalette,
  mergeNearDuplicateCandidates,
  normalizeTeamId
};
