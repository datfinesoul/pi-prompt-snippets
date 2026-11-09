import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import {
  applySnippets,
  DEFAULT_SHORTCUT,
  DEFAULT_SETTINGS,
  loadSnippets,
  parseSettings,
  parseSnippet,
  readLayer,
  readSettings,
} from "../src/snippets.js";

function temporaryDirectory(files = {}) {
  const directory = mkdtempSync(join(tmpdir(), "pi-prompt-snippets-"));
  for (const [name, contents] of Object.entries(files)) writeFileSync(join(directory, name), contents);
  return directory;
}

const snippet = (fields, body = "") =>
  `---\n${Object.entries(fields).map(([key, value]) => `${key}: ${value}`).join("\n")}\n---\n${body}\n`;

test("parseSnippet reads frontmatter and body", () => {
  const parsed = parseSnippet("x", snippet({ name: '"Concise"', placement: "prepend", order: 5 }, "Be brief."));
  assert.deepEqual(parsed, { id: "x", name: "Concise", placement: "prepend", order: 5, body: "Be brief." });
});

test("parseSnippet treats a file without frontmatter as a body", () => {
  assert.deepEqual(parseSnippet("plain", "Just text.\n"), { id: "plain", body: "Just text." });
});

test("parseSnippet ignores invalid placement and order values", () => {
  const parsed = parseSnippet("x", snippet({ placement: "middle", order: "soon" }, "Body"));
  assert.equal(parsed.placement, undefined);
  assert.equal(parsed.order, undefined);
});

test("parseSnippet recognizes enabled: false without a body", () => {
  assert.deepEqual(parseSnippet("x", snippet({ enabled: "false" })), { id: "x", enabled: false });
});

test("readLayer tolerates a missing directory and skips non-snippet files", () => {
  assert.deepEqual(readLayer(join(tmpdir(), "pi-prompt-snippets-does-not-exist")), []);

  const directory = temporaryDirectory({ "a.md": "A", "notes.txt": "ignored", ".hidden.md": "ignored" });
  mkdirSync(join(directory, "dir.md"));
  symlinkSync(join(directory, "a.md"), join(directory, "link.md"));
  assert.deepEqual(readLayer(directory).map((d) => d.id), ["a"]);
});

test("project overrides global, which overrides bundled, field by field", () => {
  const bundled = temporaryDirectory({
    "keep.md": snippet({ name: "Keep", order: 1 }, "Bundled keep"),
    "tweak.md": snippet({ name: "Tweak", description: "bundled", placement: "prepend", order: 2 }, "Bundled tweak"),
    "drop.md": snippet({ name: "Drop" }, "Bundled drop"),
  });
  const global = temporaryDirectory({
    "tweak.md": snippet({ description: "global" }, "Global tweak"),
    "personal.md": snippet({ name: "Personal", order: 3 }, "Personal"),
  });
  const project = temporaryDirectory({
    "tweak.md": snippet({ order: 9 }),
    "drop.md": snippet({ enabled: "false" }),
    "team.md": snippet({ name: "Team", placement: "prepend", order: 1 }, "Team rule"),
  });

  const snippets = loadSnippets([
    { source: "bundled", directory: bundled },
    { source: "global", directory: global },
    { source: "project", directory: project },
  ]);

  assert.deepEqual(snippets.map((s) => s.id), ["team", "tweak", "keep", "personal"]);
  const tweak = snippets.find((s) => s.id === "tweak");
  assert.equal(tweak.name, "Tweak", "unset fields are inherited");
  assert.equal(tweak.description, "global");
  assert.equal(tweak.placement, "prepend");
  assert.equal(tweak.order, 9);
  assert.equal(tweak.body, "Global tweak", "an empty body inherits the lower layer body");
  assert.equal(tweak.source, "project");
});

test("a higher layer can re-enable a snippet removed by a lower override", () => {
  const bundled = temporaryDirectory({ "x.md": snippet({ name: "X" }, "Bundled") });
  const global = temporaryDirectory({ "x.md": snippet({ enabled: "false" }) });
  const project = temporaryDirectory({ "x.md": snippet({ enabled: "true" }, "Project") });
  const snippets = loadSnippets([
    { source: "bundled", directory: bundled },
    { source: "global", directory: global },
    { source: "project", directory: project },
  ]);
  assert.deepEqual(snippets.map((s) => [s.id, s.body]), [["x", "Project"]]);
});

