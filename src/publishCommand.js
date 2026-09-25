const vscode = require('vscode');
const { mdToWiki } = require('./mdToWiki');
const { parseFrontMatter, serializeFrontMatter, frontMatterValue, withFrontMatterValue } = require('./frontMatter');
const { parseJiraUrl, isCloud, issueWebUrl, fetchIssue, createIssue, updateIssue } = require('./jiraClient');
const { jiraContext, loadIssue } = require('./issues');
const { changeUpdate, changeCreateFields } = require('./changeField');
const { changeName, changeOfPath } = require('./openspecPaths');
const { credentialsFor } = require('./credentials');
const { errorMessage } = require('./messages');

const ISSUE_TYPES = ['Story', 'Task'];

function baseName(path) {
  return String(path || '').split(/[\\/]/).pop() || '';
}

function splitTitleAndBody(mdBody, fallbackTitle) {
  const h1 = mdBody.match(/^#[ \t]+(.+)\r?\n?/m);
  if (!h1) return { title: fallbackTitle, content: mdBody };
  return { title: h1[1].trim(), content: mdBody.replace(h1[0], '') };
}

function editorSource(editor) {
  return {
    uri: editor.document.uri,
    text: editor.document.getText(),
    fileName: baseName(editor.document.fileName),
    editor
  };
}

async function uriSource(uri) {
  return {
    uri,
    text: Buffer.from(await vscode.workspace.fs.readFile(uri)).toString('utf8'),
    fileName: baseName(uri.fsPath || uri.path),
    editor: null
  };
}

// The change a file stands for: the folder of an OpenSpec proposal, otherwise
// the `change:` line of its front matter.
function changeOfSource(source, extraLines) {
  return changeName(changeOfPath(source.uri.path) || frontMatterValue(extraLines, 'change'));
}

async function writeBinding(source, meta, change) {
  const text = source.editor ? source.editor.document.getText() : source.text;
  const { rawLength, extraLines } = parseFrontMatter(text);
  const lines = change ? withFrontMatterValue(extraLines, 'change', change) : extraLines;
  const fm = serializeFrontMatter(meta, lines) + (rawLength ? '' : '\n');
  if (!source.editor) {
    await vscode.workspace.fs.writeFile(source.uri, Buffer.from(fm + text.slice(rawLength), 'utf8'));
    return;
  }
  const document = source.editor.document;
  await source.editor.edit((edit) => {
    edit.replace(new vscode.Range(document.positionAt(0), document.positionAt(rawLength)), fm);
  });
}

async function publishUpdate(source, meta, title, description, change) {
  const parsed = parseJiraUrl(meta.url);
  if (!parsed || !parsed.issueKey) throw new Error('bad-url');
  const creds = await credentialsFor(parsed.site);
  if (!creds) return;

  const { ctx, current } = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Checking ' + parsed.issueKey + ' in Jira…' },
    async () => {
      const c = await jiraContext(creds, parsed.site);
      return { ctx: c, current: await loadIssue(c, parsed.issueKey) };
    });
  if (meta.updated && current.updated !== meta.updated) {
    const overwrite = 'Overwrite';
    const picked = await vscode.window.showWarningMessage(
      current.key + ' has changed in Jira (' + current.updated + ', your local copy is from ' + meta.updated + '). Overwrite?',
      { modal: true }, overwrite);
    if (picked !== overwrite) return;
  }

  const setChange = changeUpdate(ctx.change, current.fields, change);
  const body = {
    fields: Object.assign({ summary: title, description }, setChange && setChange.fields),
    update: setChange && setChange.update
  };
  if (!body.update) delete body.update;
  const updated = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Pushing ' + current.key + ' to Jira…' },
    async () => {
      await updateIssue(creds, parsed.site, current.key, body);
      return fetchIssue(creds, parsed.site, current.key, ['updated']);
    });

  await writeBinding(source, { url: meta.url, updated: updated.fields.updated }, change);
  vscode.window.showInformationMessage('Pushed ' + current.key + ' "' + title + '".' +
    (setChange ? ' Change name set in Jira: ' + change + '.' : ''));
  return { url: meta.url, key: current.key, action: 'updated' };
}

async function askForParent() {
  const parentUrl = await vscode.window.showInputBox({
    prompt: 'New issue — paste a link to the epic it belongs to, or to the project',
    placeHolder: 'https://…/browse/PROJ-1',
    ignoreFocusOut: true
  });
  if (!parentUrl) return null;
  const parsed = parseJiraUrl(parentUrl);
  if (!parsed) throw new Error('bad-parent');
  return parsed;
}

async function publishNew(source, title, description, change) {
  const parsed = await askForParent();
  if (!parsed) return;
  const creds = await credentialsFor(parsed.site);
  if (!creds) return;

  const { ctx, epic } = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Checking the parent in Jira…' },
    async () => {
      const c = await jiraContext(creds, parsed.site);
      return { ctx: c, epic: parsed.issueKey ? await loadIssue(c, parsed.issueKey) : null };
    });
  if (epic && !epic.isEpic) throw new Error('bad-parent');

  const type = await vscode.window.showQuickPick(ISSUE_TYPES,
    { placeHolder: 'Issue type for "' + title + '"', ignoreFocusOut: true });
  if (!type) return;

  const fields = Object.assign({
    project: { key: epic ? epic.project : parsed.projectKey },
    issuetype: { name: type },
    summary: title,
    description
  }, changeCreateFields(ctx.change, change));
  if (epic && ctx.epicLinkId) fields[ctx.epicLinkId] = epic.key;
  else if (epic && isCloud(parsed.site)) fields.parent = { key: epic.key };

  const created = await vscode.window.withProgress(
    { location: vscode.ProgressLocation.Notification, title: 'Creating the issue in Jira…' },
    async () => {
      const made = await createIssue(creds, parsed.site, fields);
      return fetchIssue(creds, parsed.site, made.key, ['updated']).then((j) => ({ key: made.key, updated: j.fields.updated }));
    });

  const url = issueWebUrl(parsed.site, created.key);
  await writeBinding(source, { url, updated: created.updated }, change);
  vscode.window.showInformationMessage('Created ' + created.key + ' "' + title + '"' +
    (epic ? ' in epic ' + epic.key : '') + (change ? ' for change ' + change : '') + '.');
  return { url, key: created.key, action: 'created' };
}

async function publishIssueCommand(fileUri) {
  const editor = fileUri ? null : vscode.window.activeTextEditor;
  if (!fileUri && !editor) {
    vscode.window.showErrorMessage('Open the Markdown file you want to push to Jira.');
    return;
  }

  try {
    const source = fileUri ? await uriSource(fileUri) : editorSource(editor);
    const { meta, body, extraLines } = parseFrontMatter(source.text);
    const change = changeOfSource(source, extraLines);
    const { title, content } = splitTitleAndBody(body,
      change || source.fileName.replace(/\.md$/i, '') || 'Untitled');
    const description = mdToWiki(content);

    return meta
      ? await publishUpdate(source, meta, title, description, change)
      : await publishNew(source, title, description, change);
  } catch (e) {
    if (fileUri) throw new Error(errorMessage(e));
    vscode.window.showErrorMessage(errorMessage(e));
  }
}

module.exports = { publishIssueCommand };
