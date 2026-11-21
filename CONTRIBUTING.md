# Contributing

Thank you for contributing to pi-prompt-snippets.

## Before you start

- Search existing issues and pull requests before opening a new one.
- Open an issue before making a substantial behavioral or architectural change.
- Report security issues according to [SECURITY.md](SECURITY.md), not in a public issue.
- Follow the [Code of Conduct](CODE_OF_CONDUCT.md) in all project spaces.

## Development setup

Requirements:

- Node.js 22.19 or newer, matching Pi's minimum supported version
- A current Pi installation for extension smoke testing

Clone the repository and run the tests:

```sh
git clone https://github.com/datfinesoul/pi-prompt-snippets.git
cd pi-prompt-snippets
npm test   # or: pnpm test
```

No dependency installation or build step is required. To load the working tree without enabling other extensions, run:

```sh
pi --no-extensions --extension ./extensions/prompt-snippets/index.ts
```

## Making changes

1. Create a focused branch from `main`.
2. Add or update tests for behavior changes.
3. Keep the extension dependency-free unless a dependency provides clear value that cannot reasonably be implemented with the Node.js standard library.
4. Update the README and changelog when user-visible behavior changes.
5. Set the version once per branch that triggers CI. Keep the version unchanged for the whole branch. Record later user-visible changes under the same `## [<version>] - <date>` heading. Do not increment the patch version for each edit, fix, or conversation turn.
6. Run `npm test` and `npm run pack:check`, or the `pnpm` equivalents.

CI requires a version above the base version, with exactly one matching versioned changelog heading above it. Pull requests that change only Markdown skipped by CI are exempt. After merge and a successful CI run, the Release workflow tags the tested commit `v<version>`. A merge that does not change the version is not tagged.

## Pull requests

Pull requests should explain the problem, the chosen solution, testing performed, and any compatibility implications. Keep changes focused and avoid unrelated formatting or refactoring. By submitting a contribution, you agree that it is licensed under the repository's [MIT License](LICENSE).

## Adding contributors

Contributors may add themselves to [CONTRIBUTORS.md](CONTRIBUTORS.md) in the same pull request as their contribution. Use a name or handle and an optional profile link; do not add another person's private contact information.
