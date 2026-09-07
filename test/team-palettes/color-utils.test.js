const test = require("node:test");
const assert = require("node:assert/strict");
const {
  chooseTextColor,
  contrastRatio,
  deriveRelatedColor,
  isNearBlack,
  isNearWhite,
  normalizeHex,
  perceptualDistance,
  relativeLuminance
} = require("../../backend/team-palettes/color-utils");

test("normalizes six-digit sRGB hex without accepting ambiguous forms", () => {
  assert.equal(normalizeHex("  #0a7bcf "), "#0A7BCF");
  assert.equal(normalizeHex("0a7bcf"), "#0A7BCF");
  assert.equal(normalizeHex("#abc"), null);
  assert.equal(normalizeHex("not-a-color"), null);
});

test("relative luminance and contrast use the WCAG sRGB calculation", () => {
  assert.equal(relativeLuminance("#000000"), 0);
  assert.equal(relativeLuminance("#FFFFFF"), 1);
  assert.equal(contrastRatio("#000000", "#FFFFFF"), 21);
});

test("text selection chooses a black or white value above 4.5:1", () => {
  for (const background of ["#002244", "#69BE28", "#D71920", "#FDB927"]) {
    const text = chooseTextColor(background);
    assert.ok(["#000000", "#FFFFFF"].includes(text));
    assert.ok(contrastRatio(background, text) >= 4.5);
  }
});

test("perceptual utilities classify extremes and preserve hue in derivatives", () => {
  assert.equal(isNearWhite("#FFFFFF"), true);
  assert.equal(isNearBlack("#000000"), true);
  assert.ok(perceptualDistance("#0057B8", "#075DBD") < 0.04);
  assert.ok(perceptualDistance("#0057B8", "#FDB927") > 0.2);

  const related = deriveRelatedColor("#0057B8", {
    lightnessDelta: 0.2,
    chromaScale: 0.9
  });
  assert.match(related, /^#[0-9A-F]{6}$/);
  assert.ok(perceptualDistance("#0057B8", related) > 0.1);
});
