import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {"bundled" | "global" | "project"} SnippetSource
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   description?: string,
 *   order?: number,
 *   enabled?: boolean,
 *   body?: string,
 * }} SnippetDefinition
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   order: number,
 *   body: string,
 *   source: SnippetSource,
 *   path: string,
 * }} Snippet
 * @typedef {{ source: SnippetSource, directory: string }} SnippetLayer
 * @typedef {{ shortcut: string | null, showOnDemandSkills: boolean }} Settings
 */

export const DEFAULT_SHORTCUT = "ctrl+\\";
export const DEFAULT_SETTINGS = Object.freeze({ shortcut: DEFAULT_SHORTCUT, showOnDemandSkills: true });
export const DEFAULT_ORDER = 9999;
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
  if (meta.order !== undefined && /^-?\d+$/.test(meta.order)) definition.order = Number.parseInt(meta.order, 10);
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
 * @returns {Snippet[]} Snippets sorted by order, name, and ID.
 */
export function mergeLayers(layers) {
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
      order: entry.order ?? DEFAULT_ORDER,
      body: entry.body,
      source: /** @type {SnippetSource} */ (entry.source),
      path: /** @type {string} */ (entry.path),
    });
  }

  const byOrder = (/** @type {Snippet} */ a, /** @type {Snippet} */ b) =>
    a.order - b.order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  return snippets.sort(byOrder);
}

/**
 * Load and merge snippets from the given layers in precedence order.
 *
 * @param {SnippetLayer[]} layers
 * @returns {Snippet[]}
 */
export function loadSnippets(layers) {
  return mergeLayers(layers.map(({ source, directory }) => ({ source, definitions: readLayer(directory) })));
}

/**
 * Append active snippet bodies in one guidance section after the typed message.
 * Choose tags absent from both sections without modifying their contents.
 *
 * @param {string} text
 * @param {Snippet[]} active Snippets in display order.
 * @returns {string}
 */
export function applySnippets(text, active) {
  if (active.length === 0) return text;
  const guidance = active.map((s) => s.body).join("\n\n");
  let suffix = "";
  let index = 0;
  const collides = (tag) => [text, guidance].some((content) =>
    content.includes(`<${tag}>`) || content.includes(`</${tag}>`));
  while (collides(`user_request${suffix}`) || collides(`request_guidance${suffix}`)) {
    suffix = `_${++index}`;
  }
  const requestTag = `user_request${suffix}`;
  const guidanceTag = `request_guidance${suffix}`;
  return `<${requestTag}>\n${text}\n</${requestTag}>\n\n<${guidanceTag}>\n${guidance}\n</${guidanceTag}>`;
}

/**
 * Parse the optional settings document.
 *
 * @param {string} contents
 * @param {string} source
 * @param {{ defaults?: Settings, project?: boolean }} [options]
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

  const settings = { ...defaults };
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
  return settings;
}

/**
 * Read one settings layer. Invalid layers warn and preserve inherited settings.
 *
 * @param {string} settingsPath
 * @param {{ defaults?: Settings, project?: boolean, onWarning?: (message: string) => void }} [options]
 * @returns {Settings}
 */
export function readSettings(settingsPath, { defaults = DEFAULT_SETTINGS, project = false, onWarning = console.warn } = {}) {
  try {
    return parseSettings(readFileSync(settingsPath, "utf8"), settingsPath, { defaults, project });
  } catch (error) {
    if (error.code !== "ENOENT") {
      onWarning(`Prompt snippets settings: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { ...defaults };
  }
}
