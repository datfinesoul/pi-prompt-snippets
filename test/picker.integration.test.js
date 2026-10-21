import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { test } from "node:test";

const entry = process.env.PI_CODING_AGENT_ENTRY;

test("installed Pi snippet picker: selection, preview, confirmation and cancellation", {
  skip: !entry && "Set PI_CODING_AGENT_ENTRY to installed Pi dist/index.js",
}, async () => {
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
  extension({
    on(name, handler) { handlers[name] = handler; },
    registerShortcut() {},
    registerCommand(_name, value) { command = value; },
  });
  let interact;
  const ctx = {
    mode: "tui", hasUI: true, cwd: process.cwd(), isProjectTrusted: () => false,
    ui: {
      theme: { fg: (_color, value) => value, bold: value => value },
      setWidget() {},
      notify() { assert.fail("Unexpected notification"); },
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
  handlers.session_shutdown();
});
