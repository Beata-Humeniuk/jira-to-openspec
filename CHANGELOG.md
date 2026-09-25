# Changelog

This file lists user-visible changes to Jira to OpenSpec. The project follows
[Semantic Versioning](https://semver.org/).

## [0.1.0] - 2026-09-25

### Added

- **Jira: Download Issue or Epic** saves an issue as the `proposal.md` of its
  OpenSpec change. For an epic, pick which of its stories and tasks to save.
- The change name lives in Jira as an `openspec:<change>` label, or in a custom
  field named in `jiraToOpenspec.changeField`.
- **Jira: Pull Issue** and a **↻ Pull** button in the Markdown preview update a
  file from its issue after checking whether it changed.
- **Jira: Push Issue** and a **↑ Push** button update the bound issue, or create
  a story or task in an epic or project for a new proposal, and set the change
  name in Jira.
- `jiraToOpenspec.publishIssue` accepts a file URI and returns
  `{ url, key, action }` for other extensions.
