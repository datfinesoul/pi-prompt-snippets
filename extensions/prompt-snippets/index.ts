/**
 * Prompt Snippets: mix-and-match single-purpose prompt rules.
 *
 * Snippets are Markdown files merged from three layers, lowest precedence
 * first: bundled defaults, the global snippet directory, and the trusted
 * project's `.pi/prompt-snippets` directory. Selected snippets are added to the
 * next interactive message and then cleared.
 */

import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getAgentDir } from "@earendil-works/pi-coding-agent";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Key, matchesKey, truncateToWidth, wrapTextWithAnsi } from "@earendil-works/pi-tui";
import { applySnippets, loadSnippets, readSettings } from "../../src/snippets.js";
import type { Snippet, SnippetLayer } from "../../src/snippets.js";

const extensionDirectory = dirname(fileURLToPath(import.meta.url));
const bundledSnippetsDirectory = join(extensionDirectory, "snippets");
const globalSnippetsDirectory = join(getAgentDir(), "prompt-snippets");
const settingsPath = join(getAgentDir(), "prompt-snippets.json");
const PROJECT_SNIPPETS_DIRECTORY = join(".pi", "prompt-snippets");
const WIDGET_ID = "prompt-snippets";

/**
 * State shared by every loaded copy of this extension. If the package is
 * accidentally loaded twice (for example, a package install plus a manual copy
 * in an extensions directory), only the most recently loaded copy transforms
 * input, so snippets are never applied twice.
 */
interface SharedState {
  owner: symbol;
  enabled: Set<string>;
}
const SHARED_STATE_KEY = Symbol.for("@datfinesoul/pi-prompt-snippets");
const globalRegistry = globalThis as typeof globalThis & { [SHARED_STATE_KEY]?: SharedState };

/** Remove terminal control sequences from untrusted text before rendering it. */
function safeDisplay(value: string): string {
  return value
    .replace(/\x1B(?:[@-_]|\[[0-?]*[ -/]*[@-~])/g, "")
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "");
}

function snippetLayers(ctx: ExtensionContext): SnippetLayer[] {
  const layers: SnippetLayer[] = [
    { source: "bundled", directory: bundledSnippetsDirectory },
    { source: "global", directory: globalSnippetsDirectory },
  ];
  // Project snippets are injected into prompts, so honor Pi's project trust.
  if (ctx.isProjectTrusted()) {
    layers.push({ source: "project", directory: join(ctx.cwd, PROJECT_SNIPPETS_DIRECTORY) });
  }
  return layers;
}

