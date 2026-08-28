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

test("Discovery fitting keeps short titles large and reduces longer titles", () => {
  const widget = new context.DiscoveryWidget();

  assert.equal(
    widget.findLargestFittingFontSize(64, 32, () => true),
    64
  );
  assert.equal(
    widget.findLargestFittingFontSize(64, 32, (size) => size <= 64),
    64
  );
  assert.equal(
    widget.findLargestFittingFontSize(64, 32, (size) => size <= 44),
    44
  );
  assert.equal(
    widget.findLargestFittingFontSize(64, 32, () => false),
    32
  );
});

test("Discovery fitting responds to measured region geometry, not title length", () => {
  const widget = new context.DiscoveryWidget();
  const createTitle = (height, heightFactor = 2) => {
    const style = { fontSize: "", maxHeight: "" };
    const title = {
      className: "discovery-headline discovery-text-headline",
      textContent: "The same normalized Discovery title",
      style,
      scrollWidth: 500,
      parentElement: { clientWidth: 500, clientHeight: height }
    };

    Object.defineProperty(title, "scrollHeight", {
      get() {
        return (Number.parseFloat(style.fontSize) || 64) * heightFactor;
      }
    });

    return title;
  };
  context.window = {
    getComputedStyle(title) {
      const size = Number.parseFloat(title.style.fontSize) || 64;

      return {
        getPropertyValue(name) {
          return name.includes("preferred") ? "64px" : "32px";
        },
        fontFamily: "Outfit",
        fontWeight: "500",
        letterSpacing: "-0.16px",
        lineHeight: `${size * 1.12}px`
      };
    }
  };
  const spacious = createTitle(140);
  const constrained = createTitle(80);
  const extreme = createTitle(80, 5);

  widget.fitTitleToRegion(spacious);
  widget.fitTitleToRegion(constrained);
  widget.titleFitCache.clear();
  widget.fitTitleToRegion(extreme);

  assert.equal(spacious.style.fontSize, "64px");
  assert.equal(constrained.style.fontSize, "40px");
  assert.equal(extreme.style.fontSize, "32px");
  assert.equal(extreme.style.maxHeight, "71.68px");
});

test("repeated fitting with unchanged inputs is idempotent", () => {
  const widget = new context.DiscoveryWidget();
  const style = { fontSize: "", maxHeight: "" };
  const title = {
    className: "discovery-headline discovery-text-headline",
    textContent: "A stable long Discovery title",
    style,
    scrollWidth: 500,
    parentElement: { clientWidth: 500, clientHeight: 88 }
  };

  Object.defineProperty(title, "scrollHeight", {
    get() {
      return (Number.parseFloat(style.fontSize) || 64) * 2;
    }
  });

  widget.fitTitleToRegion(title);
  const firstSize = style.fontSize;
  const firstCacheSize = widget.titleFitCache.size;

  widget.fitTitleToRegion(title);

  assert.equal(firstSize, "44px");
  assert.equal(style.fontSize, firstSize);
  assert.equal(widget.titleFitCache.size, firstCacheSize);

  title.parentElement.clientHeight = 100;
  widget.fitTitleToRegion(title);

  assert.equal(style.fontSize, "50px");
  assert.equal(widget.titleFitCache.size, firstCacheSize + 1);

  title.textContent = "A different Discovery item";
  widget.fitTitleToRegion(title);

  assert.equal(style.fontSize, "50px");
  assert.equal(widget.titleFitCache.size, firstCacheSize + 2);
});

