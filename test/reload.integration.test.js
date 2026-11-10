import assert from "node:assert/strict";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";

const entry = process.env.PI_CODING_AGENT_ENTRY;

test("installed Pi reload refreshes direct and transitive helpers in the same process", {
  skip: !entry && "Set PI_CODING_AGENT_ENTRY to installed Pi dist/index.js",
}, async (t) => {
  const directory = mkdtempSync(join(tmpdir(), "snippet-reload-"));
  const agentDir = join(directory, "agent");
  const moduleDir = join(directory, "module");
  const previousAgentDir = process.env.PI_CODING_AGENT_DIR;
  process.env.PI_CODING_AGENT_DIR = agentDir;
  let loaded;
  const ctx = {
    cwd: moduleDir, mode: "tui", hasUI: true, isProjectTrusted: () => false,
    ui: {
      theme: { fg: (_color, text) => text, bold: text => text },
      setWidget() {},
      notify: assert.fail,
      async custom(factory) {
        let result;
        const picker = factory({ terminal: { rows: 24 }, requestRender() {} }, ctx.ui.theme, {}, value => { result = value; });
        picker.handleInput("\r"); // Select the highlighted bundled snippet.
        return result;
      },
    },
  };
  t.after(async () => {
    if (loaded) {
      for (const handler of loaded.handlers.get("session_shutdown") ?? []) await handler({}, ctx);
    }
    if (previousAgentDir === undefined) delete process.env.PI_CODING_AGENT_DIR;
    else process.env.PI_CODING_AGENT_DIR = previousAgentDir;
    rmSync(directory, { recursive: true, force: true });
  });

  const root = fileURLToPath(new URL("../", import.meta.url));
  for (const path of ["extensions", "src", "package.json"]) cpSync(join(root, path), join(moduleDir, path), { recursive: true });
  // Avoid reading real user settings or discovering skills in the fixture.
  mkdirSync(agentDir);
  writeFileSync(join(agentDir, "prompt-snippets.json"), '{"showOnDemandSkills":false}');

  const loaderUrl = new URL("core/extensions/loader.js", pathToFileURL(entry));
  const { loadExtensionsCached, clearExtensionCache } = await import(loaderUrl.href);
  const extensionPath = join(moduleDir, "extensions", "prompt-snippets", "index.ts");
  const extensionSource = readFileSync(extensionPath, "utf8");
  const snippetsPath = join(moduleDir, "src", "snippets.ts");
  const skillsPath = join(moduleDir, "src", "skills.ts");
  const snippetsSource = readFileSync(snippetsPath, "utf8");
  const skillsSource = readFileSync(skillsPath, "utf8");

  async function reload() {
    if (loaded) {
      for (const handler of loaded.handlers.get("session_shutdown") ?? []) await handler({}, ctx);
    }
    // Use Pi's loader and the same cache invalidation as ResourceLoader.reload().
    clearExtensionCache();
    const result = await loadExtensionsCached([extensionPath], moduleDir);
    assert.deepEqual(result.errors, []);
    assert.equal(result.extensions.length, 1);
    loaded = result.extensions[0];
    for (const handler of loaded.handlers.get("session_start") ?? []) await handler({}, ctx);
  }

  async function transform() {
    await loaded.commands.get("snippets").handler("", ctx);
    const handlers = loaded.handlers.get("input");
    assert.equal(handlers.length, 1);
    const result = await handlers[0]({ text: "request", source: "interactive" }, ctx);
    assert.equal(result.action, "transform");
    return result.text;
  }

  // Model an upgrade from cached JavaScript helpers without restarting Pi.
  writeFileSync(join(moduleDir, "src", "snippets.js"), snippetsSource.replaceAll("request_instructions", "legacy_instructions"));
  writeFileSync(join(moduleDir, "src", "skills.js"), skillsSource.replace('"./snippets.ts"', '"./snippets.js"'));
  writeFileSync(extensionPath, extensionSource.replaceAll("src/snippets.ts", "src/snippets.js").replaceAll("src/skills.ts", "src/skills.js"));
  await reload();
  assert.match(await transform(), /<legacy_instructions>/);

  writeFileSync(extensionPath, extensionSource);
  rmSync(join(moduleDir, "src", "snippets.js"));
  rmSync(join(moduleDir, "src", "skills.js"));
  await reload();
  const baseline = await transform();
  assert.match(baseline, /^<user_request>\nrequest\n<\/user_request>/);
  assert.match(baseline, /<request_instructions>/);
  assert.doesNotMatch(baseline, /legacy_instructions/);

  // Change both levels of the actual import graph, twice, at the same paths.
  const originalCall = ": applySnippets(text, active);";
  assert.ok(skillsSource.includes(originalCall));
  for (const generation of [1, 2]) {
    writeFileSync(snippetsPath, snippetsSource.replaceAll("request_instructions", `instructions_reload_${generation}`));
    writeFileSync(skillsPath, skillsSource.replace(originalCall, `: applySnippets(text + " helper reload ${generation}", active);`));
    await reload();
    const transformed = await transform();
    assert.match(transformed, new RegExp(`<instructions_reload_${generation}>`));
    assert.ok(transformed.includes(`request helper reload ${generation}`));
    assert.doesNotMatch(transformed, /<request_instructions>|legacy_instructions/);
  }

  // Restoring source also takes effect without a process restart.
  writeFileSync(snippetsPath, snippetsSource);
  writeFileSync(skillsPath, skillsSource);
  await reload();
  assert.equal(await transform(), baseline);
});