export default function promptSnippets(pi: ExtensionAPI) {
  const instance = Symbol("prompt-snippets-instance");
  const shared: SharedState = globalRegistry[SHARED_STATE_KEY] ?? { owner: instance, enabled: new Set() };
  shared.owner = instance;
  globalRegistry[SHARED_STATE_KEY] = shared;
  const isOwner = () => shared.owner === instance;

  const settings = readSettings(settingsPath);
  // Snippets last seen on disk (sorted). Refreshed whenever the menu opens or a message is sent.
  let snippets: Snippet[] = [];

  function refresh(ctx: ExtensionContext) {
    snippets = loadSnippets(snippetLayers(ctx));
    // Drop toggles for snippets that no longer exist.
    for (const id of shared.enabled) {
      if (!snippets.some((s) => s.id === id)) shared.enabled.delete(id);
    }
  }

  function updateWidget(ctx: ExtensionContext) {
    if (!ctx.hasUI || ctx.mode !== "tui") return;
    const active = snippets.filter((s) => shared.enabled.has(s.id));
    const prepends = active.filter((s) => s.placement === "prepend");
    const appends = active.filter((s) => s.placement === "append");

    if (active.length === 0) {
      ctx.ui.setWidget(WIDGET_ID, undefined);
      return;
    }

    const theme = ctx.ui.theme;
    const lines: string[] = [];
    if (prepends.length > 0) {
      lines.push(theme.fg("accent", `↑ prepend: ${prepends.map((s) => safeDisplay(s.name)).join(" · ")}`));
    }
    if (appends.length > 0) {
      lines.push(theme.fg("warning", `↓ append: ${appends.map((s) => safeDisplay(s.name)).join(" · ")}`));
    }
    ctx.ui.setWidget(WIDGET_ID, lines);
  }

  async function openMenu(ctx: ExtensionContext) {
    if (ctx.mode !== "tui") {
      ctx.ui.notify("Snippet menu requires interactive mode", "warning");
      return;
    }

    refresh(ctx);

    if (snippets.length === 0) {
      ctx.ui.notify(
        `No snippets found. Add Markdown files to ${globalSnippetsDirectory} or ${PROJECT_SNIPPETS_DIRECTORY}/`,
        "warning",
      );
      updateWidget(ctx);
      return;
    }

    // Working copy; only committed on confirm.
    const working = new Set(shared.enabled);

    const confirmed = await ctx.ui.custom<boolean>((tui, theme, _keybindings, done) => {
      const prepends = snippets.filter((s) => s.placement === "prepend");
      const appends = snippets.filter((s) => s.placement === "append");
      const items = [...prepends, ...appends];

      let mode: "list" | "preview" = "list";
      let cursor = 0;
      let listScroll = 0;
      let previewScroll = 0;

      const itemRow = (snippet: Snippet, idx: number, width: number): string => {
        const pointer = idx === cursor ? theme.fg("accent", "> ") : "  ";
        const checkbox = working.has(snippet.id) ? theme.fg("success", "●") : theme.fg("dim", "○");
        const number = idx < 9 ? String(idx + 1) : "·";
        const source = snippet.source === "bundled" ? "" : theme.fg("muted", ` [${snippet.source}]`);
        const desc = snippet.description ? theme.fg("dim", ` - ${safeDisplay(snippet.description)}`) : "";
        return truncateToWidth(`${pointer}${checkbox} ${number} ${theme.bold(safeDisplay(snippet.name))}${source}${desc}`, width);
      };

      /** List rows with the item index each row corresponds to (null for headers/blanks). */
      const buildListRows = (width: number): { text: string; itemIndex: number | null }[] => {
        const rows: { text: string; itemIndex: number | null }[] = [];
        if (prepends.length > 0) {
          rows.push({ text: theme.fg("dim", "↑ PREPEND - added before your message"), itemIndex: null });
          prepends.forEach((s, i) => rows.push({ text: itemRow(s, i, width), itemIndex: i }));
        }
        if (prepends.length > 0 && appends.length > 0) rows.push({ text: "", itemIndex: null });
        if (appends.length > 0) {
          rows.push({ text: theme.fg("dim", "↓ APPEND - added after your message"), itemIndex: null });
          appends.forEach((s, i) =>
            rows.push({ text: itemRow(s, prepends.length + i, width), itemIndex: prepends.length + i }),
          );
        }
        return rows;
      };

      const buildPreviewRows = (snippet: Snippet, width: number): string[] => {
        const rows: string[] = [];
        rows.push(truncateToWidth(theme.bold(safeDisplay(snippet.name)), width));
        rows.push(
          truncateToWidth(
            theme.fg("dim", safeDisplay(`${snippet.placement} · order ${snippet.order} · ${snippet.source} · ${snippet.path}`)),
            width,
          ),
        );
        rows.push(theme.fg("dim", "─".repeat(Math.min(width, 40))));
        for (const line of safeDisplay(snippet.body).split("\n")) {
          for (const wrapped of wrapTextWithAnsi(line, width)) {
            rows.push(truncateToWidth(wrapped, width));
          }
        }
        return rows;
      };

      /**
       * Slice `lines` to a scrollable viewport of at most `maxView` lines,
       * reserving indicator slots when clipped. When `focusRow` is given,
       * scrolls so it stays visible.
       */
      const viewport = (
        lines: string[],
        scroll: number,
        maxView: number,
        focusRow?: number,
      ): { out: string[]; scroll: number } => {
        const clipped = lines.length > maxView;
        const view = clipped ? Math.max(1, maxView - 2) : maxView;

        let s = Math.min(Math.max(0, scroll), Math.max(0, lines.length - view));
        if (focusRow !== undefined) {
          if (focusRow < s) s = focusRow;
          else if (focusRow >= s + view) s = focusRow - view + 1;
        }

        const visible = lines.slice(s, s + view);
        if (!clipped) return { out: visible, scroll: s };

        const above = s;
        const below = lines.length - (s + view);
        return {
          out: [
            above > 0 ? theme.fg("dim", `  ↑ ${above} more`) : "",
            ...visible,
            below > 0 ? theme.fg("dim", `  ↓ ${below} more`) : "",
          ],
          scroll: s,
        };
      };

      const confirm = () => {
        // Like CBC, Enter uses the highlighted item when none are checked.
        if (working.size === 0) working.add(items[cursor].id);
        done(true);
      };

      return {
        render(width: number): string[] {
          // Reserve lines for: top border, title, blank, blank, hints, bottom border.
          const maxView = Math.max(1, tui.terminal.rows - 7);

          let content: string[];
          let title: string;
          let hints: string;
          if (mode === "list") {
            const rows = buildListRows(width);
            const cursorRow = rows.findIndex((r) => r.itemIndex === cursor);
            const v = viewport(rows.map((r) => r.text), listScroll, maxView, cursorRow);
            content = v.out;
            listScroll = v.scroll;
            title = "Prompt snippets";
            hints = "↑↓ move • →/Tab preview • 1-9/Space toggle • Enter apply • Esc cancel";
          } else {
            const snippet = items[cursor];
            const v = viewport(buildPreviewRows(snippet, width), previewScroll, maxView);
            content = v.out;
            previewScroll = v.scroll;
            title = `Preview: ${safeDisplay(snippet.name)}`;
            hints = "↑↓ scroll • ←/Tab/Esc back • Enter apply";
          }

          return [
            theme.fg("accent", "─".repeat(width)),
            truncateToWidth(` ${theme.fg("accent", theme.bold(title))}`, width),
            "",
            ...content.map((line) => truncateToWidth(line, width)),
            "",
            truncateToWidth(theme.fg("dim", ` ${hints}`), width),
            theme.fg("accent", "─".repeat(width)),
          ];
        },
        invalidate() {},
        handleInput(data: string) {
          if (mode === "list") {
            if (matchesKey(data, Key.up)) {
              cursor = Math.max(0, cursor - 1);
            } else if (matchesKey(data, Key.down)) {
              cursor = Math.min(items.length - 1, cursor + 1);
            } else if (matchesKey(data, Key.space)) {
              const id = items[cursor].id;
              if (working.has(id)) working.delete(id);
              else working.add(id);
            } else if (matchesKey(data, Key.tab) || matchesKey(data, Key.right)) {
              mode = "preview";
              previewScroll = 0;
            } else if (matchesKey(data, Key.enter)) {
              confirm();
              return;
            } else if (matchesKey(data, Key.escape)) {
              done(false);
              return;
            } else {
              const number = ["1", "2", "3", "4", "5", "6", "7", "8", "9"].find((key) => matchesKey(data, key));
              const snippet = number ? items[Number(number) - 1] : undefined;
              if (!snippet) return;
              if (working.has(snippet.id)) working.delete(snippet.id);
              else working.add(snippet.id);
            }
            tui.requestRender();
          } else {
            if (matchesKey(data, Key.up)) {
              previewScroll--;
            } else if (matchesKey(data, Key.down)) {
              previewScroll++;
            } else if (matchesKey(data, Key.tab) || matchesKey(data, Key.escape) || matchesKey(data, Key.left)) {
              mode = "list";
            } else if (matchesKey(data, Key.enter)) {
              confirm();
              return;
            } else {
              return;
            }
            tui.requestRender();
          }
        },
      };
    });

    if (confirmed) {
      shared.enabled.clear();
      for (const id of working) shared.enabled.add(id);
    }
    updateWidget(ctx);
  }

  pi.on("session_start", (_event, ctx) => {
    if (!isOwner()) return;
    shared.enabled.clear();
    refresh(ctx);
    updateWidget(ctx);
  });

  pi.on("input", async (event, ctx) => {
    if (!isOwner() || shared.enabled.size === 0) return { action: "continue" };

    refresh(ctx);
    const active = snippets.filter((s) => shared.enabled.has(s.id));
    shared.enabled.clear();
    updateWidget(ctx);

    if (active.length === 0) return { action: "continue" };
    return { action: "transform", text: applySnippets(event.text, active) };
  });

  pi.on("session_shutdown", () => {
    if (isOwner()) delete globalRegistry[SHARED_STATE_KEY];
  });

  if (settings.shortcut) {
    pi.registerShortcut(settings.shortcut as Parameters<ExtensionAPI["registerShortcut"]>[0], {
      description: "Toggle prompt snippets",
      handler: async (ctx) => {
        await openMenu(ctx);
      },
    });
  }

  pi.registerCommand("snippets", {
    description: "Open the prompt snippet toggle menu",
    handler: async (_args, ctx) => {
      await openMenu(ctx);
    },
  });
}
