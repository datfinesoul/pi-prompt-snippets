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
  let commandReads = 0;
  let shortcutKey;
  let editorText = "";
  let widget;
  const notifications = [];
  extension({
    getCommands() { commandReads++; return commands; },
    on(name, handler) { handlers[name] = handler; },
    registerShortcut(key, value) { shortcutKey = key; shortcut = value; },
    registerCommand(_name, value) { command = value; },
  });
  let interact;
  const ctx = {
    mode: "tui", hasUI: true, cwd: process.cwd(), isProjectTrusted: () => false,
    ui: {
      theme: { fg: (_color, value) => value, bold: value => value },
      setWidget(_id, lines) { widget = lines; },
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
    assert.match(render(), /> ○ 1 Ask questions/);
    assert.match(render(), /INSTRUCTIONS — for this request/);
    assert.doesNotMatch(render(), /PREPEND|APPEND|\[[ x]\]/);
    picker.handleInput("1");
    assert.match(render(), /> ● 1 /);
    picker.handleInput("1");
    assert.match(render(), /> ○ 1 /);
    picker.handleInput("9"); // Absent numbered item is ignored.
    picker.handleInput("\x1b[A"); // Up wraps from the first snippet to the last.
    assert.match(render(), /> ○ 5 Diagnose, don't fix/);
    picker.handleInput("\x1b[B"); // Down wraps from the last snippet to the first.
    assert.match(render(), /> ○ 1 /);
    picker.handleInput("\x1b[B"); // Ordinary movement still advances one item.
    assert.match(render(), /> ○ 2 Session kickoff/);
    picker.handleInput("\x1b[A");
    assert.match(render(), /> ○ 1 /);
    picker.handleInput("\x1b[C");
    assert.match(render(), /Preview:/);
    assert.match(render(), /order 10 · bundled/);
    assert.doesNotMatch(render(), /prepend|append/);
    picker.handleInput("\x1b[D");
    assert.match(render(), /Prompt snippets/);
    for (const height of [12, 16, 24]) {
      tui.terminal.rows = height;
      for (const width of [20, 40, 100]) render(width);
    }
    picker.handleInput("\r"); // Highlight fallback.
  };
  await command.handler("", ctx);
  assert.deepEqual(widget, ["Instructions: Ask questions"]);
  const fallback = await consume();
  assert.equal(widget, undefined);
  assert.equal(fallback.action, "transform");
  assert.match(fallback.text, /^<user_request>\nhello\n<\/user_request>\n\n<request_instructions>\n/);
  assert.match(fallback.text, /Wait for my explicit confirmation before proceeding\.\n<\/request_instructions>$/);
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
      picker.handleInput("\x1b[A"); // The last item includes on-demand skills.
      assert.match(render(), /> ↳ · manual/);
      picker.handleInput("\x1b[B"); // Down wraps from the last skill to the first snippet.
      assert.match(render(), /> ○ 1 Ask questions/);
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

    // Request delimiters must not hide a skill command from Pi's expansion.
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

    // Legacy project placement is ignored in the menu, widget, and injected prompt.
    const legacyDirectory = join(directory, ".pi", "prompt-snippets");
    mkdirSync(legacyDirectory, { recursive: true });
    writeFileSync(join(legacyDirectory, "legacy.md"),
      "---\nname: Legacy\nplacement: prepend\norder: -1\n---\nLegacy guidance.");
    ctx.cwd = directory;
    ctx.isProjectTrusted = () => true;
    reset();
    interact = (picker, render) => {
      assert.match(render(), /> ○ 1 Legacy/);
      assert.doesNotMatch(render(), /PREPEND|APPEND/);
      picker.handleInput("1");
      picker.handleInput("\r");
    };
    await command.handler("", ctx);
    assert.deepEqual(widget, ["Instructions: Legacy"]);
    assert.deepEqual(await consume(), { action: "transform",
      text: "<user_request>\nhello\n</user_request>\n\n<request_instructions>\nLegacy guidance.\n</request_instructions>" });
    rmSync(legacyDirectory, { recursive: true });

    // Visibility merges defaults, global settings, and trusted project settings.
    const globalSettingsPath = join(agentDir, "prompt-snippets.json");
    const projectSettingsPath = join(directory, ".pi", "prompt-snippets.json");
    mkdirSync(join(directory, ".pi"), { recursive: true });
    ctx.cwd = directory;
    ctx.isProjectTrusted = () => false;
    const menuHasSkills = async (expected) => {
      const before = commandReads;
      interact = (picker, render) => {
        if (expected) assert.match(render(), /SKILLS — on-demand only/);
        else assert.doesNotMatch(render(), /SKILLS|manual/);
        picker.handleInput("\x1b");
      };
      await command.handler("", ctx);
      assert.equal(commandReads, before + (expected ? 1 : 0), "Disabled menus must skip skill discovery");
    };
    writeFileSync(projectSettingsPath, "invalid JSON");
    await menuHasSkills(true); // Untrusted project settings are not read.
    assert.deepEqual(notifications, []);
    writeFileSync(globalSettingsPath, '{"showOnDemandSkills":false}');
    await menuHasSkills(false);
    assert.deepEqual(notifications, []);
    writeFileSync(projectSettingsPath, '{"showOnDemandSkills":true,"shortcut":false}');
    await menuHasSkills(false); // Untrusted project cannot enable the section.
    ctx.isProjectTrusted = () => true;
    await menuHasSkills(true); // Trusted project overrides global false.
    assert.ok(shortcut);
    assert.equal(shortcutKey, "ctrl+\\"); // Project cannot disable the global shortcut.
    writeFileSync(projectSettingsPath, "{}");
    await menuHasSkills(false); // Omitted project field inherits global false.
    writeFileSync(globalSettingsPath, '{"showOnDemandSkills":true}');
    writeFileSync(projectSettingsPath, '{"showOnDemandSkills":false}');
    await menuHasSkills(false); // Trusted project can hide a globally enabled section.

    // Typed skill commands and snippet selection work with the section hidden.
    reset();
    interact = picker => { picker.handleInput("1"); picker.handleInput("\r"); };
    await command.handler("", ctx);
    const hiddenInput = await handlers.input({ text: "/skill:manual request", source: "interactive" }, ctx);
    assert.equal(hiddenInput.action, "transform");
    assert.match(hiddenInput.text, /^\/skill:manual /);
    assert.ok(hiddenInput.text.includes("request"));
    assert.equal((await consume()).action, "continue");

    writeFileSync(projectSettingsPath, '{"showOnDemandSkills":"false"}');
    await menuHasSkills(true); // Invalid project layer falls back to global true.
    assert.match(notifications.pop(), /"showOnDemandSkills" must be a boolean/);
    writeFileSync(globalSettingsPath, '{"showOnDemandSkills":false}');
    await menuHasSkills(false); // Invalid project layer preserves global false too.
    assert.match(notifications.pop(), /"showOnDemandSkills" must be a boolean/);
    writeFileSync(projectSettingsPath, '{"showOnDemandSkills":true}');
    await menuHasSkills(true); // Reopening the menu reads edits without /reload.
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
      assert.doesNotMatch(render(), /INSTRUCTIONS|PREPEND|APPEND/);
      picker.handleInput("\x1b[A"); // A one-item list stays on that item in both directions.
      assert.match(render(), /> ↳ · manual/);
      picker.handleInput("\x1b[B");
      assert.match(render(), /> ↳ · manual/);
      picker.handleInput("1");
      picker.handleInput(" ");
      picker.handleInput("\r");
    };
    await command.handler("", ctx);
    assert.equal(editorText, "/skill:manual skills only");
    assert.equal((await consume()).action, "continue");
    assert.deepEqual(notifications, []);
    writeFileSync(projectSettingsPath, '{"showOnDemandSkills":false}');
    const beforeEmptyMenu = commandReads;
    interact = () => assert.fail("An empty disabled menu must not open");
    await command.handler("", ctx);
    assert.equal(commandReads, beforeEmptyMenu);
    assert.match(notifications.pop(), /^No snippets found\./);
    assert.deepEqual(notifications, []);
  } finally {
    rmSync(directory, { recursive: true, force: true });
    handlers.session_shutdown();
  }
});