test("new snippets without a body are skipped and defaults are applied", () => {
  const directory = temporaryDirectory({ "empty.md": snippet({ name: "Empty" }), "bare.md": "Bare body" });
  const [bare, ...rest] = loadSnippets([{ source: "global", directory }]);
  assert.equal(rest.length, 0);
  assert.deepEqual(
    { name: bare.name, description: bare.description, placement: bare.placement, order: bare.order },
    { name: "bare", description: "", placement: "append", order: 9999 },
  );
});

test("applySnippets wraps text with prepend and append bodies", () => {
  const active = [
    { placement: "prepend", body: "P1" },
    { placement: "prepend", body: "P2" },
    { placement: "append", body: "A1" },
  ];
  assert.equal(applySnippets("Message", active), "P1\n\nP2\n\nMessage\n\nA1");
});

test("parseSettings defaults, overrides, and disables the shortcut", () => {
  assert.deepEqual(parseSettings("{}", "s.json"), DEFAULT_SETTINGS);
  assert.deepEqual(parseSettings('{"shortcut":"Ctrl+Shift+S"}', "s.json"), { ...DEFAULT_SETTINGS, shortcut: "ctrl+shift+s" });
  assert.deepEqual(parseSettings('{"shortcut":null}', "s.json"), { ...DEFAULT_SETTINGS, shortcut: null });
  assert.deepEqual(parseSettings('{"shortcut":false}', "s.json"), { ...DEFAULT_SETTINGS, shortcut: null });
  assert.throws(() => parseSettings('{"shortcut":1}', "s.json"), /"shortcut" must be a key string/);
  assert.throws(() => parseSettings("[]", "s.json"), /settings must be an object/);
  assert.throws(() => parseSettings("{", "s.json"), /invalid JSON/);
});

test("skill visibility accepts booleans and trusted project values override global settings", () => {
  const global = parseSettings('{"shortcut":"ctrl+s","showOnDemandSkills":false}', "global.json");
  assert.deepEqual(global, { shortcut: "ctrl+s", showOnDemandSkills: false });
  assert.deepEqual(parseSettings("{}", "project.json", { defaults: global, project: true }), global);
  assert.deepEqual(parseSettings('{"shortcut":false,"showOnDemandSkills":true}', "project.json", {
    defaults: global, project: true,
  }), { shortcut: "ctrl+s", showOnDemandSkills: true });
  assert.deepEqual(parseSettings('{"shortcut":123,"showOnDemandSkills":false}', "project.json", {
    defaults: DEFAULT_SETTINGS, project: true,
  }), { shortcut: DEFAULT_SHORTCUT, showOnDemandSkills: false });
  for (const value of ['"false"', "null", "0", "[]", "{}"] ) {
    assert.throws(() => parseSettings(`{"showOnDemandSkills":${value}}`, "s.json"), /"showOnDemandSkills" must be a boolean/);
  }
});

test("missing settings inherit defaults and invalid layers warn without crashing", (t) => {
  const directory = temporaryDirectory();
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const path = join(directory, "settings.json");
  const warnings = [];
  const defaults = { shortcut: "ctrl+s", showOnDemandSkills: false };
  const options = { defaults, project: true, onWarning: message => warnings.push(message) };
  assert.deepEqual(readSettings(path), DEFAULT_SETTINGS);
  assert.deepEqual(readSettings(path, options), defaults);
  assert.deepEqual(warnings, []);
  for (const invalid of ["{", "[]", '{"showOnDemandSkills":"true"}']) {
    writeFileSync(path, invalid);
    assert.deepEqual(readSettings(path, options), defaults);
    assert.ok(warnings.at(-1).includes(path));
  }
  assert.equal(warnings.length, 3);
  assert.deepEqual(readSettings(directory, options), defaults); // Unreadable as a file.
  assert.equal(warnings.length, 4);
  writeFileSync(path, '{"showOnDemandSkills":true}');
  assert.deepEqual(readSettings(path, options), { ...defaults, showOnDemandSkills: true });
  assert.deepEqual(defaults, { shortcut: "ctrl+s", showOnDemandSkills: false });
});
