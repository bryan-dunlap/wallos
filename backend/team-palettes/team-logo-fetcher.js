const net = require("node:net");
const {
  MAX_ENCODED_BYTES,
  SUPPORTED_CONTENT_TYPES
} = require("./team-image-decoder");

const DEFAULT_LOGO_FETCH_TIMEOUT_MS = 10 * 1000;
const DEFAULT_LOGO_REDIRECT_LIMIT = 3;
const TRUSTED_LOGO_HOSTS = new Set([
  "a.espncdn.com",
  "www.mlbstatic.com"
]);

class TeamLogoFetcher {
  constructor({
    fetchImpl = globalThis.fetch,
    timeoutMs = DEFAULT_LOGO_FETCH_TIMEOUT_MS,
    maxBytes = MAX_ENCODED_BYTES,
    redirectLimit = DEFAULT_LOGO_REDIRECT_LIMIT,
    trustedHosts = TRUSTED_LOGO_HOSTS
  } = {}) {
    this.fetchImpl = fetchImpl;
    this.timeoutMs = timeoutMs;
    this.maxBytes = maxBytes;
    this.redirectLimit = redirectLimit;
    this.trustedHosts = new Set(trustedHosts);
  }

  normalizeUrl(value) {
    if (typeof value !== "string" || !value.trim()) return null;

    try {
      const url = new URL(value.trim());
      const hostname = url.hostname.toLowerCase();

      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        (url.port && url.port !== "443") ||
        net.isIP(hostname) !== 0 ||
        isLocalHostname(hostname) ||
        !this.trustedHosts.has(hostname)
      ) {
        return null;
      }

      url.hash = "";
      url.hostname = hostname;
      return url.toString();
    } catch {
      return null;
    }
  }

  async fetch(logoUrl, { etag, lastModified } = {}) {
    const normalizedUrl = this.normalizeUrl(logoUrl);
    if (!normalizedUrl || typeof this.fetchImpl !== "function") {
      return failure("invalid_url");
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      return await this.fetchRedirects(normalizedUrl, {
        etag,
        lastModified,
        signal: controller.signal
      });
    } catch (error) {
      return failure(error?.name === "AbortError" ? "timeout" : "network_error");
    } finally {
      clearTimeout(timer);
    }
  }

  async fetchRedirects(initialUrl, { etag, lastModified, signal }) {
    let currentUrl = initialUrl;

    for (let redirects = 0; redirects <= this.redirectLimit; redirects += 1) {
      const headers = {
        accept: "image/png, image/svg+xml, image/webp, image/jpeg, image/gif"
      };
      if (currentUrl === initialUrl) {
        if (etag) headers["if-none-match"] = etag;
        if (lastModified) headers["if-modified-since"] = lastModified;
      }

      const response = await this.fetchImpl(currentUrl, {
        headers,
        redirect: "manual",
        signal
      });

      if (isRedirect(response.status)) {
        if (redirects === this.redirectLimit) return failure("redirect_limit");

        const location = response.headers?.get?.("location");
        let redirected;
        try {
          redirected = new URL(location, currentUrl).toString();
        } catch {
          return failure("invalid_redirect");
        }
        currentUrl = this.normalizeUrl(redirected);
        if (!currentUrl) return failure("invalid_redirect");
        continue;
      }

      if (response.status === 304) {
        return {
          ok: true,
          notModified: true,
          finalUrl: currentUrl,
          etag: response.headers?.get?.("etag") || etag || null,
          lastModified:
            response.headers?.get?.("last-modified") || lastModified || null
        };
      }

      if (!response.ok) return failure("http_error");

      const contentType = normalizeContentType(
        response.headers?.get?.("content-type")
      );
      if (!SUPPORTED_CONTENT_TYPES.has(contentType)) {
        return failure("unsupported_content_type");
      }

      const declaredLength = Number(response.headers?.get?.("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > this.maxBytes) {
        return failure("response_too_large");
      }

      const bytes = await readBoundedBody(response, this.maxBytes);
      if (!bytes) return failure("response_too_large");

      return {
        ok: true,
        notModified: false,
        bytes,
        contentType,
        finalUrl: currentUrl,
        etag: response.headers?.get?.("etag") || null,
        lastModified: response.headers?.get?.("last-modified") || null
      };
    }

    return failure("redirect_limit");
  }
}

async function readBoundedBody(response, maxBytes) {
  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks = [];
    let length = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        length += value.byteLength;
        if (length > maxBytes) {
          await reader.cancel().catch(() => {});
          return null;
        }
        chunks.push(Buffer.from(value));
      }
    } finally {
      reader.releaseLock?.();
    }

    return Buffer.concat(chunks, length);
  }

  const bytes = Buffer.from(await response.arrayBuffer());
  return bytes.length <= maxBytes ? bytes : null;
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function normalizeContentType(value) {
  return typeof value === "string"
    ? value.split(";", 1)[0].trim().toLowerCase()
    : "";
}

function isLocalHostname(hostname) {
  return hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local");
}

function failure(reasonCode) {
  return { ok: false, reasonCode };
}

module.exports = {
  DEFAULT_LOGO_FETCH_TIMEOUT_MS,
  DEFAULT_LOGO_REDIRECT_LIMIT,
  TRUSTED_LOGO_HOSTS,
  TeamLogoFetcher,
  readBoundedBody
};
