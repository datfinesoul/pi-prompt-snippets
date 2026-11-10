# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.4.0] - 2026-11-10

### Changed

- Replace prepend and append groups with one instructions list, sorted by order, name, and ID.
- Label the menu and widget Instructions. Use `request_instructions` tags for the injected snippet block.
- Wrap list navigation in both directions, including on-demand skills. Up moves from the first item to the last. Down returns from the last item to the first.
- Append selected snippet bodies after the request in XML-style sections. Preserve the request text and choose alternate delimiters when either section contains matching tags.
- Remove `placement` from bundled snippets. Ignore the field in existing custom snippets without changing their files.
- Replace confidence thresholds in Ask questions and Verify, don't assume with checks for consequential uncertainty. Keep explicit confirmation in Ask questions.
- Use STE100-inspired wording in these two snippets, with one instruction per sentence.

### Fixed

- Use TypeScript runtime helpers so `/reload` refreshes imported logic instead of retaining cached JavaScript helpers in Pi 1.5.0.
- Test an upgrade from JavaScript helpers and repeated changes to direct and transitive helpers through Pi's loader in one process.

## [0.3.0] - 2026-11-09

### Added

- Add an on-demand skills section to the snippet menu for loaded skills with `disable-model-invocation: true`.
- Preview skill instructions and source paths. Insert a selected skill command into the editor without sending it.
- Preserve the draft as skill arguments and apply snippet checkbox changes. Refuse insertion when the draft starts with a slash command.
- Add `showOnDemandSkills` to global and trusted project settings. It defaults to `true` and refreshes when the menu opens. Disabling it hides the skills section and skips skill discovery.

### Fixed

- Keep skill commands intact when snippets modify their arguments, so Pi can expand the selected skill.
- Leave non-interactive input unchanged without consuming selected snippets.
- Warn about invalid or unreadable settings files and preserve lower-layer settings instead of failing extension loading.

## [0.2.0] - 2026-10-21

### Changed

- Align the snippet picker with Code Block Copy: use circular selection markers, number-key toggles for the first nine items, and non-wrapping navigation.
- Enter applies the highlighted snippet when none are checked and also works from preview.
- Left/Right open and close preview alongside the existing Tab controls, and the picker fits smaller terminals.

## [0.1.1] - 2026-10-16

### Changed

- Merges to `main` that bump the version are tagged `v<version>` automatically after CI passes, and pull requests that trigger CI must bump the version with a matching changelog section.

## [0.1.0] - 2026-10-07

### Added

- Initial standalone Pi package.
- Toggle menu, opened with `Ctrl+\` or `/snippets`, for selecting snippets to prepend or append to the next message.
- Layered snippet discovery: bundled defaults, global snippets in the Pi agent directory, and project snippets in `.pi/prompt-snippets/`.
- Field-by-field overrides by snippet ID, with `enabled: false` to remove a lower-layer snippet.
- Project snippets load only when Pi grants project trust.
- Configurable or disabled shortcut through `prompt-snippets.json` in the Pi agent directory.
- Protection against applying snippets twice when the extension is loaded more than once.
- Automated tests and open source project documentation.

[Unreleased]: https://github.com/datfinesoul/pi-prompt-snippets/compare/v0.4.0...HEAD
[0.4.0]: https://github.com/datfinesoul/pi-prompt-snippets/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/datfinesoul/pi-prompt-snippets/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/datfinesoul/pi-prompt-snippets/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/datfinesoul/pi-prompt-snippets/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/datfinesoul/pi-prompt-snippets/releases/tag/v0.1.0
