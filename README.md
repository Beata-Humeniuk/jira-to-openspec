# Jira to OpenSpec

Download Jira issues as [OpenSpec](https://github.com/Fission-AI/OpenSpec)
change proposals, edit them in VS Code, and push them back to Jira. Download a
single issue, or a whole epic with all its stories and tasks. The extension
works with Jira Cloud and Server/Data Center.

**No telemetry.** The extension connects only to the Jira host in the link you
provide. No Jira addresses are built into the code.

## Setup

Add your credentials in the extension settings:

- **Cloud:** set `jiraToOpenspec.token` to an
  [Atlassian API token](https://id.atlassian.com/manage-profile/security/api-tokens)
  and `jiraToOpenspec.email` to your Atlassian account e-mail. The same API
  token works for Confluence to Markdown.
- **Server/Data Center:** set `jiraToOpenspec.token` to a Personal Access Token
  from your Jira profile.

You do not need to configure an instance address. The extension reads the host
and context path from each link, so you can work with multiple instances.

## Where the change name lives in Jira

Each issue says which OpenSpec change it belongs to. By default this is a
**label** with the `openspec:` prefix — for example `openspec:add-2fa` for the
change `openspec/changes/add-2fa/`. Labels exist on every issue type in every
Jira, so there is nothing to set up: type the label in the issue's **Labels**
field.

If your Jira administrator prefers a dedicated field, ask for a custom field of
type *Text Field (single line)*, for example **OpenSpec Change**, added to the
screens of your stories and tasks. Then set `jiraToOpenspec.changeField` to its
name (`OpenSpec Change`) or id (`customfield_10050`).

Change names are kebab-case, as OpenSpec expects. A name typed differently in a
custom field (`Add 2FA`) is saved as `add-2fa`.

## Download an issue or an epic

1. Run **Jira: Download Issue or Epic**.
2. Paste the issue link. `/browse/PROJ-123`, board links with `selectedIssue`,
   `/projects/PROJ/issues/PROJ-123`, context paths, and non-standard ports are
   supported.
3. For an epic, choose which of its issues to download. Every story and task in
   the epic is preselected; the epic itself is preselected only when it names a
   change.

Each issue is saved as the proposal of its change:

```text
openspec/changes/
  add-2fa/
    proposal.md      ← PROJ-2 (Story, label openspec:add-2fa)
    PROJ-3.md        ← PROJ-3 (Task, also openspec:add-2fa)
  proj-4-remember-this-device/
    proposal.md      ← PROJ-4 (no change name yet)
```

- The issue summary becomes the `#` heading and the description the body,
  converted from Jira markup to Markdown.
- When several issues name the same change, the first becomes `proposal.md`
  and the others are saved next to it as `<KEY>.md`.
- An issue without a change name gets one made from its key and summary. Push
  writes that name to Jira.
- Downloading an issue again refreshes the file it was saved to, even when the
  change was renamed since. Archived changes are not touched.
- A `proposal.md` you wrote locally is replaced only after you confirm.

`tasks.md`, `design.md`, and spec deltas are yours: the extension never writes
them.

## Update a file from Jira

Open the Markdown preview: a file bound to an issue shows a small **↻ Pull**
button in its top right corner. You can also run **Jira: Pull Issue**.

The extension compares the issue's last-updated time first. If nothing changed,
nothing happens. Otherwise it asks before replacing the file content, because
edits you have not pushed are lost. Your own front matter keys are kept.

## Push to Jira

Open the Markdown file and run **Jira: Push Issue**, or click **↑ Push** in the
Markdown preview of a bound file; it asks first and saves unsaved edits.

- **A bound file** (with a `jira:` block) updates its issue: the `#` heading
  becomes the summary and the rest the description. If the issue changed in
  Jira since your last download or push, the extension asks before
  overwriting it.
- **An unbound file** creates an issue. Paste a link to the epic it belongs to,
  or to a project, and choose Story or Task. A proposal written with OpenSpec
  (`openspec/changes/<change>/proposal.md`) can be pushed as is.

Push also sets the change name in Jira: the folder name for a `proposal.md`,
otherwise the `change:` line of the front matter. Other labels are left alone.

See [Binding and conversion](docs/BINDING.md) for the front matter format and
the Markdown that survives a round trip.

## Settings

| Setting | Default | Purpose |
|---|---|---|
| `jiraToOpenspec.token` | — | Jira token for all instances. |
| `jiraToOpenspec.email` | — | Atlassian account e-mail. Cloud only. |
| `jiraToOpenspec.openspecFolder` | `openspec` | The OpenSpec folder; changes go to its `changes/`. Relative to the workspace root. |
| `jiraToOpenspec.changeField` | `labels` | Where the change name lives: `labels`, or a custom field name or id. |
| `jiraToOpenspec.changeLabelPrefix` | `openspec:` | The label prefix when `changeField` is `labels`. |

The token is stored in VS Code settings, which may be synced or shared.
Restricted Mode is supported.

## API for other extensions

`jiraToOpenspec.publishIssue` takes an optional `vscode.Uri` of a Markdown file
and pushes that file, read from disk, without opening it:

```js
const result = await vscode.commands.executeCommand('jiraToOpenspec.publishIssue', proposalUri);
```

| Outcome | Result |
|---|---|
| Pushed | `{ url: string, key: string, action: "created" \| "updated" }` |
| A prompt was cancelled | `undefined` |
| Failed | Rejects with an `Error`; `message` is ready to show to the user |

Prompts still appear when they are needed — for the token, the parent epic, or
an issue that changed in Jira — so call this only where a person can answer
them.

[MIT License](LICENSE) · [Changelog](CHANGELOG.md)
