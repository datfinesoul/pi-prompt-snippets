# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

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

[Unreleased]: https://github.com/datfinesoul/pi-prompt-snippets/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/datfinesoul/pi-prompt-snippets/releases/tag/v0.1.0
