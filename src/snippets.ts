import {
  existsSync,
  lstatSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  realpathSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";

/**
 * @typedef {"bundled" | "global" | "project"} SnippetSource
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   description?: string,
 *   enabled?: boolean,
 *   body?: string,
 * }} SnippetDefinition
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   body: string,
 *   source: SnippetSource,
 *   path: string,
 * }} Snippet
 * @typedef {{ source: SnippetSource, directory: string }} SnippetLayer
 * @typedef {{ shortcut: string | null, showOnDemandSkills: boolean, order: readonly string[] }} Settings
 */

export const DEFAULT_SHORTCUT = "ctrl+\\";
export const DEFAULT_SNIPPET_ORDER = Object.freeze([
  "ask-questions",
  "session-kickoff",
  "pr-title-description",
  "verify-not-assume",
  "diagnose-report",
]);
export const DEFAULT_SETTINGS = Object.freeze({
  shortcut: DEFAULT_SHORTCUT,
  showOnDemandSkills: true,
  order: DEFAULT_SNIPPET_ORDER,
});
export const MAX_SNIPPET_BYTES = 256 * 1024;
export const MAX_SNIPPETS = 256;

const SNIPPET_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

/**
 * Parse one Markdown snippet file. Frontmatter is optional; without it the
 * whole file is the body. Unknown or invalid frontmatter values are ignored so
 * a single malformed field cannot hide a snippet.
 *
 * @param {string} id
 * @param {string} raw
 * @returns {SnippetDefinition}
 */
export function parseSnippet(id, raw) {
  const match = raw.match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)([\s\S]*)$/);
  const frontmatter = match ? match[1] : "";
  const body = (match ? match[2] : raw).trim();

  /** @type {Record<string, string>} */
  const meta = {};
  for (const line of frontmatter.split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z][\w-]*)\s*:\s*(.*)$/);
    if (kv) meta[kv[1].toLowerCase()] = kv[2].trim().replace(/^(["'])(.*)\1$/, "$2");
  }

  /** @type {SnippetDefinition} */
  const definition = { id };
  if (meta.name) definition.name = meta.name;
  if (meta.description !== undefined) definition.description = meta.description;
  if (meta.enabled === "false") definition.enabled = false;
  else if (meta.enabled === "true") definition.enabled = true;
  if (body) definition.body = body;
  return definition;
}

/**
 * Read every snippet definition from one directory. Missing directories yield
 * no definitions. Symbolic links, non-Markdown files, oversized files, and
 * files with unsupported names are skipped.
 *
 * @param {string} directory
 * @returns {(SnippetDefinition & { path: string })[]}
 */
export function readLayer(directory) {
  if (!existsSync(directory)) return [];

  let entries;
  try {
    entries = readdirSync(directory, { withFileTypes: true });
  } catch {
    return [];
  }

  const definitions = [];
  for (const entry of entries.slice(0, MAX_SNIPPETS)) {
    if (!entry.isFile() || !entry.name.toLowerCase().endsWith(".md")) continue;
    const id = entry.name.slice(0, -3);
    if (!SNIPPET_ID_PATTERN.test(id)) continue;

    const path = join(directory, entry.name);
    try {
      const stat = lstatSync(path);
      if (!stat.isFile() || stat.size > MAX_SNIPPET_BYTES) continue;
      definitions.push({ ...parseSnippet(id, readFileSync(path, "utf8")), path });
    } catch {
      // Skip unreadable or concurrently removed files.
    }
  }
  return definitions;
}

/**
 * Merge snippet layers from lowest to highest precedence. A later definition
 * with the same ID overrides only the fields it declares, inherits the body
 * when its own body is empty, and removes the snippet with `enabled: false`.
 *
 * @param {{ source: SnippetSource, definitions: (SnippetDefinition & { path: string })[] }[]} layers
 * @param {readonly string[]} [order]
 * @returns {Snippet[]} Snippets sorted by the configured order, then name and ID.
 */
export function mergeLayers(layers, order = DEFAULT_SNIPPET_ORDER) {
  /** @type {Map<string, Partial<Snippet> & { id: string }>} */
  const merged = new Map();

  for (const { source, definitions } of layers) {
    for (const definition of definitions) {
      if (definition.enabled === false) {
        merged.delete(definition.id);
        continue;
      }

      const { enabled: _enabled, ...fields } = definition;
      merged.set(definition.id, { ...merged.get(definition.id), ...fields, source });
    }
  }

  /** @type {Snippet[]} */
  const snippets = [];
  for (const entry of merged.values()) {
    if (!entry.body) continue;
    snippets.push({
      id: entry.id,
      name: entry.name ?? entry.id,
      description: entry.description ?? "",
      body: entry.body,
      source: /** @type {SnippetSource} */ (entry.source),
      path: /** @type {string} */ (entry.path),
    });
  }

  return sortSnippets(snippets, order);
}

/**
 * Sort snippets by the configured ID list. Listed IDs keep the list order.
 * Unlisted snippets follow, sorted by name and then ID.
 *
 * @param {Snippet[]} snippets
 * @param {readonly string[]} order
 * @returns {Snippet[]}
 */
export function sortSnippets(snippets, order) {
  /** @type {Map<string, number>} */
  const positions = new Map();
  for (const id of order) {
    if (!positions.has(id)) positions.set(id, positions.size);
  }
  return snippets.sort((a, b) => {
    const aPosition = positions.get(a.id);
    const bPosition = positions.get(b.id);
    if (aPosition !== undefined && bPosition !== undefined) return aPosition - bPosition;
    if (aPosition !== undefined) return -1;
    if (bPosition !== undefined) return 1;
    return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  });
}

/**
 * Load and merge snippets from the given layers in precedence order.
 *
 * @param {SnippetLayer[]} layers
 * @param {readonly string[]} [order]
 * @returns {Snippet[]}
 */
export function loadSnippets(layers, order = DEFAULT_SNIPPET_ORDER) {
  return mergeLayers(layers.map(({ source, directory }) => ({ source, definitions: readLayer(directory) })), order);
}

/**
 * Append active snippet bodies in one instructions section after the typed message.
 * Choose tags absent from both sections without modifying their contents.
 *
 * @param {string} text
 * @param {Snippet[]} active Snippets in display order.
 * @returns {string}
 */
export function applySnippets(text, active) {
  if (active.length === 0) return text;
  const instructions = active.map((s) => s.body).join("\n\n");
  let suffix = "";
  let index = 0;
  const collides = (tag) => [text, instructions].some((content) =>
    content.includes(`<${tag}>`) || content.includes(`</${tag}>`));
  while (collides(`user_request${suffix}`) || collides(`request_instructions${suffix}`)) {
    suffix = `_${++index}`;
  }
  const requestTag = `user_request${suffix}`;
  const instructionsTag = `request_instructions${suffix}`;
  return `<${requestTag}>\n${text}\n</${requestTag}>\n\n<${instructionsTag}>\n${instructions}\n</${instructionsTag}>`;
}

/**
 * Parse the optional settings document.
 *
 * @param {string} contents
 * @param {string} source
 * @param {{ defaults?: Partial<Settings>, project?: boolean }} [options]
 * @returns {Settings}
 */
export function parseSettings(contents, source, { defaults = DEFAULT_SETTINGS, project = false } = {}) {
  let config;
  try {
    config = JSON.parse(contents);
  } catch (error) {
    throw new Error(`${source}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${source}: settings must be an object`);
  }

  const settings = withDefaults(defaults);
  // Shortcuts register before project trust is available, so ignore project values.
  if (!project && config.shortcut !== undefined) {
    if (config.shortcut === null || config.shortcut === false || config.shortcut === "") {
      settings.shortcut = null;
    } else if (typeof config.shortcut === "string") {
      settings.shortcut = config.shortcut.trim().toLowerCase();
    } else {
      throw new Error(`${source}: "shortcut" must be a key string, or null/false to disable the shortcut`);
    }
  }
  if (config.showOnDemandSkills !== undefined) {
    if (typeof config.showOnDemandSkills !== "boolean") {
      throw new Error(`${source}: "showOnDemandSkills" must be a boolean`);
    }
    settings.showOnDemandSkills = config.showOnDemandSkills;
  }
  if (config.order !== undefined) {
    if (!Array.isArray(config.order)) {
      throw new Error(`${source}: "order" must be an array of snippet IDs`);
    }
    /** @type {string[]} */
    const order = [];
    const seen = new Set();
    for (const id of config.order) {
      if (typeof id !== "string" || id.trim() === "") {
        throw new Error(`${source}: "order" must be an array of snippet IDs`);
      }
      const value = id.trim();
      if (!seen.has(value)) {
        seen.add(value);
        order.push(value);
      }
    }
    // An empty list inherits the lower layer; omit the field to do the same.
    if (order.length > 0) settings.order = order;
  }
  return settings;
}

/**
 * Fill missing settings fields without sharing the default order array.
 *
 * @param {Partial<Settings>} defaults
 * @returns {Settings}
 */
function withDefaults(defaults) {
  return {
    shortcut: defaults.shortcut !== undefined ? defaults.shortcut : DEFAULT_SETTINGS.shortcut,
    showOnDemandSkills: defaults.showOnDemandSkills !== undefined
      ? defaults.showOnDemandSkills
      : DEFAULT_SETTINGS.showOnDemandSkills,
    order: [...(defaults.order ?? DEFAULT_SETTINGS.order)],
  };
}

/**
 * Read one settings layer. Invalid layers warn and preserve inherited settings.
 *
 * @param {string} settingsPath
 * @param {{ defaults?: Partial<Settings>, project?: boolean, onWarning?: (message: string) => void }} [options]
 * @returns {Settings}
 */
export function readSettings(settingsPath, { defaults = DEFAULT_SETTINGS, project = false, onWarning = console.warn } = {}) {
  try {
    return parseSettings(readFileSync(settingsPath, "utf8"), settingsPath, { defaults, project });
  } catch (error) {
    if (error.code !== "ENOENT") {
      onWarning(`Prompt snippets settings: ${error instanceof Error ? error.message : String(error)}`);
    }
    return withDefaults(defaults);
  }
}

/**
 * Save one complete snippet order to a project settings file. Preserve other
 * fields, refuse invalid files, and use an atomic replacement.
 *
 * @param {string} settingsPath
 * @param {readonly string[]} order
 * @param {string} agentDir
 */
export function writeProjectOrder(settingsPath, order, agentDir) {
  const directory = dirname(settingsPath);
  mkdirSync(directory, { recursive: true });
  if (!lstatSync(directory).isDirectory()) {
    throw new Error("Project .pi must be a regular directory.");
  }

  // Reordering must not write the global settings file by accident.
  try {
    if (relative(realpathSync(agentDir), realpathSync(directory)) === "") {
      throw new Error("Project and global settings directories are the same.");
    }
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  /** @type {Record<string, unknown>} */
  let config = {};
  try {
    if (!lstatSync(settingsPath).isFile()) {
      throw new Error("Project settings must be a regular file.");
    }
    const parsed = JSON.parse(readFileSync(settingsPath, "utf8"));
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      throw new Error("Project settings must be a JSON object.");
    }
    config = parsed;
  } catch (error) {
    if (error.code !== "ENOENT") throw error;
  }

  const temporaryDirectory = mkdtempSync(join(directory, ".prompt-snippets-"));
  try {
    const draft = join(temporaryDirectory, "prompt-snippets.json");
    writeFileSync(draft, `${JSON.stringify({ ...config, order: [...order] }, null, 2)}\n`, { mode: 0o600 });
    renameSync(draft, settingsPath);
  } finally {
    rmSync(temporaryDirectory, { recursive: true, force: true });
  }
}
