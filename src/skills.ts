import { readFileSync, statSync } from "node:fs";
import { applySnippets, MAX_SNIPPET_BYTES } from "./snippets.ts";

/**
 * @typedef {{
 *   kind: "skill", id: string, name: string, description: string,
 *   command: string, path: string, source: string, body: string,
 * }} SkillItem
 */

/**
 * Read only skills already resolved by Pi, using Pi's own YAML parser.
 * Do not discover extra paths or change Pi's trust and collision decisions.
 *
 * @param {import("@earendil-works/pi-coding-agent").SlashCommandInfo[]} commands
 * @param {(text: string) => { frontmatter: Record<string, unknown>, body: string }} parseFrontmatter
 * @returns {{ skills: SkillItem[], warnings: string[] }}
 */
export function loadOnDemandSkills(commands, parseFrontmatter) {
  const skills = [];
  const warnings = [];
  for (const command of commands) {
    if (command.source !== "skill" || !command.name.startsWith("skill:")) continue;
    const path = command.sourceInfo.path;
    try {
      const stat = statSync(path);
      if (!stat.isFile() || stat.size > MAX_SNIPPET_BYTES) {
        throw new Error("not a regular file or exceeds 256 KiB");
      }
      const { frontmatter, body } = parseFrontmatter(readFileSync(path, "utf8"));
      if (frontmatter["disable-model-invocation"] !== true) continue;
      skills.push({
        kind: "skill",
        id: command.name,
        name: command.name.slice("skill:".length),
        description: command.description ?? "",
        command: `/${command.name}`,
        path,
        source: command.sourceInfo.scope,
        body: body.trim(),
      });
    } catch (error) {
      warnings.push(`Cannot read skill ${command.name}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  skills.sort((a, b) => a.name.localeCompare(b.name));
  return { skills, warnings };
}

/** Return null rather than replacing or nesting an existing slash command. */
export function skillEditorText(command, draft) {
  return draft.trimStart().startsWith("/") ? null : `${command} ${draft}`;
}

/** Keep the command prefix intact so Pi expands the skill after input hooks. */
export function applyInputSnippets(text, active) {
  if (active.length === 0) return text;
  const skill = text.match(/^(\/skill:[^\s]+)(?: ([\s\S]*))?$/);
  return skill
    ? `${skill[1]} ${applySnippets(skill[2] ?? "", active)}`
    : applySnippets(text, active);
}
