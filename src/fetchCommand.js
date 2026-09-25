const vscode = require('vscode');
const { parseJiraUrl } = require('./jiraClient');
const { jiraContext, loadIssue, loadEpicChildren } = require('./issues');
const { derivedChangeName, placeIssues } = require('./openspecPaths');
const { issueDocument } = require('./issueDocument');
const { readSavedIssues, confirmOverwrite } = require('./savedIssues');
const { changesFolderUri } = require('./config');
const { credentialsFor } = require('./credentials');
const { errorMessage } = require('./messages');

function issuesWord(n) {
  return n === 1 ? 'issue' : 'issues';
}

function pickItem(issue, picked) {
  return {
    label: issue.key + '  ' + issue.summary,
    description: [issue.type, issue.status].filter(Boolean).join(' · '),
    detail: issue.change ? 'change: ' + issue.change
      : 'no change name in Jira — saved as ' + derivedChangeName(issue.key, issue.summary),
    issue,
    picked
  };
}

async function pickFromEpic(epic, children) {
  const picks = await vscode.window.showQuickPick(
    [pickItem(epic, !!epic.change)].concat(children.map((c) => pickItem(c, true))),
    {
      canPickMany: true,
      ignoreFocusOut: true,
      placeHolder: 'Epic ' + epic.key + ' has ' + children.length + ' ' + issuesWord(children.length) +
        ' — which ones should be saved as OpenSpec changes?'
    });
  return (picks || []).map((p) => p.issue);
}

function filesFor(folder, selected, saved) {
  const known = new Map(saved.filter((s) => s.key).map((s) => [s.key, s.relPath]));
  const owners = new Map(saved.map((s) => [s.relPath, s.key]));
  const entries = selected.map((issue) => ({
    key: issue.key,
    change: issue.change || derivedChangeName(issue.key, issue.summary),
    issue
  }));
  const places = placeIssues(entries, known, owners);
  return entries.map((entry) => {
    const relPath = places.get(entry.key);
    const segments = relPath.split('/');
    return {
      relPath,
      key: entry.key,
      derived: !entry.issue.change,
      uri: vscode.Uri.joinPath(folder, ...segments),
      dirUri: vscode.Uri.joinPath(folder, ...segments.slice(0, -1)),
      sameIssue: owners.get(relPath) === entry.key,
      content: issueDocument(entry.issue, segments[0])
    };
  });
}

async function fetchIssueCommand() {
  const folder = changesFolderUri();
  if (!folder) {
    vscode.window.showErrorMessage('Open a workspace folder first — issues are saved to its OpenSpec changes folder.');
    return;
  }
  const url = await vscode.window.showInputBox({
    prompt: 'Paste a link to a Jira issue — an epic downloads its stories and tasks too',
    placeHolder: 'https://…/browse/PROJ-123',
    ignoreFocusOut: true
  });
  if (!url) return;

  const parsed = parseJiraUrl(url);
  if (!parsed || !parsed.issueKey) {
    vscode.window.showErrorMessage(errorMessage(new Error('bad-url')));
    return;
  }
  const creds = await credentialsFor(parsed.site);
  if (!creds) return;

  let issue;
  let children;
  try {
    ({ issue, children } = await vscode.window.withProgress(
      { location: vscode.ProgressLocation.Notification, title: 'Downloading ' + parsed.issueKey + ' from Jira…' },
      async () => {
        const ctx = await jiraContext(creds, parsed.site);
        const found = await loadIssue(ctx, parsed.issueKey);
        return { issue: found, children: found.isEpic ? await loadEpicChildren(ctx, found.key) : [] };
      }));
  } catch (e) {
    vscode.window.showErrorMessage(errorMessage(e));
    return;
  }

  const selected = issue.isEpic ? await pickFromEpic(issue, children) : [issue];
  if (!selected.length) return;

  const files = filesFor(folder, selected, await readSavedIssues(folder));
  if (!await confirmOverwrite(files)) return;
  for (const file of files) {
    await vscode.workspace.fs.createDirectory(file.dirUri);
    await vscode.workspace.fs.writeFile(file.uri, Buffer.from(file.content, 'utf8'));
  }

  await vscode.window.showTextDocument(
    await vscode.workspace.openTextDocument(files[0].uri), { preview: false });
  const derived = files.filter((f) => f.derived).length;
  vscode.window.showInformationMessage(
    'Saved ' + files.length + ' ' + issuesWord(files.length) + ' to ' +
    vscode.workspace.asRelativePath(folder, false) + '/: ' +
    files.map((f) => f.key + ' → ' + f.relPath).join(', ') + '.' +
    (derived ? ' ' + derived + ' ' + issuesWord(derived) + ' had no change name in Jira; the name was made from the key and summary, and Push saves it in Jira.' : ''));
}

module.exports = { fetchIssueCommand, filesFor };
