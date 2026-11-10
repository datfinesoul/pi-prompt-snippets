import assert from "node:assert/strict";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { applyInputSnippets, loadOnDemandSkills, skillEditorText } from "../src/skills.ts";

// The host supplies its YAML parser. JSON fixtures isolate the selection logic.
const parse = text => ({ frontmatter: JSON.parse(text), body: "Instructions" });

test("lists only explicit-only loaded skills, sorted by name with canonical provenance", () => {
  const directory = mkdtempSync(join(tmpdir(), "skills-"));
  try {
    const command = (name, flag, source = "skill") => {
      const path = join(directory, name);
      writeFileSync(path, JSON.stringify({ "disable-model-invocation": flag }));
      return { name: `skill:${name}`, description: name, source, sourceInfo: { path, scope: "project" } };
    };
    const commands = [command("zebra", true), command("auto", false), command("missing"),
      command("quoted", "true"), command("template", true, "prompt"), command("alpha", true)];
    const { skills, warnings } = loadOnDemandSkills(commands, parse);
    assert.deepEqual(warnings, []);
    assert.deepEqual(skills.map(s => s.name), ["alpha", "zebra"]);
    assert.deepEqual(skills[0], { kind: "skill", id: "skill:alpha", name: "alpha", description: "alpha",
      command: "/skill:alpha", path: join(directory, "alpha"), source: "project", body: "Instructions" });
    assert.deepEqual(loadOnDemandSkills([], parse), { skills: [], warnings: [] });

    // Files not in the host's list are never discovered.
    writeFileSync(join(directory, "unlisted"), JSON.stringify({ "disable-model-invocation": true }));
    assert.equal(loadOnDemandSkills(commands, parse).skills.length, 2);
    writeFileSync(commands[0].sourceInfo.path, JSON.stringify({ "disable-model-invocation": false }));
    assert.deepEqual(loadOnDemandSkills(commands, parse).skills.map(s => s.name), ["alpha"]);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("unreadable, malformed and oversized skill files warn without breaking the list", () => {
  const directory = mkdtempSync(join(tmpdir(), "skills-"));
  try {
    writeFileSync(join(directory, "invalid"), "not JSON");
    writeFileSync(join(directory, "large"), "x".repeat(256 * 1024 + 1));
    const commands = ["missing", "invalid", "large"].map(name => ({ name: `skill:${name}`, source: "skill",
      sourceInfo: { path: join(directory, name), scope: "user" } }));
    const result = loadOnDemandSkills(commands, parse);
    assert.equal(result.skills.length, 0);
    assert.equal(result.warnings.length, 3);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test("skill command insertion preserves drafts and refuses existing slash commands", () => {
  assert.equal(skillEditorText("/skill:review", ""), "/skill:review ");
  assert.equal(skillEditorText("/skill:review", " draft\ntext"), "/skill:review  draft\ntext");
  for (const draft of ["/help", " /skill:other arg", "\n/template"]) {
    assert.equal(skillEditorText("/skill:review", draft), null);
  }
});

test("instructions follow skill arguments without hiding the command from native expansion", () => {
  const active = [{ body: "First" }, { body: "Second" }];
  const wrapped = text => `<user_request>\n${text}\n</user_request>\n\n<request_instructions>\nFirst\n\nSecond\n</request_instructions>`;
  assert.equal(applyInputSnippets("/skill:review request", active), `/skill:review ${wrapped("request")}`);
  assert.equal(applyInputSnippets("/skill:review", active), `/skill:review ${wrapped("")}`);
  assert.equal(applyInputSnippets("regular text", active), wrapped("regular text"));
  assert.equal(applyInputSnippets("/skill:review line one\nline two", active),
    `/skill:review ${wrapped("line one\nline two")}`);
  assert.equal(applyInputSnippets("/skill:review <user_request>", active),
    "/skill:review <user_request_1>\n<user_request>\n</user_request_1>\n\n<request_instructions_1>\nFirst\n\nSecond\n</request_instructions_1>");
});

test("no selected snippets leave regular input and skill commands unchanged", () => {
  for (const text of ["text", "/skill:review", "/skill:review ", "/skill:review  request\n"]) {
    assert.equal(applyInputSnippets(text, []), text);
  }
});
