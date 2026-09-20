const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  resolveCalendarSourceDraft
} = require("../../backend/server");

const PROJECT_ROOT = path.join(__dirname, "..", "..");
const serverSource = fs.readFileSync(
  path.join(PROJECT_ROOT, "backend", "server.js"),
  "utf8"
);

test("Calendar edits preserve identity and enabled state across reload", () => {
  const configuredSource = {
    id: "personal",
    name: "Personal",
    enabled: false,
    url: "https://example.com/personal.ics",
    color: "indigo"
  };
  const editedSource = {
    ...configuredSource,
    name: "Family",
    url: "webcal://example.com/family.ics"
  };
  const saved = resolveCalendarSourceDraft(
    JSON.stringify([editedSource]),
    [configuredSource]
  );
  const reloaded = resolveCalendarSourceDraft(
    JSON.stringify(saved),
    saved
  );

  assert.deepEqual(saved, [editedSource]);
  assert.deepEqual(reloaded, [editedSource]);
  assert.equal(saved[0].id, configuredSource.id);
  assert.equal(saved[0].enabled, false);
  assert.equal(saved[0].color, "indigo");
});

test("an unchanged Calendar URL is valid but another source URL is rejected", () => {
  const configuredSources = [{
    id: "one",
    name: "One",
    enabled: true,
    url: "https://example.com/one.ics"
  }, {
    id: "two",
    name: "Two",
    enabled: true,
    url: "https://example.com/two.ics"
  }];

  assert.deepEqual(
    resolveCalendarSourceDraft(
      JSON.stringify(configuredSources),
      configuredSources
    ),
    configuredSources
  );

  assert.throws(
    () => resolveCalendarSourceDraft(
      JSON.stringify([{
        ...configuredSources[0],
        url: configuredSources[1].url
      }, configuredSources[1]]),
      configuredSources
    ),
    /already configured/
  );
});

test("legacy id-and-enabled Calendar drafts remain compatible", () => {
  const configuredSource = {
    id: "personal",
    name: "Personal",
    enabled: true,
    url: "https://example.com/personal.ics"
  };

  assert.deepEqual(
    resolveCalendarSourceDraft(
      JSON.stringify([{ id: "personal", enabled: false }]),
      [configuredSource]
    ),
    [{ ...configuredSource, enabled: false }]
  );
});

test("Configured Calendar Sources can be selected into the existing editor", () => {
  assert.match(serverSource, /data-edit-calendar-source>Select<\/button>/);
  assert.match(serverSource, /data-cancel-calendar-source-edit/);
  assert.match(serverSource, /nameInput\.value = source\.name/);
  assert.match(serverSource, /urlInput\.value = source\.url/);
  assert.match(serverSource, /editorTitle\.textContent = "Edit Source"/);
  assert.match(serverSource, /addButton\.textContent = "Update Source"/);
  assert.match(serverSource, /row\.classList\.toggle\("is-selected"/);
});

test("Calendar updates mutate only the local draft and refresh the row", () => {
  assert.match(serverSource, /\.\.\.draft\[sourceIndex\],[\s\S]*name,[\s\S]*url/);
  assert.match(serverSource, /draft\[sourceIndex\] = source/);
  assert.match(serverSource, /updateSourceRow\(row, source\)/);
  assert.match(serverSource, /markUnsaved\(\)/);
  assert.match(
    serverSource,
    /<form class="settings-form" method="post" action="\/control">/
  );
  assert.match(
    serverSource,
    /data-add-calendar-source>Add<\/button>/
  );
});

test("Calendar selection remains valid after draft removal", () => {
  assert.match(
    serverSource,
    /cancelEditButton\.addEventListener\("click", resetEditor\)/
  );
  assert.match(
    serverSource,
    /const nextSource = draft\[sourceIndex \+ 1\] \|\| draft\[sourceIndex - 1\] \|\| null/
  );
  assert.match(serverSource, /nextSource \? beginEdit\(nextSource\) : resetEditor\(\)/);
  assert.match(serverSource, /editingSourceId = null/);
});

test("Calendar Add, enable, disable, and remove remain local until Save Changes", () => {
  assert.match(serverSource, /draft\.push\(source\)/);
  assert.match(
    serverSource,
    /enabled: enabledInput\.checked/
  );
  assert.match(serverSource, /draft\.splice\(sourceIndex, 1\)/);
  assert.match(serverSource, /syncDraft\(\);[\s\S]*markUnsaved\(\)/);
  assert.match(serverSource, /enabled: true,[\s\S]*url/);
  assert.doesNotMatch(serverSource, /app\.post\("\/control\/calendar-sources\//);
});

test("Calendar draft lifecycle uses Save Changes as its persistence boundary", () => {
  const routes = require("../../backend/server").app.router.stack
    .filter((layer) => layer.route)
    .flatMap((layer) => Object.keys(layer.route.methods).map(
      (method) => `${method.toUpperCase()} ${layer.route.path}`
    ));

  assert.ok(routes.includes("POST /control"));
  assert.doesNotMatch(routes.join("\n"), /POST \/control\/calendar-sources\//);
  assert.match(serverSource, /name="calendarSourcesDraft"/);
  assert.match(serverSource, /data-calendar-source-empty/);
});

test("Calendar rows immediately display edited names and addresses", () => {
  assert.match(serverSource, /data-calendar-source-name/);
  assert.match(
    serverSource,
    /class="source-address">\$\{escapeHtml\(source\.url\)\}/
  );
  assert.match(serverSource, /name\.textContent = source\.name/);
  assert.match(serverSource, /address\.textContent = source\.url/);
});
