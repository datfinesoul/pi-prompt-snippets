# pi-prompt-snippets

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A standalone [Pi](https://github.com/earendil-works/pi) extension for mixing and matching small, reusable prompt rules. Select snippets from a menu and Pi appends them in one instructions block after your next request. Each snippet is a short standalone instruction chosen for one message at a time. The same menu also lists on-demand skills and inserts their commands into the editor.

Based on the original [Prompt Snippets extension](https://github.com/amosblomqvist/pi-config/tree/main/extensions/prompt-snippets) created by [Amos Blomqvist](https://github.com/amosblomqvist). This package expands that work with standalone packaging, layered configuration, and additional safeguards.

## Installation

### Global installation

Install from GitHub for use in every project. Pi records the package in `~/.pi/agent/settings.json`:

```sh
pi install git:github.com/datfinesoul/pi-prompt-snippets
```

### Project installation

From the target project directory, add `--local` (or `-l`) to record the package in `.pi/settings.json` for that project only:

```sh
pi install --local git:github.com/datfinesoul/pi-prompt-snippets
```

Project packages load only after Pi grants project trust. Run `/reload` in an existing Pi session or start a new session after either type of installation.

Where the extension is installed and where snippets come from are independent. A global installation still reads a trusted project's snippets, and a project installation still reads your global snippets. See [Snippet layers](#snippet-layers).

> [!NOTE]
> Pi identifies a package by where it was installed from. Installing pi-prompt-snippets globally and for a project from the same source is fine: the project installation replaces the global one. Installing it from different locations, such as GitHub globally and a local checkout for a project, loads both copies, and Pi does not reconcile them.

<details>
<summary>Install from a local checkout</summary>

Install a local checkout globally:

```sh
pi install /path/to/pi-prompt-snippets
```

Or for the current project only:

```sh
pi install --local /path/to/pi-prompt-snippets
```

To try the extension from a checkout without adding it to Pi's settings:

```sh
pi --no-extensions --extension ./extensions/prompt-snippets/index.ts
```

> If this package replaces a manually installed `.pi/extensions/prompt-snippets` or `~/.pi/agent/extensions/prompt-snippets` directory, remove the old copy so Pi does not load both. Move any custom snippets from the old copy's `snippets/` directory into a [snippet layer](#snippet-layers).

</details>

## Usage

- Press <kbd>Ctrl</kbd>+<kbd>\\</kbd> or run `/snippets` to open the toggle menu.
- Use <kbd>Up</kbd>/<kbd>Down</kbd> to navigate and <kbd>Space</kbd> or <kbd>1</kbd>–<kbd>9</kbd> to toggle snippets (`●` selected, `○` unselected). Number keys toggle the corresponding item without moving the cursor; items after nine use a dot instead of a number.
- Press <kbd>Up</kbd> at the first item to move to the last item, including skills when shown. Press <kbd>Down</kbd> at the last item to return to the first.
- Press <kbd>Enter</kbd> to apply the checked snippets, or the highlighted snippet if none are checked. This selects snippets for your next message; it does not copy to the clipboard. Press <kbd>Esc</kbd> to cancel without changing your active snippets.
- Press <kbd>Right</kbd> or <kbd>Tab</kbd> to preview the highlighted snippet, including the layer and file it came from. Use <kbd>Up</kbd>/<kbd>Down</kbd> to scroll, <kbd>Left</kbd>, <kbd>Tab</kbd>, or <kbd>Esc</kbd> to return to the list, and <kbd>Enter</kbd> to apply.
- Active snippets appear in a widget above the editor. Snippets from the global or project layer are tagged in the menu.
- On send, Pi puts your request first and the selected snippets in one instructions block after it. XML-style tags separate the sections.
- Snippets appear in one list, sorted by `order`, then name, then ID. The widget shows the selected instructions.
- Selections reset after each sent message and at session start. The injected text remains in conversation history while Pi retains that history.

### On-demand skills

The **SKILLS — on-demand only** section follows INSTRUCTIONS. It appears by default. Set [`showOnDemandSkills`](#menu-settings) to `false` to hide it. It lists only skills available to the current Pi session with this `SKILL.md` frontmatter field:

```yaml
disable-model-invocation: true
```

- Use <kbd>Up</kbd>/<kbd>Down</kbd> to highlight one skill. Space does not select skills, and number keys toggle snippets only.
- Use <kbd>Right</kbd> or <kbd>Tab</kbd> to preview the skill instructions and source path. The existing preview navigation keys also apply to skills.
- Press <kbd>Enter</kbd> from the list or preview to insert `/skill:name ` into the editor. Existing draft text becomes the skill arguments.
- Review the command, add arguments if needed, and send it yourself. Selection does not send the command or copy skill instructions into the draft.
- If the draft starts with a slash command, the menu shows a warning and remains open. The draft stays unchanged.
- Skill selection also applies snippet checkbox changes. Escape cancels the menu without changing the draft or active snippets.

The extension uses Pi's resolved skill list, including its trust and name-collision decisions. It does not scan additional skill directories. Run `/reload` after adding or removing skills. Skill names, descriptions, and paths follow Pi's loaded list. The menu reads the on-demand flag and preview instructions from those files when it opens. Unreadable skill files produce warnings instead of closing the menu.

## Snippet layers

Snippets are merged from three directories, from lowest to highest precedence:

| Layer | Directory | Notes |
|---|---|---|
| Bundled | [`extensions/prompt-snippets/snippets/`](extensions/prompt-snippets/snippets/) | Defaults shipped with the package |
| Global | `~/.pi/agent/prompt-snippets/` | Personal snippets for every project; follows `PI_CODING_AGENT_DIR` |
| Project | `<project>/.pi/prompt-snippets/` | Loaded from the working directory only after Pi grants project trust |

A snippet's ID is its file name without `.md`. A file whose ID already exists in a lower layer overrides that snippet field by field:

- Frontmatter fields it declares replace the inherited values; omitted fields are inherited.
- An empty body inherits the lower layer's body.
- `enabled: false` removes the snippet. A higher layer can restore it with its own body.

A file with a new ID adds a snippet.

### Add a snippet

Create `~/.pi/agent/prompt-snippets/concise.md`, or `.pi/prompt-snippets/concise.md` to share it with a project:

```markdown
---
name: Concise
description: Keep answers short and to the point
order: 10
---
Keep your response concise. Skip preamble and unnecessary explanation.
```

### Change a bundled snippet

Override only the fields you want to change. This example moves the bundled `diagnose-report` snippet earlier in the list and keeps its text:

```markdown
---
order: 5
---
```

### Remove a snippet

Hide the bundled `pr-title-description` snippet for one project with `.pi/prompt-snippets/pr-title-description.md`:

```markdown
---
enabled: false
---
```

### Snippet fields

| Field | Required | Notes |
|---|---|---|
| `name` | No | Display name; defaults to the ID |
| `description` | No | Shown next to the name in the toggle menu |
| `order` | No | Integer sort order; defaults to `9999`, with ties broken by name, then ID |
| `enabled` | No | Set to `false` to remove the snippet from lower layers |

The extension ignores legacy `placement` fields in custom snippets. These snippets still load, but all selected snippets enter the appended instructions block.

Frontmatter is optional; a file without it is used entirely as the body. Invalid field values are ignored rather than hiding the snippet. A new snippet without a body is skipped.

Files are rescanned whenever the menu opens or a message is sent, so edits take effect without `/reload`. Only regular `.md` files whose names start with a letter or digit and contain only letters, digits, dots, underscores, or hyphens are loaded; symbolic links are ignored. Each layer is limited to 256 directory entries and each file to 256 KiB.

## Menu settings

Menu settings use these layers, from lowest to highest precedence:

| Layer | Location | Notes |
|---|---|---|
| Default | Built into the extension | `showOnDemandSkills: true` |
| Global | `~/.pi/agent/prompt-snippets.json` | Applies to every project and follows `PI_CODING_AGENT_DIR` |
| Project | `<project>/.pi/prompt-snippets.json` | Overrides global menu settings only after Pi grants project trust |

An omitted field inherits its lower-layer value. A trusted project can enable the skills section even when global settings disable it. Installation scope does not change these layers.

### Hide on-demand skills

Add this setting to `.pi/prompt-snippets.json` for one trusted project, or to the global settings file for every project:

```json
{
  "showOnDemandSkills": false
}
```

When disabled, the menu skips skill discovery and skill file reads. Snippet selection and typed `/skill:name` commands still work. Set the value to `true` to restore the section.

The menu reads these settings each time it opens, so visibility changes do not need `/reload`. Invalid or unreadable settings files produce warnings and leave the lower-layer settings unchanged. Missing files simply inherit their lower-layer settings.

### Settings reference

| Field | Default | Scope | When changes apply |
|---|---|---|---|
| `showOnDemandSkills` | `true` | Global and trusted project | Next menu opening |
| `shortcut` | `ctrl+\\` | Global only | After `/reload` |

`showOnDemandSkills` accepts only JSON booleans. A project `shortcut` value is ignored. The global file can contain both fields.

## Keyboard shortcut

The default shortcut is <kbd>Ctrl</kbd>+<kbd>\\</kbd>. It was chosen because it works the same way on macOS and Linux terminals without extra setup and does not conflict with Pi's built-in keybindings. Option/Alt shortcuts such as <kbd>Alt</kbd>+<kbd>S</kbd> are unreliable on macOS: Terminal.app and iTerm2 type a character such as `ß` unless Option is configured to act as Meta.

Choose a different shortcut, or disable it, in `~/.pi/agent/prompt-snippets.json`:

```json
{
  "shortcut": "ctrl+shift+s"
}
```

Use `null` or `false` to disable the shortcut and use only `/snippets`. Keys use Pi's [key syntax](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/keybindings.md#key-syntax). Shortcuts with <kbd>Shift</kbd> on a <kbd>Ctrl</kbd> letter or with <kbd>Super</kbd> require a terminal with extended keyboard support, such as Kitty, Ghostty, WezTerm, or iTerm2. Run `/reload` after changing the shortcut.

**Configuration scope:** Snippet files and menu visibility support project overrides. The `shortcut` setting is global-only because the extension registers it during loading, before project trust is available. Configure it in `~/.pi/agent/prompt-snippets.json`, which follows `PI_CODING_AGENT_DIR`. A project `.pi/prompt-snippets.json` cannot override the shortcut. Its menu settings apply only after project trust is available.

## How it works

The extension transforms only `interactive` input while at least one snippet is selected. It does not alter extension-injected messages, non-interactive prompts, or tool calls. Without a selection, the input stays unchanged.

### Injected prompt structure

The request stays unchanged inside the first section. Selected snippet bodies form the second section, separated by blank lines. Snippet names and frontmatter do not enter the prompt.

```text
<user_request>
Your original message.
</user_request>

<request_instructions>
First selected snippet.

Second selected snippet.
</request_instructions>
```

If either section contains an opening or closing delimiter, the extension tries matching tags with numeric suffixes. For example, it tries `user_request_1` and `request_instructions_1` until neither section contains the chosen delimiters. It does not escape or change the contents.

For `/skill:name` input, the command stays first. The request section contains its arguments, and the instructions section follows. Pi then expands the skill through its normal command handler.

The tags are plain-text labels. They do not create higher-priority instructions or enforce action restrictions. Snippets are prompt text, not a security boundary. See [SECURITY.md](SECURITY.md).

If the extension loads more than once, the copies share their selection. Only the most recently loaded copy transforms input, so snippets are never added twice.

## Development

The package requires no runtime dependencies beyond the Pi host. The scripts work with npm or pnpm. Run the test suite and inspect the publishable package with:

```sh
npm test
npm run pack:check
```

Use `pnpm test` and `pnpm run pack:check` when you use pnpm.

Each feature branch that triggers CI gets one version update relative to its base. Keep that version unchanged throughout the branch. Record subsequent user-visible changes under the same matching `## [<version>] - <date>` changelog heading. Do not increment the patch version for each edit, fix, or conversation turn. CI requires the branch version to exceed its base version. Pull requests that change only Markdown skipped by CI are exempt. After merge and successful CI, the Release workflow tags the tested commit `v<version>`. Merges that do not change the version are not tagged.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE) © Philip Hadviger
