const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RedditDiscoveryAdapter
} = require("../../backend/discovery/reddit-discovery-adapter");

test("the default Reddit source produces normalized Discovery items", async () => {
  const adapter = new RedditDiscoveryAdapter({
    loadPosts: async () => [{
      title: "A Reddit discovery",
      subreddit: "r/test",
      link: "https://reddit.com/r/test/comments/1/post",
      body: "OP-provided context",
      image: "https://example.com/image.jpg",
      author: "u/private-source-field"
    }]
  });
  const [item] = await adapter.getItems({
    id: "discovery-reddit-default",
    name: "Reddit Mix"
  });

  assert.equal(item.type, "image");
  assert.equal(item.source, "reddit");
  assert.equal(item.eyebrow, "r/test");
  assert.equal(item.body, "OP-provided context");
  assert.equal("author" in item, false);
  assert.equal(JSON.stringify(item).includes("comments/1"), false);
});
