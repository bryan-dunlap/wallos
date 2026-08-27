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
const context = {};

vm.runInNewContext(
  widgetSource + "; this.DiscoveryWidget = DiscoveryWidget;",
  context
);

test("Discovery body height rounds down to complete line boxes", () => {
  const widget = new context.DiscoveryWidget();

  assert.equal(widget.calculateVisibleBodyHeight(181, 31.25), 156.25);
  assert.equal(widget.calculateVisibleBodyHeight(168, 33.6), 168);
  assert.equal(widget.calculateVisibleBodyHeight(20, 24), 0);
});

test("Discovery body clipping is shared and only applied on overflow", () => {
  assert.match(
    widgetSource,
    /\.discovery-text-body, \.discovery-image-body/
  );
  assert.match(
    widgetSource,
    /body\.scrollHeight <= allocatedHeight \+ 0\.5[\s\S]*return/
  );
  assert.match(
    widgetSource,
    /body\.style\.maxHeight = visibleHeight \+ "px"/
  );
});

test("Discovery body clipping recalculates without resize loops", () => {
  assert.match(
    widgetSource,
    /this\.bodyResizeObserver\.observe\(this\.element\)/
  );
  assert.match(widgetSource, /document\.fonts\?\.ready/);
  assert.match(
    widgetSource,
    /if \(this\.bodyLayoutFrame !== null\) return/
  );
  assert.match(
    widgetSource,
    /window\.cancelAnimationFrame\(this\.bodyLayoutFrame\)/
  );
});
