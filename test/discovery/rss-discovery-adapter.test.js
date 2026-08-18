const test = require("node:test");
const assert = require("node:assert/strict");
const {
  RssDiscoveryAdapter,
  parseSyndicationFeed
} = require("../../backend/discovery/rss-discovery-adapter");

const SOURCE = {
  id: "technology",
  name: "Technology News",
  type: "rss",
  enabled: true,
  config: { url: "https://example.com/feed.xml" }
};

const ATOM_FIXTURE = `
<feed>
  <entry>
    <id>story-1</id>
    <title>Useful discovery</title>
    <link href="https://example.com/story-1" />
    <content><![CDATA[
      <p>A useful <strong>description</strong>.</p>
      <img src="https://example.com/image.jpg" />
    ]]></content>
  </entry>
</feed>`;

test("Atom entries normalize into provider-neutral image items", () => {
  const items = parseSyndicationFeed(ATOM_FIXTURE, SOURCE);

  assert.equal(items.length, 1);
  assert.equal(items[0].type, "image");
  assert.equal(items[0].source, "rss");
  assert.equal(items[0].eyebrow, "Technology News");
  assert.equal(items[0].body, "A useful description.");
  assert.deepEqual(items[0].media, {
    url: "https://example.com/image.jpg",
    alt: "Useful discovery"
  });
  assert.equal(JSON.stringify(items[0]).includes("feed.xml"), false);
});

test("RSS text entries omit duplicate descriptions", () => {
  const xml = `
    <rss><channel><item>
      <guid>story-2</guid>
      <title>Same title</title>
      <description><![CDATA[<p>Same title</p>]]></description>
    </item></channel></rss>`;
  const [item] = parseSyndicationFeed(xml, SOURCE);

  assert.equal(item.type, "text");
  assert.equal("body" in item, false);
});

test("a temporary source failure returns its last-known-good items", async () => {
  let shouldFail = false;
  const fetchImpl = async () => {
    if (shouldFail) throw new Error("offline");

    return {
      ok: true,
      headers: new Headers(),
      text: async () => ATOM_FIXTURE
    };
  };
  const adapter = new RssDiscoveryAdapter({
    fetchImpl,
    cacheMs: 0
  });
  const initial = await adapter.getItems(SOURCE);

  shouldFail = true;

  const stale = await adapter.getItems(SOURCE);

  assert.deepEqual(stale, initial);
});
