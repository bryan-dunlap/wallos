class RedditDiscoveryAdapter {

  constructor({ loadPosts }) {
    this.type = "reddit";
    this.name = "Reddit";
    this.userAddable = false;
    this.loadPosts = loadPosts;
  }

  async getItems(source) {
    const posts = await this.loadPosts();

    return posts.reduce((items, post) => {
      const title = normalizeText(post?.title);
      const eyebrow = normalizeText(post?.subreddit) || source.name;
      const identity = normalizeText(post?.link) || title;
      const imageUrl = normalizeImageUrl(post?.image);
      const body = normalizeBody(post?.body, title);

      if (!title || !identity) return items;

      items.push({
        id: `${source.id}:${hashIdentity(identity)}`,
        type: imageUrl ? "image" : "text",
        source: "reddit",
        eyebrow,
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
}

function normalizeBody(value, title) {
  const body = normalizeText(value)
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  return body && !sameText(body, title) ? body : "";
}

function normalizeImageUrl(value) {
  const imageUrl = normalizeText(value);

  if (!imageUrl) return "";

  try {
    const url = new URL(imageUrl);
    return ["https:", "http:"].includes(url.protocol)
      ? url.href
      : "";
  } catch {
    return "";
  }
}

function normalizeText(value) {
  return typeof value === "string" ? value.trim() : "";
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

module.exports = { RedditDiscoveryAdapter };
