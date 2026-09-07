const sharp = require("sharp");

const MAX_ENCODED_BYTES = 2 * 1024 * 1024;
const MAX_INPUT_DIMENSION = 4096;
const MAX_INPUT_PIXELS = 4 * 1024 * 1024;
const ANALYSIS_SIZE = 128;
const SUPPORTED_CONTENT_TYPES = new Set([
  "image/gif",
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp"
]);

async function decodeTeamLogo(bytes, contentType) {
  const input = normalizeBytes(bytes);
  const normalizedContentType = normalizeContentType(contentType);

  if (
    !input ||
    input.length === 0 ||
    input.length > MAX_ENCODED_BYTES ||
    !SUPPORTED_CONTENT_TYPES.has(normalizedContentType)
  ) {
    return null;
  }

  try {
    const image = sharp(input, {
      animated: false,
      failOn: "error",
      limitInputPixels: MAX_INPUT_PIXELS,
      sequentialRead: true
    });
    const metadata = await image.metadata();

    if (
      !contentTypeMatchesFormat(normalizedContentType, metadata.format) ||
      !Number.isInteger(metadata.width) ||
      !Number.isInteger(metadata.height) ||
      metadata.width < 1 ||
      metadata.height < 1 ||
      metadata.width > MAX_INPUT_DIMENSION ||
      metadata.height > MAX_INPUT_DIMENSION ||
      metadata.width * metadata.height > MAX_INPUT_PIXELS
    ) {
      return null;
    }

    const decoded = await image
      .resize(ANALYSIS_SIZE, ANALYSIS_SIZE, {
        fit: "inside",
        kernel: sharp.kernel.lanczos3,
        withoutEnlargement: true
      })
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (decoded.info.channels !== 4) return null;

    return {
      data: decoded.data,
      width: decoded.info.width,
      height: decoded.info.height,
      channels: decoded.info.channels,
      sourceWidth: metadata.width,
      sourceHeight: metadata.height,
      format: metadata.format
    };
  } catch {
    return null;
  }
}

function normalizeBytes(bytes) {
  if (Buffer.isBuffer(bytes)) return bytes;
  if (bytes instanceof Uint8Array) {
    return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  }
  return null;
}

function normalizeContentType(contentType) {
  return typeof contentType === "string"
    ? contentType.split(";", 1)[0].trim().toLowerCase()
    : "";
}

function contentTypeMatchesFormat(contentType, format) {
  return {
    "image/gif": "gif",
    "image/jpeg": "jpeg",
    "image/png": "png",
    "image/svg+xml": "svg",
    "image/webp": "webp"
  }[contentType] === format;
}

module.exports = {
  ANALYSIS_SIZE,
  MAX_ENCODED_BYTES,
  MAX_INPUT_DIMENSION,
  MAX_INPUT_PIXELS,
  SUPPORTED_CONTENT_TYPES,
  decodeTeamLogo
};
