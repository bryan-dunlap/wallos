const HEX_COLOR_PATTERN = /^#?([0-9A-F]{6})$/i;

function clamp(value, minimum = 0, maximum = 1) {
  return Math.min(maximum, Math.max(minimum, value));
}

function normalizeHex(value) {
  if (typeof value !== "string") return null;

  const match = value.trim().match(HEX_COLOR_PATTERN);
  return match ? `#${match[1].toUpperCase()}` : null;
}

function rgbToHex({ r, g, b }) {
  return `#${[r, g, b].map((channel) =>
    Math.round(clamp(channel, 0, 255))
      .toString(16)
      .padStart(2, "0")
      .toUpperCase()
  ).join("")}`;
}

function hexToRgb(value) {
  const hex = normalizeHex(value);
  if (!hex) return null;

  return {
    r: Number.parseInt(hex.slice(1, 3), 16),
    g: Number.parseInt(hex.slice(3, 5), 16),
    b: Number.parseInt(hex.slice(5, 7), 16)
  };
}

function srgbToLinear(channel) {
  const normalized = clamp(channel / 255);
  return normalized <= 0.04045
    ? normalized / 12.92
    : ((normalized + 0.055) / 1.055) ** 2.4;
}

function linearToSrgb(channel) {
  const value = channel <= 0.0031308
    ? channel * 12.92
    : 1.055 * channel ** (1 / 2.4) - 0.055;
  return value * 255;
}

function relativeLuminance(color) {
  const rgb = typeof color === "string" ? hexToRgb(color) : color;
  if (!rgb) return null;

  return 0.2126 * srgbToLinear(rgb.r) +
    0.7152 * srgbToLinear(rgb.g) +
    0.0722 * srgbToLinear(rgb.b);
}

function contrastRatio(first, second) {
  const firstLuminance = relativeLuminance(first);
  const secondLuminance = relativeLuminance(second);
  if (firstLuminance === null || secondLuminance === null) return null;

  const lighter = Math.max(firstLuminance, secondLuminance);
  const darker = Math.min(firstLuminance, secondLuminance);
  return (lighter + 0.05) / (darker + 0.05);
}

function chooseTextColor(background, minimumContrast = 4.5) {
  const whiteContrast = contrastRatio(background, "#FFFFFF");
  const blackContrast = contrastRatio(background, "#000000");
  if (whiteContrast === null || blackContrast === null) return null;

  const choice = whiteContrast >= blackContrast ? "#FFFFFF" : "#000000";
  return Math.max(whiteContrast, blackContrast) >= minimumContrast
    ? choice
    : null;
}

function rgbToOklab(color) {
  const rgb = typeof color === "string" ? hexToRgb(color) : color;
  if (!rgb) return null;

  const red = srgbToLinear(rgb.r);
  const green = srgbToLinear(rgb.g);
  const blue = srgbToLinear(rgb.b);
  const l = 0.4122214708 * red + 0.5363325363 * green + 0.0514459929 * blue;
  const m = 0.2119034982 * red + 0.6806995451 * green + 0.1073969566 * blue;
  const s = 0.0883024619 * red + 0.2817188376 * green + 0.6299787005 * blue;
  const lRoot = Math.cbrt(l);
  const mRoot = Math.cbrt(m);
  const sRoot = Math.cbrt(s);

  return {
    l: 0.2104542553 * lRoot + 0.793617785 * mRoot - 0.0040720468 * sRoot,
    a: 1.9779984951 * lRoot - 2.428592205 * mRoot + 0.4505937099 * sRoot,
    b: 0.0259040371 * lRoot + 0.7827717662 * mRoot - 0.808675766 * sRoot
  };
}

function oklabToRgb({ l, a, b }) {
  const lRoot = l + 0.3963377774 * a + 0.2158037573 * b;
  const mRoot = l - 0.1055613458 * a - 0.0638541728 * b;
  const sRoot = l - 0.0894841775 * a - 1.291485548 * b;
  const lLinear = lRoot ** 3;
  const mLinear = mRoot ** 3;
  const sLinear = sRoot ** 3;

  return {
    r: linearToSrgb(
      4.0767416621 * lLinear - 3.3077115913 * mLinear + 0.2309699292 * sLinear
    ),
    g: linearToSrgb(
      -1.2684380046 * lLinear + 2.6097574011 * mLinear - 0.3413193965 * sLinear
    ),
    b: linearToSrgb(
      -0.0041960863 * lLinear - 0.7034186147 * mLinear + 1.707614701 * sLinear
    )
  };
}

function oklabToOklch({ l, a, b }) {
  return {
    l,
    c: Math.hypot(a, b),
    h: Math.atan2(b, a)
  };
}

function oklchToOklab({ l, c, h }) {
  return { l, a: c * Math.cos(h), b: c * Math.sin(h) };
}

function perceptualDistance(first, second) {
  const a = typeof first === "string" ? rgbToOklab(first) : first;
  const b = typeof second === "string" ? rgbToOklab(second) : second;
  if (!a || !b) return Number.POSITIVE_INFINITY;

  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

function isNearWhite(color, threshold = 0.94) {
  const lab = rgbToOklab(color);
  return Boolean(lab && lab.l >= threshold);
}

function isNearBlack(color, threshold = 0.09) {
  const lab = rgbToOklab(color);
  return Boolean(lab && lab.l <= threshold);
}

function deriveRelatedColor(color, { lightnessDelta = 0, chromaScale = 1 } = {}) {
  const lab = rgbToOklab(color);
  if (!lab) return null;

  const lch = oklabToOklch(lab);
  const target = {
    l: clamp(lch.l + lightnessDelta, 0.2, 0.88),
    c: clamp(lch.c * chromaScale, 0.04, 0.28),
    h: lch.h
  };

  for (let chroma = target.c; chroma >= 0; chroma -= 0.01) {
    const rgb = oklabToRgb(oklchToOklab({ ...target, c: chroma }));
    if ([rgb.r, rgb.g, rgb.b].every((channel) =>
      Number.isFinite(channel) && channel >= 0 && channel <= 255
    )) {
      return rgbToHex(rgb);
    }
  }

  return rgbToHex(oklabToRgb(oklchToOklab({ ...target, c: 0 })));
}

module.exports = {
  chooseTextColor,
  contrastRatio,
  deriveRelatedColor,
  hexToRgb,
  isNearBlack,
  isNearWhite,
  normalizeHex,
  perceptualDistance,
  relativeLuminance,
  rgbToHex,
  rgbToOklab
};
