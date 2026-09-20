const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  app,
  resolveDiscoverySourceDraft
} = require("../../backend/server");

const PROJECT_ROOT = path.join(__dirname, "..", "..");

test("legacy Discovery and Reddit routes are absent", () => {
  const routes = app.router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map(
      (method) => `${method.toUpperCase()} ${layer.route.path}`
    ));

  assert.doesNotMatch(routes.join("\n"), /GET \/api\/reddit/);
  assert.doesNotMatch(
    routes.join("\n"),
    /POST \/control\/discovery-sources\/(add|toggle|remove)/
  );
  assert.ok(routes.includes("POST /control"));
  assert.ok(routes.includes("GET /api/discovery"));
});

test("a migrated Reddit-derived source is removable and is not restored", () => {
  const configuredSources = [{
    id: "discovery-reddit-default",
    name: "Reddit Mix",
    type: "rss",
    enabled: true,
    config: {
      url: "https://www.reddit.com/r/baseball/.rss"
    }
  }];

  assert.deepEqual(
    resolveDiscoverySourceDraft("[]", configuredSources),
    []
  );
});

test("Discovery edits preserve identity and enabled state across reload", () => {
  const configuredSource = {
    id: "baseball",
    name: "Baseball",
    type: "rss",
    enabled: false,
    config: {
      url: "https://example.com/baseball.xml",
      headers: { accept: "application/rss+xml" }
    },
    rank: 3
  };
  const editedSource = {
    ...configuredSource,
    name: "Baseball Reddit",
    config: {
      ...configuredSource.config,
      url: "https://www.reddit.com/r/news+nottheonion+weirdnews+baseball/.rss"
    }
  };
  const saved = resolveDiscoverySourceDraft(
    JSON.stringify([editedSource]),
    [configuredSource]
  );
  const reloaded = resolveDiscoverySourceDraft(
    JSON.stringify(saved),
    saved
  );

  assert.deepEqual(saved, [editedSource]);
  assert.deepEqual(reloaded, [editedSource]);
  assert.equal(saved[0].id, configuredSource.id);
  assert.equal(saved[0].enabled, false);
  assert.equal(saved[0].rank, 3);
  assert.deepEqual(saved[0].config.headers, {
    accept: "application/rss+xml"
  });
});

test("an unchanged edit URL is valid but another source URL is rejected", () => {
  const configuredSources = [{
    id: "baseball-one",
    name: "Baseball One",
    type: "rss",
    enabled: true,
    config: { url: "https://example.com/one.xml" }
  }, {
    id: "baseball-two",
    name: "Baseball Two",
    type: "rss",
    enabled: true,
    config: { url: "https://example.com/two.xml" }
  }];

  assert.deepEqual(
    resolveDiscoverySourceDraft(
      JSON.stringify(configuredSources),
      configuredSources
    ),
    configuredSources
  );

  const duplicateEdit = [
    {
      ...configuredSources[0],
      config: { url: configuredSources[1].config.url }
    },
    configuredSources[1]
  ];

  assert.throws(
    () => resolveDiscoverySourceDraft(
      JSON.stringify(duplicateEdit),
      configuredSources
    ),
    /already configured/
  );
});

test("Control uses one auto-detected address field and displays source URLs", () => {
  const serverSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "backend", "server.js"),
    "utf8"
  );

  assert.match(
    serverSource,
    /class="source-address">\$\{escapeHtml\(sourceUrl\)\}/
  );
  assert.match(
    serverSource,
    /address\.textContent = source\.config\.url/
  );
  assert.match(serverSource, />Feed Address<\/label>/);
  assert.match(serverSource, /placeholder="Feed URL or r\/subreddit"/);
  assert.doesNotMatch(serverSource, /id="discovery-source-type"/);
  assert.doesNotMatch(serverSource, /name="discoverySourceType"/);
});

test("new Discovery draft records always use the RSS persistence type", () => {
  const serverSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "backend", "server.js"),
    "utf8"
  );

  assert.match(serverSource, /const type = "rss";/);
  assert.match(serverSource, /config: \{ url \}/);
  assert.doesNotMatch(serverSource, /type = "reddit"/);
});

test("Configured Sources can be selected into the existing editor", () => {
  const serverSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "backend", "server.js"),
    "utf8"
  );

  assert.match(serverSource, /data-edit-discovery-source>Select<\/button>/);
  assert.match(serverSource, /data-cancel-discovery-source-edit/);
  assert.match(serverSource, /nameInput\.value = source\.name/);
  assert.match(serverSource, /urlInput\.value = source\.config\?\.url/);
  assert.match(serverSource, /addButton\.textContent = "Update Source"/);
  assert.match(serverSource, /editorTitle\.textContent = "Edit Source"/);
  assert.match(serverSource, /row\.classList\.toggle\("is-selected"/);
});

test("local updates preserve state and deterministically select after removal", () => {
  const serverSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "backend", "server.js"),
    "utf8"
  );

  assert.match(serverSource, /\.\.\.draft\[sourceIndex\]/);
  assert.match(serverSource, /draft\[sourceIndex\] = source/);
  assert.match(serverSource, /updateSourceRow\(row, source\)/);
  assert.match(
    serverSource,
    /cancelEditButton\.addEventListener\("click", resetEditor\)/
  );
  assert.match(serverSource, /const nextSource = draft\[sourceIndex \+ 1\] \|\| draft\[sourceIndex - 1\] \|\| null/);
  assert.match(serverSource, /nextSource \? beginEdit\(nextSource\) : resetEditor\(\)/);
});

test("Discovery source edits remain a local draft until Save Changes", () => {
  const serverSource = fs.readFileSync(
    path.join(PROJECT_ROOT, "backend", "server.js"),
    "utf8"
  );

  assert.match(
    serverSource,
    /<form class="settings-form" method="post" action="\/control">/
  );
  assert.match(
    serverSource,
    /data-add-discovery-source>Add<\/button>/
  );
  assert.match(serverSource, /draft\.push\(source\)/);
  assert.match(serverSource, /draft\[sourceIndex\] = source/);
  assert.match(
    serverSource,
    /enabled: enabledInput\.checked/
  );
  assert.match(serverSource, /draft\.splice\(sourceIndex, 1\)/);
  assert.match(serverSource, /markUnsaved\(\)/);
  assert.doesNotMatch(
    serverSource,
    /app\.post\("\/control\/discovery-sources\//
  );
  assert.match(serverSource, /enabled: true,[\s\S]*config: \{ url \}/);
  assert.match(serverSource, /data-discovery-source-empty/);
});

test("generic Discovery status copy contains no Reddit assumption", () => {
  const widgetSource = fs.readFileSync(
    path.join(
      PROJECT_ROOT,
      "frontend",
      "widgets",
      "discovery-widget.js"
    ),
    "utf8"
  );

  assert.match(widgetSource, /Loading Discovery/);
  assert.match(widgetSource, /Fetching sources/);
  assert.match(widgetSource, /Discovery unavailable/);
  assert.doesNotMatch(widgetSource, /Reddit/i);
});
