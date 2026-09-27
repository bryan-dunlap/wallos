const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const {
  HomeAssistantWidget,
  getHomeAssistantSourceMessage
} = require("../../frontend/widgets/home-assistant-widget");
const {
  projectHomeAssistantPresentation
} = require("../../frontend/widgets/home-assistant-presentation");

class FakeElement {
  constructor(tagName = "div") {
    this.tagName = tagName;
    this.className = "";
    this.dataset = {};
    this.children = [];
    this.textContent = "";
  }

  append(...children) { this.children.push(...children); }
  replaceChildren(...children) { this.children = children; }
  setAttribute(name, value) { this[name] = value; }
}

function flatten(element) {
  return [element, ...element.children.flatMap(flatten)];
}

function text(element) {
  return flatten(element).map((node) => node.textContent).join(" ");
}

function rows(count) {
  return Array.from({ length: count }, (_, index) => ({
    domain: index === 1 ? "binary_sensor" : "light",
    displayName: index === 1 ? "Patio Entry Door" : `Light ${index + 1}`,
    state: "off",
    deviceClass: index === 1 ? "door" : null,
    availability: "available",
    unit: null
  }));
}

function createHarness() {
  let subscriber = null;
  let unsubscribed = 0;
  global.document = {
    createElement: (tagName) => new FakeElement(tagName)
  };
  global.window = {
    mosaicApp: {
      eventCoordinator: {
        subscribe(type, callback) {
          assert.equal(type, "home-assistant");
          subscriber = callback;
          return () => { unsubscribed += 1; };
        }
      }
    }
  };
  global.projectHomeAssistantPresentation = projectHomeAssistantPresentation;
  const mount = new FakeElement("section");
  const widget = new HomeAssistantWidget();
  widget.mount(mount);

  return {
    mount,
    publish: (payload) => subscriber({ payload }),
    unsubscribeCount: () => unsubscribed,
    widget
  };
}

test("preserves selected order and exact names while safely rendering text", () => {
  const harness = createHarness();
  harness.publish({
    status: "available",
    stale: false,
    selectedCount: 3,
    entities: [
      ...rows(2),
      {
        domain: "sensor",
        displayName: "<img src=x onerror=alert(1)>",
        state: "<script>alert(1)</script>",
        availability: "available"
      }
    ]
  });
  const output = text(harness.mount);

  assert.ok(output.indexOf("Light 1") < output.indexOf("Patio Entry"));
  assert.match(output, /Patio Entry Door/);
  assert.match(output, /<img src=x onerror=alert\(1\)>/);
  assert.equal("innerHTML" in harness.mount, false);
});

test("compact shows four rows while expanded deliberately shows eight", () => {
  const harness = createHarness();
  harness.publish({
    status: "available",
    stale: false,
    selectedCount: 10,
    entities: rows(10)
  });

  assert.match(text(harness.mount), /\+6 more/);
  assert.doesNotMatch(text(harness.mount), /Light 5/);

  harness.widget.setPresentationContext({ density: "expanded" });
  assert.equal(harness.mount.dataset.normalWidgetDensity, "expanded");
  assert.match(text(harness.mount), /Light 8/);
  assert.match(text(harness.mount), /\+2 more/);
  assert.doesNotMatch(text(harness.mount), /Light 9/);
});

test("persistent mount receives updates and exposes subtle stale state", () => {
  const harness = createHarness();
  const originalMount = harness.widget.element;
  harness.publish({
    status: "available",
    stale: false,
    selectedCount: 1,
    entities: rows(1)
  });
  harness.publish({
    status: "available",
    stale: true,
    selectedCount: 1,
    entities: [{ ...rows(1)[0], state: "on" }]
  });

  assert.equal(harness.widget.element, originalMount);
  assert.match(text(harness.mount), /Last known/);
  assert.match(text(harness.mount), /On/);
  harness.widget.unmount();
  assert.equal(harness.unsubscribeCount(), 1);
});

test("aliases and unavailable entity language survive density transitions", () => {
  const harness = createHarness();
  harness.publish({
    status: "available",
    stale: true,
    selectedCount: 3,
    entities: [
      { ...rows(1)[0], mosaicDisplayName: "Reading Lamp", state: "unknown", availability: "unknown" },
      { ...rows(1)[0], displayName: "Garage", state: "unavailable", availability: "unavailable" },
      { ...rows(1)[0], displayName: "Old Sensor", state: null, availability: "missing" }
    ]
  });
  harness.widget.setPresentationContext({ density: "expanded" });
  const output = text(harness.mount);

  assert.match(output, /Reading Lamp/);
  assert.match(output, /Unknown/);
  assert.match(output, /Unavailable/);
  assert.match(output, /Missing/);
  assert.match(output, /Last known/);
});

test("expanded entities expose metadata-driven semantics without name guessing", () => {
  const harness = createHarness();
  harness.publish({
    status: "available",
    stale: false,
    selectedCount: 4,
    entities: [
      { domain: "binary_sensor", displayName: "Patio", state: "on", deviceClass: "door", availability: "available" },
      { domain: "lock", displayName: "Entry", state: "locked", availability: "available" },
      { domain: "sensor", displayName: "Living Room", state: "72", unit: "°F", deviceClass: "temperature", availability: "available" },
      { domain: "sensor", displayName: "Totally Doorish Name", state: "fine", availability: "available" }
    ]
  });
  harness.widget.setPresentationContext({ density: "expanded" });

  const statusRows = flatten(harness.mount).filter(
    (node) => node.className === "home-assistant-status-row"
  );
  assert.deepEqual(
    statusRows.map((row) => [row.dataset.semantic, row.dataset.tone, row.dataset.valueKind]),
    [
      ["door", "attention", "state"],
      ["lock", "secure", "state"],
      ["temperature", "neutral", "numeric"],
      ["generic", "neutral", "state"]
    ]
  );
});

test("empty and source-level failures remain restrained", () => {
  assert.equal(getHomeAssistantSourceMessage("empty", 0), "Choose what to keep an eye on");
  assert.equal(getHomeAssistantSourceMessage("unconfigured", 0), "Setup needed");
  assert.equal(getHomeAssistantSourceMessage("unavailable", 0), "Status unavailable");
  assert.equal(getHomeAssistantSourceMessage("disabled", 0), "Home status is off");
});

test("semantic state colors are global constants outside theme overrides", () => {
  const variables = fs.readFileSync(
    path.join(__dirname, "..", "..", "frontend", "css", "variables.css"),
    "utf8"
  );
  const widgets = fs.readFileSync(
    path.join(__dirname, "..", "..", "frontend", "widgets", "widgets.css"),
    "utf8"
  );
  const firstTheme = variables.indexOf('[data-theme="terminal"]');
  const rootVariables = variables.slice(0, firstTheme);
  const themeOverrides = variables.slice(firstTheme);
  const contract = {
    secure: "#3c9b68",
    attention: "#c9832d",
    active: "#2b91ad",
    inactive: "#8d989f",
    unavailable: "#707b83"
  };

  for (const [tone, color] of Object.entries(contract)) {
    const token = `--color-state-${tone}`;
    assert.match(rootVariables, new RegExp(`${token}: ${color}`));
    assert.doesNotMatch(themeOverrides, new RegExp(token));
    assert.match(widgets, new RegExp(`var\\(${token}\\)`));
  }
  assert.doesNotMatch(
    widgets.match(/data-tone="(?:secure|attention|active|inactive|muted)"[\s\S]*?\}/g)?.join("\n") || "",
    /var\(--color-accent\)/
  );
});
