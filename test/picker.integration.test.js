import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { mkdtempSync, writeFileSync, rmSync, mkdirSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

const entry = process.env.PI_CODING_AGENT_ENTRY;

test("installed Pi snippet picker: selection, preview, confirmation and cancellation", {
  skip: !entry && "Set PI_CODING_AGENT_ENTRY to installed Pi dist/index.js",
}, async (t) => {
  const agentDir = mkdtempSync(join(tmpdir(), "snippet-agent-"));
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  t.after(() => {
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(agentDir, { recursive: true, force: true });
  });
  const require = createRequire(entry);
  const { createJiti } = await import(require.resolve("jiti"));
  const tuiPath = require.resolve("@earendil-works/pi-tui");
  const jiti = createJiti(import.meta.url, { alias: {
    "@earendil-works/pi-coding-agent": entry,
    "@earendil-works/pi-tui": tuiPath,
  } });
  const { visibleWidth } = await import(tuiPath);
  const { default: extension } = await jiti.import("../extensions/prompt-snippets/index.ts");
  const handlers = {};
  let command;
  let shortcut;
  let commands = [];
  let editorText = "";
  const notifications = [];
  extension({
    getCommands() { return commands; },
    on(name, handler) { handlers[name] = handler; },
    registerShortcut(_key, value) { shortcut = value; },
    registerCommand(_name, value) { command = value; },
  });
  let interact;
  const ctx = {
    mode: "tui", hasUI: true, cwd: process.cwd(), isProjectTrusted: () => false,
    ui: {
      theme: { fg: (_color, value) => value, bold: value => value },
      setWidget() {},
      notify(message) { notifications.push(message); },
      getEditorText() { return editorText; },
      setEditorText(text) { editorText = text; },
      async custom(factory) {
        const tui = { terminal: { rows: 24 }, requestRender() {} };
        let result;
        const picker = factory(tui, ctx.ui.theme, {}, value => { result = value; });
        const render = (width = 100) => {
          const rows = picker.render(width);
          assert.ok(rows.every(line => visibleWidth(line) <= width));
          assert.ok(rows.length <= tui.terminal.rows);
          return rows.join("\n");
        };
        interact(picker, render, tui);
        return result;
      },
    },
  };
  const reset = () => handlers.session_start({}, ctx);
  const consume = () => handlers.input({ text: "hello", source: "interactive" }, ctx);
  reset();
  interact = (picker, render, tui) => {
    assert.match(render(), /> ○ 1 /);
    assert.doesNotMatch(render(), /\[[ x]\]/);
    picker.handleInput("1");
    assert.match(render(), /> ● 1 /);
    picker.handleInput("1");
    assert.match(render(), /> ○ 1 /);
    picker.handleInput("9"); // Absent numbered item is ignored.
    picker.handleInput("\x1b[A"); // Navigation clamps at the first item.
    assert.match(render(), /> ○ 1 /);
    picker.handleInput("\x1b[C");
    assert.match(render(), /Preview:/);
    picker.handleInput("\x1b[D");
    assert.match(render(), /Prompt snippets/);
    for (const height of [12, 16, 24]) {
      tui.terminal.rows = height;
      for (const width of [20, 40, 100]) render(width);
    }
    picker.handleInput("\r"); // Highlight fallback.
  };
  await command.handler("", ctx);
  const fallback = await consume();
  assert.equal(fallback.action, "transform");
  assert.ok(fallback.text.includes("hello"));
  assert.equal((await consume()).action, "continue");

  reset();
  interact = picker => { picker.handleInput("1"); picker.handleInput("2"); picker.handleInput("\t"); picker.handleInput("\r"); };
  await command.handler("", ctx);
  const multiple = await consume();
  assert.equal(multiple.action, "transform");
  assert.ok(multiple.text.length > fallback.text.length);

  reset();
  interact = picker => { picker.handleInput(" "); picker.handleInput("\x1b"); };
  await command.handler("", ctx);
  assert.equal((await consume()).action, "continue");

  // Cancelling edits preserves an already active selection.
  interact = picker => { picker.handleInput("\r"); };
  await command.handler("", ctx);
  interact = picker => { picker.handleInput("1"); picker.handleInput("2"); picker.handleInput("\x1b"); };
  await command.handler("", ctx);
  assert.deepEqual(await consume(), fallback);
  assert.deepEqual(notifications, []);

  const directory = mkdtempSync(join(tmpdir(), "snippet-skills-"));
  try {
    const skill = (name, flag) => {
      const path = join(directory, `${name}.md`);
      writeFileSync(path, `---\nname: ${name}\ndescription: Skill ${name}\ndisable-model-invocation: ${flag}\n---\nInstructions for ${name}.`);
      return { name: `skill:${name}`, description: `Skill ${name}`, source: "skill",
        sourceInfo: { path, scope: "user", source: "test", origin: "top-level" } };
    };
    commands = [skill("manual", "true"), skill("automatic", "false"), skill("quoted", '"true"')];
    const moveToSkill = (picker, render) => {
      for (let i = 0; i < 50 && !render().includes("> ↳"); i++) picker.handleInput("\x1b[B");
      assert.match(render(), /> ↳ · manual/);
    };
    reset();
    editorText = "review these changes\nkeep this line";
    interact = (picker, render, tui) => {
      assert.match(render(), /SKILLS — on-demand only/);
      assert.doesNotMatch(render(), /automatic|quoted/);
      picker.handleInput("1");
      moveToSkill(picker, render);
      picker.handleInput(" "); // Skills never become checked snippets.
      assert.match(render(), /> ↳ · manual/);
      picker.handleInput("\t");
      assert.match(render(), /Instructions for manual\./);
      assert.match(render(), /\/skill:manual · user/);
      for (const height of [12, 24]) {
        tui.terminal.rows = height;
        for (const width of [20, 40, 100]) render(width);
      }
      picker.handleInput("\r"); // Also insert from preview.
    };
    await command.handler("", ctx);
    assert.equal(editorText, "/skill:manual review these changes\nkeep this line");
    assert.deepEqual(await consume(), fallback); // Checkbox changes applied.

    reset();
    editorText = "";
    interact = (picker, render) => { moveToSkill(picker, render); picker.handleInput("\r"); };
    await shortcut.handler(ctx);
    assert.equal(editorText, "/skill:manual ");
    assert.equal((await consume()).action, "continue"); // No fallback snippet selected.

    reset();
    editorText = " /other arguments";
    interact = (picker, render) => {
      picker.handleInput("1");
      moveToSkill(picker, render);
      picker.handleInput("\r");
      assert.match(render(), /> ↳ · manual/); // Warning leaves the menu open.
      assert.equal(editorText, " /other arguments");
      picker.handleInput("\x1b");
    };
    await command.handler("", ctx);
    assert.equal(editorText, " /other arguments");
    assert.match(notifications.pop(), /Draft starts with a slash command/);
    assert.equal((await consume()).action, "continue");

    reset();
    editorText = "unchanged draft";
    interact = (picker, render) => {
      moveToSkill(picker, render);
      picker.handleInput("9"); // Numbers never select a skill.
      picker.handleInput("\x1b");
    };
    await command.handler("", ctx);
    assert.equal(editorText, "unchanged draft");
    assert.equal((await consume()).action, "continue");

    // Prepend snippets must not hide a skill command from Pi's expansion.
    reset();
    interact = picker => { picker.handleInput("1"); picker.handleInput("\r"); };
    await command.handler("", ctx);
    assert.equal((await handlers.input({ text: "external", source: "extension" }, ctx)).action, "continue");
    const transformed = await handlers.input({ text: "/skill:manual request", source: "interactive" }, ctx);
    assert.match(transformed.text, /^\/skill:manual /);
    assert.ok(transformed.text.includes("request"));
    const { AgentSession } = await import(entry);
    const expanded = AgentSession.prototype._expandSkillCommand.call({
      resourceLoader: { getSkills: () => ({ skills: [{ name: "manual", filePath: commands[0].sourceInfo.path, baseDir: directory }] }) },
      _extensionRunner: { emitError: assert.fail },
    }, transformed.text);
    assert.match(expanded, /^<skill name="manual"/);
    assert.match(expanded, /Instructions for manual\./);
    assert.ok(expanded.includes(fallback.text.replace("hello", "request")));
    assert.equal((await consume()).action, "continue");
    assert.deepEqual(notifications, []);

    // The skills section works even when every bundled snippet is disabled.
    const overrides = join(directory, ".pi", "prompt-snippets");
    mkdirSync(overrides, { recursive: true });
    for (const file of readdirSync(new URL("../extensions/prompt-snippets/snippets/", import.meta.url))) {
      writeFileSync(join(overrides, file), "---\nenabled: false\n---\n");
    }
    ctx.cwd = directory;
    ctx.isProjectTrusted = () => true;
    reset();
    editorText = "skills only";
    interact = (picker, render) => {
      assert.match(render(), /> ↳ · manual/);
      assert.doesNotMatch(render(), /PREPEND|APPEND/);
      picker.handleInput("1");
      picker.handleInput(" ");
      picker.handleInput("\r");
    };
    await command.handler("", ctx);
    assert.equal(editorText, "/skill:manual skills only");
    assert.equal((await consume()).action, "continue");
    assert.deepEqual(notifications, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    handlers.session_shutdown();
  }
});