test("image titles fit and clip within the counter-reserved grid track", () => {
  const widget = new context.DiscoveryWidget();
  const createImageTitle = (heightFactor) => {
    const style = { fontSize: "", maxHeight: "" };
    const title = {
      className: "discovery-headline discovery-image-headline",
      textContent: `Image title factor ${heightFactor}`,
      style,
      scrollWidth: 400,
      parentElement: { clientWidth: 400, clientHeight: 80 }
    };

    Object.defineProperty(title, "scrollHeight", {
      get() {
        return (Number.parseFloat(style.fontSize) || 50) * heightFactor;
      }
    });

    return title;
  };
  context.window = {
    getComputedStyle(title) {
      const size = Number.parseFloat(title.style.fontSize) || 50;

      return {
        getPropertyValue(name) {
          return name.includes("preferred") ? "50px" : "28px";
        },
        fontFamily: "Outfit",
        fontWeight: "500",
        letterSpacing: "-0.16px",
        lineHeight: `${size * 1.12}px`
      };
    }
  };
  const short = createImageTitle(1);
  const medium = createImageTitle(1.5);
  const long = createImageTitle(2);
  const extreme = createImageTitle(4);

  widget.fitTitleToRegion(short);
  widget.fitTitleToRegion(medium);
  widget.fitTitleToRegion(long);
  widget.fitTitleToRegion(extreme);

  assert.equal(short.style.fontSize, "50px");
  assert.equal(short.style.maxHeight, "");
  assert.equal(medium.style.fontSize, "50px");
  assert.equal(medium.style.maxHeight, "");
  assert.equal(long.style.fontSize, "40px");
  assert.equal(long.style.maxHeight, "");
  assert.equal(extreme.style.fontSize, "28px");
  assert.equal(extreme.style.maxHeight, "62.720000000000006px");
  assert.ok(Number.parseFloat(extreme.style.maxHeight) <= 80);

  widget.fitTitleToRegion(extreme);

  assert.equal(extreme.style.fontSize, "28px");
  assert.equal(extreme.style.maxHeight, "62.720000000000006px");
});

test("Discovery title fitting uses rendered width and height", () => {
  assert.match(widgetSource, /region\?\.clientWidth/);
  assert.match(widgetSource, /region\?\.clientHeight/);
  assert.match(
    widgetSource,
    /title\.scrollWidth <= availableWidth \+ 0\.5/
  );
  assert.match(
    widgetSource,
    /title\.scrollHeight <= availableHeight \+ 0\.5/
  );
  assert.match(
    widgetSource,
    /findLargestFittingFontSize\([\s\S]*preferredSize,[\s\S]*minimumSize,[\s\S]*measure/
  );
});

test("minimum-size overflow clips to complete title lines", () => {
  assert.match(
    widgetSource,
    /if \(result\.fits\) return;[\s\S]*calculateWholeLineHeight\([\s\S]*availableHeight,[\s\S]*lineHeight[\s\S]*title\.style\.maxHeight = visibleHeight \+ "px"/
  );
});

test("Discovery title fitting recalculates on resize and font loading", () => {
  assert.match(
    widgetSource,
    /\.discovery-text-headline, \.discovery-image-headline/
  );
  assert.match(
    widgetSource,
    /this\.titleResizeObserver\.observe\(this\.element\)/
  );
  assert.doesNotMatch(
    widgetSource,
    /this\.titleResizeObserver\.observe\(title\.parentElement\)/
  );
  assert.match(
    widgetSource,
    /document\.fonts\?\.ready[\s\S]*this\.titleFitCache\.clear\(\)[\s\S]*scheduleTitleFits\(\)/
  );
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
    /if \(sizeKey === this\.titleContainerSizeKey\) return;[\s\S]*this\.titleContainerSizeKey = sizeKey;[\s\S]*scheduleTitleFits\(\)/
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
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-text-headline\s*\{[^}]*--discovery-title-preferred-size:\s*64px;[^}]*--discovery-title-minimum-size:\s*32px;/s
  );
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-image-headline\s*\{[^}]*--discovery-title-preferred-size:\s*50px;[^}]*--discovery-title-minimum-size:\s*28px;/s
  );
  assert.match(
    stylesheet,
    /\.discovery-zone \.discovery-image-content\s*\{[^}]*align-self:\s*stretch;/s
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
