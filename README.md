# pi-prompt-snippets

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

A standalone [Pi](https://github.com/earendil-works/pi) extension for mixing and matching small, reusable prompt rules. Select snippets from a menu and Pi adds them before or after your next message. Unlike skills, each snippet is a short standalone instruction chosen for one message at a time.

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

</details>

> [!NOTE]
> If this package replaces a manually installed `.pi/extensions/prompt-snippets` or `~/.pi/agent/extensions/prompt-snippets` directory, remove the old copy so Pi does not load both. Move any custom snippets from the old copy's `snippets/` directory into a [snippet layer](#snippet-layers).

## Usage

- Press <kbd>Ctrl</kbd>+<kbd>\\</kbd> or run `/snippets` to open the toggle menu.
- Use <kbd>Up</kbd>/<kbd>Down</kbd> to navigate, <kbd>Space</kbd> to toggle, <kbd>Enter</kbd> to apply, and <kbd>Esc</kbd> to cancel.
- Press <kbd>Tab</kbd> to preview the selected snippet, including the layer and file it came from. Use <kbd>Up</kbd>/<kbd>Down</kbd> to scroll and <kbd>Tab</kbd> or <kbd>Esc</kbd> to return to the list.
- Active snippets appear in a widget above the editor. Snippets from the global or project layer are tagged in the menu.
- On send, the enabled prepend snippets, your message, and the enabled append snippets are combined in that order, separated by blank lines.
- Selections reset after each sent message and at session start.

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
placement: prepend
order: 10
---
Keep your response concise. Skip preamble and unnecessary explanation.
```

### Change a bundled snippet

Override only the fields you want to change. This example moves the bundled `diagnose-report` snippet to the prepend group and keeps its text:

```markdown
---
placement: prepend
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
| `placement` | No | `prepend` or `append`; defaults to `append` |
| `order` | No | Integer sort order within the placement group; defaults to `9999`, with ties broken by name |
| `enabled` | No | Set to `false` to remove the snippet from lower layers |

Frontmatter is optional; a file without it is used entirely as the body. Invalid field values are ignored rather than hiding the snippet. A new snippet without a body is skipped.

Files are rescanned whenever the menu opens or a message is sent, so edits take effect without `/reload`. Only regular `.md` files whose names start with a letter or digit and contain only letters, digits, dots, underscores, or hyphens are loaded; symbolic links are ignored. Each layer is limited to 256 directory entries and each file to 256 KiB.

## Keyboard shortcut

The default shortcut is <kbd>Ctrl</kbd>+<kbd>\\</kbd>. It was chosen because it works the same way on macOS and Linux terminals without extra setup and does not conflict with Pi's built-in keybindings. Option/Alt shortcuts such as <kbd>Alt</kbd>+<kbd>S</kbd> are unreliable on macOS: Terminal.app and iTerm2 type a character such as `ß` unless Option is configured to act as Meta.

Choose a different shortcut, or disable it, in `~/.pi/agent/prompt-snippets.json`:

```json
{
  "shortcut": "ctrl+shift+s"
}
```

Use `null` or `false` to disable the shortcut and use only `/snippets`. Keys use Pi's [key syntax](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/keybindings.md#key-syntax). Shortcuts with <kbd>Shift</kbd> on a <kbd>Ctrl</kbd> letter or with <kbd>Super</kbd> require a terminal with extended keyboard support, such as Kitty, Ghostty, WezTerm, or iTerm2. The shortcut is read when the extension loads; run `/reload` after changing it. It is a global setting only, because Pi registers shortcuts before project trust is resolved.

## How it works

The extension transforms only `interactive` input while at least one snippet is selected. It does not alter extension-injected messages, non-interactive prompts, or tool calls. If the extension is loaded more than once, the copies share their selection and only the most recently loaded copy transforms input, so snippets are never added twice. Snippets are prompt text, not a security boundary; see [SECURITY.md](SECURITY.md).

## Development

The package requires no runtime dependencies beyond the Pi host. Run the test suite and inspect the publishable package with:

```sh
npm test
npm run pack:check
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.

## License

[MIT](LICENSE) © Philip Hadviger
