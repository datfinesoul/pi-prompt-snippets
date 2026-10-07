import { existsSync, lstatSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {"prepend" | "append"} Placement
 * @typedef {"bundled" | "global" | "project"} SnippetSource
 * @typedef {{
 *   id: string,
 *   name?: string,
 *   description?: string,
 *   placement?: Placement,
 *   order?: number,
 *   enabled?: boolean,
 *   body?: string,
 * }} SnippetDefinition
 * @typedef {{
 *   id: string,
 *   name: string,
 *   description: string,
 *   placement: Placement,
 *   order: number,
 *   body: string,
 *   source: SnippetSource,
 *   path: string,
 * }} Snippet
 * @typedef {{ source: SnippetSource, directory: string }} SnippetLayer
 * @typedef {{ shortcut: string | null }} Settings
 */

export const DEFAULT_SHORTCUT = "ctrl+\\";
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
  if (meta.placement === "prepend" || meta.placement === "append") definition.placement = meta.placement;
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
 * @returns {Snippet[]} Prepend snippets first, then append snippets, each sorted by order and name.
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
      placement: entry.placement ?? "append",
      order: entry.order ?? DEFAULT_ORDER,
      body: entry.body,
      source: /** @type {SnippetSource} */ (entry.source),
      path: /** @type {string} */ (entry.path),
    });
  }

  const byOrder = (/** @type {Snippet} */ a, /** @type {Snippet} */ b) =>
    a.order - b.order || a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
  return [
    ...snippets.filter((s) => s.placement === "prepend").sort(byOrder),
    ...snippets.filter((s) => s.placement === "append").sort(byOrder),
  ];
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
 * Combine active snippet bodies with the typed message.
 *
 * @param {string} text
 * @param {Snippet[]} active Snippets in display order.
 * @returns {string}
 */
export function applySnippets(text, active) {
  const prepends = active.filter((s) => s.placement === "prepend").map((s) => s.body);
  const appends = active.filter((s) => s.placement === "append").map((s) => s.body);
  return [...prepends, text, ...appends].join("\n\n");
}

/**
 * Parse the optional settings document.
 *
 * @param {string} contents
 * @param {string} source
 * @returns {Settings}
 */
export function parseSettings(contents, source) {
  let config;
  try {
    config = JSON.parse(contents);
  } catch (error) {
    throw new Error(`${source}: invalid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  if (config === null || typeof config !== "object" || Array.isArray(config)) {
    throw new Error(`${source}: settings must be an object`);
  }

  if (config.shortcut === undefined) return { shortcut: DEFAULT_SHORTCUT };
  if (config.shortcut === null || config.shortcut === false || config.shortcut === "") return { shortcut: null };
  if (typeof config.shortcut !== "string") {
    throw new Error(`${source}: "shortcut" must be a key string, or null/false to disable the shortcut`);
  }
  return { shortcut: config.shortcut.trim().toLowerCase() };
}

/**
 * Read settings from a file, falling back to defaults when it does not exist.
 *
 * @param {string} settingsPath
 * @returns {Settings}
 */
export function readSettings(settingsPath) {
  if (!existsSync(settingsPath)) return { shortcut: DEFAULT_SHORTCUT };
  return parseSettings(readFileSync(settingsPath, "utf8"), settingsPath);
}
