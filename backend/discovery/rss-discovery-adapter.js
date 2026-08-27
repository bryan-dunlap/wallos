const DEFAULT_CACHE_MS = 15 * 60 * 1000;
const DEFAULT_TIMEOUT_MS = 10 * 1000;
const DEFAULT_RESPONSE_LIMIT_BYTES = 3 * 1024 * 1024;
const {
  isRedditFeedUrl,
  parseRedditDiscoveryFeed
} = require("./reddit-feed-parser");

class RssDiscoveryAdapter {

  constructor({
    fetchImpl = globalThis.fetch,
    cacheMs = DEFAULT_CACHE_MS,
    timeoutMs = DEFAULT_TIMEOUT_MS,
    responseLimitBytes = DEFAULT_RESPONSE_LIMIT_BYTES
  } = {}) {
    this.type = "rss";
    this.name = "RSS / Atom";
    this.userAddable = true;
    this.fetchImpl = fetchImpl;
    this.cacheMs = cacheMs;
    this.timeoutMs = timeoutMs;
    this.responseLimitBytes = responseLimitBytes;
    this.cache = new Map();
  }

  async getItems(source) {
    const cached = this.cache.get(source.id);

    if (cached && Date.now() - cached.timestamp < this.cacheMs) {
      return cached.items.map(cloneItem);
    }

    try {
      const xml = await this.fetchFeed(source.config.url);
      const items = isRedditFeedUrl(source.config.url)
        ? parseRedditDiscoveryFeed(xml, source)
        : parseSyndicationFeed(xml, source);

      if (items.length === 0) {
        throw new Error("Discovery feed has no usable entries.");
      }

      this.cache.set(source.id, {
        timestamp: Date.now(),
        items
      });

      return items.map(cloneItem);
    } catch (error) {
      if (cached?.items?.length) {
        return cached.items.map(cloneItem);
      }

      throw new Error("Discovery feed is unavailable.");
    }
  }

  async fetchFeed(url) {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.timeoutMs
    );

    try {
      const response = await this.fetchImpl(url, {
        headers: {
          Accept: "application/atom+xml, application/rss+xml, application/xml, text/xml"
        },
        signal: controller.signal
      });

      if (!response.ok) {
        throw new Error("Discovery feed request failed.");
      }

      const declaredLength = Number(
        response.headers.get("content-length")
      );

      if (
        Number.isFinite(declaredLength) &&
        declaredLength > this.responseLimitBytes
      ) {
        throw new Error("Discovery feed response is too large.");
      }

      const content = await response.text();

      if (Buffer.byteLength(content, "utf8") > this.responseLimitBytes) {
        throw new Error("Discovery feed response is too large.");
      }

      return content;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function parseSyndicationFeed(xml, source) {
  if (typeof xml !== "string") return [];

  const blocks = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) ||
    xml.match(/<item\b[\s\S]*?<\/item>/gi) || [];

  return blocks.slice(0, 30).reduce((items, block) => {
    const title = sanitizeText(getTag(block, "title"));
    const link = getLink(block);
    const identity = sanitizeText(getTag(block, "id")) ||
      sanitizeText(getTag(block, "guid")) || link || title;
    const rawBody = getTag(block, "content:encoded") ||
      getTag(block, "content") ||
      getTag(block, "description") ||
      getTag(block, "summary");
    const body = sanitizeBody(rawBody, title);
    const imageUrl = getImageUrl(block, rawBody);

    if (!title || !identity) return items;

    items.push({
      id: `${source.id}:${hashIdentity(identity)}`,
      type: imageUrl ? "image" : "text",
      source: "rss",
      eyebrow: source.name,
      title,
      ...(body ? { body } : {}),
      ...(imageUrl ? {
        media: {
          url: imageUrl,
          alt: title
        }
      } : {})
    });

    return items;
  }, []);
}

function getTag(block, tagName) {
  const escapedName = tagName.replace(":", "\\:");
  const match = block.match(new RegExp(
    `<${escapedName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${escapedName}>`,
    "i"
  ));

  return match ? decodeEntities(match[1]) : "";
}

function getLink(block) {
  const atomLink = block.match(
    /<link[^>]*href=["']([^"']+)["'][^>]*>/i
  );

  return atomLink
    ? decodeEntities(atomLink[1]).trim()
    : sanitizeText(getTag(block, "link"));
}

function getImageUrl(block, rawBody) {
  const candidates = [
    block.match(/<media:(?:content|thumbnail)[^>]*url=["']([^"']+)["']/i)?.[1],
    block.match(/<enclosure[^>]*type=["']image\/[^"']+["'][^>]*url=["']([^"']+)["']/i)?.[1],
    block.match(/<enclosure[^>]*url=["']([^"']+)["'][^>]*type=["']image\/[^"']+["']/i)?.[1],
    decodeEntities(rawBody).match(/<img[^>]*src=["']([^"']+)["']/i)?.[1]
  ];

  for (const candidate of candidates) {
    if (!candidate) continue;

    try {
      const url = new URL(decodeEntities(candidate));
      if (["https:", "http:"].includes(url.protocol)) return url.href;
    } catch {}
  }

  return "";
}

function sanitizeBody(value, title) {
  const body = sanitizeText(value);
  return body && !sameText(body, title) ? body : "";
}

function sanitizeText(value) {
  return decodeEntities(value)
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?;:])/g, "$1")
    .trim();
}

function decodeEntities(value = "") {
  return String(value)
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&");
}

function sameText(first, second) {
  return first.localeCompare(second, undefined, {
    sensitivity: "base"
  }) === 0;
}

function hashIdentity(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}

function cloneItem(item) {
  return structuredClone(item);
}

module.exports = {
  RssDiscoveryAdapter,
  parseSyndicationFeed
};
