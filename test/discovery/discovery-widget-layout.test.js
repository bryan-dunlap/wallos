const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");

const widgetSource = fs.readFileSync(
  path.join(
    __dirname,
    "..",
    "..",
    "frontend",
    "widgets",
    "discovery-widget.js"
  ),
  "utf8"
);
const stylesheet = fs.readFileSync(
  path.join(__dirname, "..", "..", "frontend", "css", "main.css"),
  "utf8"
);
const context = {};

vm.runInNewContext(
  widgetSource + "; this.DiscoveryWidget = DiscoveryWidget;",
  context
);

test("Discovery title height rounds down to complete line boxes", () => {
  const widget = new context.DiscoveryWidget();

  assert.equal(widget.calculateWholeLineHeight(181, 31.25), 156.25);
  assert.equal(widget.calculateWholeLineHeight(168, 33.6), 168);
  assert.equal(widget.calculateWholeLineHeight(20, 24), 0);
});

test("Discovery title clipping is shared and only applied on overflow", () => {
  assert.match(
    widgetSource,
    /\.discovery-text-headline, \.discovery-image-headline/
  );
  assert.match(
    widgetSource,
    /title\.scrollHeight <= allocatedHeight \+ 0\.5[\s\S]*return/
  );
  assert.match(
    widgetSource,
    /title\.style\.maxHeight = visibleHeight \+ "px"/
  );
});

test("Discovery title clipping recalculates on resize and font loading", () => {
  assert.match(
    widgetSource,
    /this\.titleResizeObserver\.observe\(this\.element\)/
  );
  assert.match(widgetSource, /document\.fonts\?\.ready/);
  assert.match(
    widgetSource,
    /if \(this\.titleLayoutFrame !== null\) return/
  );
  assert.match(
    widgetSource,
    /window\.cancelAnimationFrame\(this\.titleLayoutFrame\)/
  );
  assert.match(
    widgetSource,
    /this\.titleResizeObserver\.observe\(title\.parentElement\)/
  );
});

test("Discovery reserves source and counter tracks around flexible content", () => {
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-item-text\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/s
  );
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-image-caption\s*\{[^}]*display:\s*grid;[^}]*grid-template-rows:\s*auto minmax\(0, 1fr\) auto;/s
  );
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-content\s*\{[^}]*min-height:\s*0;[^}]*overflow:\s*hidden;/s
  );
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-item-text\s*\{[^}]*padding-block:\s*clamp\(6px, 1vh, 12px\);[^}]*padding-inline:\s*clamp\(14px, 2\.6vw, 38px\);/s
  );
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-image-caption\s*\{[^}]*padding:\s*clamp\(6px, 1vh, 12px\) 0;/s
  );
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-source\s*\{[^}]*margin-bottom:\s*6px;/s
  );
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-position\s*\{[^}]*margin-top:\s*6px;/s
  );
});

test("Discovery text and image items keep source and counter outside content clipping", () => {
  const widget = new context.DiscoveryWidget();
  const textMarkup = widget.renderTextItem({
    id: "text",
    type: "text",
    source: "rss",
    eyebrow: "Technology News",
    title: "A long title",
    body: "SELF TEXT MUST NOT RENDER",
    url: "https://example.com/raw-text-url"
  }, { index: 1, total: 25 });
  const imageMarkup = widget.renderImageItem({
    id: "image",
    type: "image",
    source: "reddit",
    eyebrow: "r/baseball",
    title: "Another long title",
    body: "FEED DESCRIPTION MUST NOT RENDER",
    url: "https://example.com/raw-image-url",
    media: { url: "https://example.com/image.jpg" }
  }, { index: 25, total: 25 });

  [textMarkup, imageMarkup].forEach((markup) => {
    const sourceEnd = markup.indexOf("</div>", markup.indexOf("discovery-source"));
    const contentStart = markup.indexOf("discovery-content");
    const positionStart = markup.indexOf("discovery-position");

    assert.ok(sourceEnd < contentStart);
    assert.ok(contentStart < positionStart);
  });
  assert.match(textMarkup, /Technology News/);
  assert.match(textMarkup, /A long title/);
  assert.match(textMarkup, /1\s*\/\s*25/);
  assert.doesNotMatch(textMarkup, /SELF TEXT MUST NOT RENDER|raw-text-url/);
  assert.match(imageMarkup, /r\/baseball/);
  assert.match(imageMarkup, /Another long title/);
  assert.match(imageMarkup, /class="discovery-media-image"/);
  assert.match(imageMarkup, /https:\/\/example\.com\/image\.jpg/);
  assert.match(imageMarkup, /25\s*\/\s*25/);
  assert.doesNotMatch(imageMarkup, /FEED DESCRIPTION MUST NOT RENDER|raw-image-url/);
});

test("Discovery falls back to normalized generic source when eyebrow is absent", () => {
  const widget = new context.DiscoveryWidget();
  const markup = widget.renderTextItem({
    id: "generic",
    type: "text",
    source: "rss",
    title: "Generic feed item"
  }, { index: 2, total: 3 });

  assert.match(markup, /<div class="discovery-source">\s*RSS\s*<\/div>/i);
  assert.match(markup, /2\s*\/\s*3/);

  const legacyMarkup = widget.renderTextItem({
    id: "legacy",
    type: "text",
    title: "Legacy item"
  }, { index: 1, total: 1 });

  assert.match(
    legacyMarkup,
    /<div class="discovery-source">\s*Discovery\s*<\/div>/
  );
});
