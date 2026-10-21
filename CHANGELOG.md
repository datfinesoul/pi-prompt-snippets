# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/datfinesoul/pi-prompt-snippets/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/datfinesoul/pi-prompt-snippets/compare/v0.1.1...v0.2.0
[0.1.1]: https://github.com/datfinesoul/pi-prompt-snippets/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/datfinesoul/pi-prompt-snippets/releases/tag/v0.1.0
