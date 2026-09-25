const vscode = require('vscode');
const { pullIssueCommand } = require('./pullCommand');
const { publishIssueCommand } = require('./publishCommand');
const { fileUriCandidates } = require('./previewButton');

async function pushFromPreview(document) {
  const push = 'Push';
  const picked = await vscode.window.showWarningMessage(
    'Push "' + vscode.workspace.asRelativePath(document.uri, false) + '" to Jira?' +
    (document.isDirty ? ' Your unsaved changes are saved first.' : ''),
    { modal: true }, push);
  if (picked !== push) return;
  try {
    if (document.isDirty && !await document.save()) return;
    await publishIssueCommand(document.uri);
  } catch (e) {
    vscode.window.showErrorMessage(e.message);
  }
}

const ACTIONS = {
  '/pull': (document) => pullIssueCommand(document.uri),
  '/push': pushFromPreview
};

// The preview's buttons open vscode://<extension>/<action>?file=<uri>. Only a
// file that is already open is acted on, so a link from elsewhere cannot reach
// files the user is not looking at.
async function handlePreviewUri(uri) {
  const action = ACTIONS[uri.path];
  if (!action) return;
  const targets = new Set();
  for (const candidate of fileUriCandidates(uri.query)) {
    try {
      targets.add(vscode.Uri.parse(candidate).toString());
    } catch (e) { }
  }
  const document = vscode.workspace.textDocuments.find(
    (doc) => targets.has(doc.uri.toString()));
  if (!document) {
    vscode.window.showErrorMessage('Open the Markdown file in VS Code, then use the button in its preview again.');
    return;
  }
  await action(document);
}

module.exports = { handlePreviewUri };
