const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");
const { contrastRatio, perceptualDistance } = require(
  "../../backend/team-palettes/color-utils"
);
const {
  MAX_ENCODED_BYTES
} = require("../../backend/team-palettes/team-image-decoder");
const {
  TEAM_PALETTE_ALGORITHM_VERSION,
  TEAM_PALETTE_SCHEMA_VERSION,
  extractTeamPalette,
  mergeNearDuplicateCandidates
} = require("../../backend/team-palettes/team-palette-extractor");

const FIXTURE_ROOT = path.join(__dirname, "..", "fixtures", "team-palettes");

function fixture(name) {
  return fs.readFileSync(path.join(FIXTURE_ROOT, name));
}

function extract(name, options = {}) {
  return extractTeamPalette({
    bytes: fixture(name),
    contentType: name.endsWith(".svg") ? "image/svg+xml" : "image/png",
    teamId: "TEST:ONE",
    sourceIdentity: "sha256:fixture",
    ...options
  });
}

test("requires qualified team identity and nonempty source identity", async () => {
  assert.equal(await extract("one-color.svg", { teamId: "SEA" }), null);
  assert.equal(await extract("one-color.svg", { teamId: "" }), null);
  assert.equal(await extract("one-color.svg", { sourceIdentity: "" }), null);

  const palette = await extract("one-color.svg", { teamId: "nfl:sea" });
  assert.equal(palette.teamId, "NFL:SEA");
});

test("identical image bytes produce an identical palette", async () => {
  const first = await extract("transparent-duotone.svg");
  const second = await extract("transparent-duotone.svg");
  assert.deepEqual(first, second);
});

test("transparent dark and bright artwork retains both useful colors", async () => {
  const palette = await extract("transparent-duotone.svg");
  assert.equal(palette.primary, "#002244");
  assert.equal(palette.secondary, "#69BE28");
});

test("white-dominant and black-dominant logos ignore neutral backgrounds", async () => {
  const white = await extract("white-dominant.svg");
  const black = await extract("black-dominant.svg");
  assert.equal(white.primary, "#D71920");
  assert.equal(black.primary, "#FDB927");
});

test("multicolor extraction selects three perceptually distinct colors", async () => {
  const palette = await extract("multicolor.svg");
  assert.equal(palette.primary, "#552583");
  assert.equal(palette.secondary, "#FDB927");
  assert.equal(palette.accent, "#00843D");
  assert.ok(perceptualDistance(palette.primary, palette.secondary) >= 0.08);
  assert.ok(perceptualDistance(palette.secondary, palette.accent) >= 0.08);
});

test("one-color artwork derives related secondary and accent colors", async () => {
  const palette = await extract("one-color.svg");
  assert.equal(palette.primary, "#0057B8");
  assert.notEqual(palette.secondary, palette.primary);
  assert.notEqual(palette.accent, palette.primary);
  assert.match(palette.secondary, /^#[0-9A-F]{6}$/);
  assert.match(palette.accent, /^#[0-9A-F]{6}$/);
});

test("grayscale artwork is rejected as unusable", async () => {
  assert.equal(await extract("grayscale.svg"), null);
});

test("semi-transparent edge colors do not displace the opaque brand color", async () => {
  const palette = await extract("antialiased-edges.svg");
  assert.equal(palette.primary, "#007A33");
});

test("tiny valid artwork remains usable", async () => {
  const palette = await extract("tiny.svg");
  assert.equal(palette.primary, "#C8102E");
});

test("near-identical candidates merge deterministically", () => {
  const candidates = [
    { hex: "#0057B8", lab: require("../../backend/team-palettes/color-utils").rgbToOklab("#0057B8"), weight: 10, score: 15 },
    { hex: "#075DBD", lab: require("../../backend/team-palettes/color-utils").rgbToOklab("#075DBD"), weight: 4, score: 5 },
    { hex: "#FDB927", lab: require("../../backend/team-palettes/color-utils").rgbToOklab("#FDB927"), weight: 8, score: 12 }
  ];
  const merged = mergeNearDuplicateCandidates(candidates);
  assert.equal(merged.length, 2);
  assert.equal(merged.find((entry) => entry.hex === "#0057B8").weight, 14);
});

test("every emitted primary has safe black or white text contrast", async () => {
  for (const name of [
    "transparent-duotone.svg",
    "white-dominant.svg",
    "black-dominant.svg",
    "one-color.svg",
    "multicolor.svg",
    "antialiased-edges.svg",
    "tiny.svg"
  ]) {
    const palette = await extract(name);
    assert.ok(contrastRatio(palette.primary, palette.textOnPrimary) >= 4.5);
  }
});

test("malformed, mismatched, and oversized encoded inputs fail safely", async () => {
  assert.equal(await extract("malformed.bin"), null);
  assert.equal(await extract("one-color.svg", { contentType: "text/plain" }), null);
  assert.equal(await extractTeamPalette({
    bytes: Buffer.alloc(MAX_ENCODED_BYTES + 1),
    contentType: "image/png",
    teamId: "TEST:ONE",
    sourceIdentity: "sha256:large"
  }), null);
});

test("oversized decoded dimensions fail before pixel analysis", async () => {
  assert.equal(await extract("oversized.svg"), null);
});

test("PNG raster bytes pass through the same byte-only boundary", async () => {
  const png = await sharp(fixture("transparent-duotone.svg")).png().toBuffer();
  const palette = await extractTeamPalette({
    bytes: png,
    contentType: "image/png",
    teamId: "TEST:PNG",
    sourceIdentity: "sha256:png"
  });
  assert.equal(palette.primary, "#002244");
  assert.equal(palette.secondary, "#69BE28");

  assert.equal(await extractTeamPalette({
    bytes: png,
    contentType: "image/svg+xml",
    teamId: "TEST:PNG",
    sourceIdentity: "sha256:png"
  }), null);
});

test("contract versions and public fields are explicit and small", async () => {
  const palette = await extract("one-color.svg");
  assert.equal(palette.schemaVersion, TEAM_PALETTE_SCHEMA_VERSION);
  assert.equal(palette.algorithmVersion, TEAM_PALETTE_ALGORITHM_VERSION);
  assert.deepEqual(Object.keys(palette), [
    "schemaVersion",
    "algorithmVersion",
    "teamId",
    "primary",
    "secondary",
    "accent",
    "textOnPrimary",
    "source"
  ]);
  assert.deepEqual(palette.source, {
    type: "logo",
    identity: "sha256:fixture"
  });
});

test("the same abbreviation remains independent across qualified leagues", async () => {
  const nfl = await extract("one-color.svg", { teamId: "NFL:SEA" });
  const mlb = await extract("one-color.svg", { teamId: "MLB:SEA" });
  assert.equal(nfl.teamId, "NFL:SEA");
  assert.equal(mlb.teamId, "MLB:SEA");
  assert.deepEqual(
    { ...nfl, teamId: null },
    { ...mlb, teamId: null }
  );
});

test("palette core has no sports, network, filesystem, or presentation imports", () => {
  const sources = ["color-utils.js", "team-image-decoder.js", "team-palette-extractor.js"]
    .map((name) => fs.readFileSync(path.join(
      __dirname,
      "..",
      "..",
      "backend",
      "team-palettes",
      name
    ), "utf8"))
    .join("\n");

  assert.doesNotMatch(sources, /sports|gamecast|hero|frontend/i);
  assert.doesNotMatch(sources, /require\(["'](?:node:)?(?:fs|http|https|net)/);
  assert.doesNotMatch(sources, /\bfetch\s*\(/);
});
