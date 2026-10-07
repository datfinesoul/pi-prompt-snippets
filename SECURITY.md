# Security Policy

## Supported versions

Security updates are provided for the latest released version on a best-effort basis.

## Reporting a vulnerability

Please do not report vulnerabilities in a public issue. Use GitHub's private vulnerability reporting feature on the repository's **Security** tab. If private reporting is unavailable, contact the maintainer through the contact method listed on the GitHub profile at <https://github.com/datfinesoul>.

Include a description of the issue, affected versions, reproduction steps, potential impact, and any suggested remediation. You should receive an acknowledgment within seven days. Please allow a reasonable amount of time for investigation and remediation before public disclosure.

## Security model

Pi extensions execute with the same operating-system permissions as Pi. Review extension source before installation. Snippet bodies are inserted verbatim into prompts sent to the model, so anyone who can edit a snippet directory can influence the model's instructions. Project snippets in `.pi/prompt-snippets/` are loaded only after Pi grants project trust; review them before trusting a repository. Snippet text is stripped of terminal control sequences before it is displayed, but it is not otherwise filtered.
