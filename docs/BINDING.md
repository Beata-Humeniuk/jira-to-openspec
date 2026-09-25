# Binding and conversion

## Issue binding

A `jira:` front matter block binds a Markdown file to a Jira issue. Downloaded
files receive one automatically:

```yaml
---
jira:
  url: https://example.atlassian.net/browse/PROJ-2
  updated: 2026-09-25T10:11:12.000+0000
change: add-2fa
key: PROJ-2
issueType: Story
status: In Progress
epic: PROJ-1
generator: jira-to-openspec@0.1.0
generated: 2026-09-25
managed: true
---

# Add two-factor login

## Why
...
```

- `url` names the issue. `updated` is the issue's last-change time in Jira when
  the file was downloaded or pushed; Push and Pull compare it with Jira to
  notice changes made there meanwhile.
- `change` is the OpenSpec change. For a `proposal.md` inside
  `changes/<change>/`, the folder name wins, so renaming the folder renames the
  change on the next push.
- `key`, `issueType`, `status`, and `epic` describe the issue at the last
  download. They are refreshed by Pull and not sent to Jira.
- Keys you add yourself are kept by Pull.

The first `#` heading is the issue summary. If there is none, the change name
is used.

## Markdown ↔ Jira markup

Descriptions are exchanged as Jira wiki markup through REST API v2, which Cloud
and Server/Data Center both support. These survive a round trip unchanged:

| Markdown | Jira |
|---|---|
| `## Heading` | `h2. Heading` |
| `**bold**`, `_italic_`, `~~struck~~` | `*bold*`, `_italic_`, `-struck-` |
| `` `code` `` | `{{code}}` |
| `[text](https://…)`, bare links | `[text\|https://…]`, bare links |
| `- item`, nested lists, `1. item` | `* item`, `** item`, `# item` |
| `- [ ] 1.1 Task` | `* [ ] 1.1 Task` (the checkbox is text in Jira) |
| `> quote` | `{quote}…{quote}` |
| ```` ```lang ```` fences | `{code:lang}` (without a language: `{noformat}`) |
| Tables | `\|\|head\|\|` and `\|cell\|` rows |
| `---` | `----` |

Jira constructs without a Markdown counterpart — mentions (`[~accountid:…]`),
attached images (`!file.png!`), colours, panels — stay in the file as written
and go back to Jira unchanged. Panels and colour macros lose their frame.

Edits made in Jira's rich editor on Cloud are stored as Atlassian Document
Format; Jira converts them to wiki markup for the API, so unusual formatting may
come back simplified.
