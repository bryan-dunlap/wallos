function isRedditFeedUrl(value) {
  try {
    const hostname = new URL(value).hostname.toLowerCase();
    return hostname === "reddit.com" || hostname.endsWith(".reddit.com");
  } catch {
    return false;
  }
}

function parseRedditDiscoveryFeed(xml, source) {
  return parseRedditFeed(xml).map((post) => ({
    id: `${source.id}:${hashIdentity(post.link || post.title)}`,
    type: post.image ? "image" : "text",
    source: "reddit",
    eyebrow: post.subreddit || source.name,
    title: post.title,
    ...(post.body ? { body: post.body } : {}),
    ...(post.image ? {
      media: {
        url: post.image,
        alt: post.title
      }
    } : {})
  }));
}

function parseRedditFeed(xml) {
  if (typeof xml !== "string") return [];

  const entries = xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];

  return entries
    .map((entry) => {
      const title = stripTags(getXmlTag(entry, "title"));
      const link = getEntryLink(entry);
      const authorBlock = getXmlTag(entry, "author");
      const author = stripTags(getXmlTag(authorBlock, "name"));
      const published = getXmlTag(entry, "published");
      const updated = getXmlTag(entry, "updated");
      const content = getXmlTag(entry, "content");

      return {
        title,
        link,
        subreddit: getSubredditFromLink(link),
        author,
        publishedAt: published || updated || null,
        image: getImageFromContent(content),
        body: getBodyFromContent(content, title)
      };
    })
    .filter((post) => post.title && post.link)
    .slice(0, 25);
}

function decodeEntities(value = "") {
  return value
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

function stripTags(value = "") {
  return decodeEntities(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function getXmlTag(block, tagName) {
  const pattern = new RegExp(
    `<${tagName}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tagName}>`,
    "i"
  );
  const match = block.match(pattern);

  return match ? decodeEntities(match[1]).trim() : "";
}

function getEntryLink(entry) {
  const alternateLink = entry.match(
    /<link[^>]*rel=["']alternate["'][^>]*href=["']([^"']+)["']/i
  );

  if (alternateLink) return decodeEntities(alternateLink[1]);

  const anyLink = entry.match(
    /<link[^>]*href=["']([^"']+)["']/i
  );

  return anyLink ? decodeEntities(anyLink[1]) : "";
}

function getImageFromContent(content) {
  const imageMatch = decodeEntities(content).match(
    /<img[^>]+src=["']([^"']+)["']/i
  );

  if (!imageMatch) return null;

  const imageUrl = decodeEntities(imageMatch[1]);

  return imageUrl.includes("redditstatic.com/icon") ||
    imageUrl.includes("redditstatic.com/avatars")
    ? null
    : imageUrl;
}

function getBodyFromContent(content, title) {
  const bodyMatch = decodeEntities(content).match(
    /<div[^>]*class=["'][^"']*\bmd\b[^"']*["'][^>]*>([\s\S]*?)<\/div>/i
  );

  if (!bodyMatch) return null;

  const body = stripTags(bodyMatch[1]);

  return !body || sameText(body, title) ? null : body;
}

function getSubredditFromLink(link) {
  const match = link.match(/reddit\.com\/r\/([^/]+)/i);
  return match ? `r/${match[1]}` : "Reddit";
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

module.exports = {
  isRedditFeedUrl,
  parseRedditDiscoveryFeed,
  parseRedditFeed
};
