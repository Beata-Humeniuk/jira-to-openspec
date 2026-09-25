const os = require('os');
const vscode = require('vscode');
const { parseOpenspecFolder } = require('./openspecPaths');
const { changeFieldSetting } = require('./changeField');

function settings() {
  return vscode.workspace.getConfiguration('jiraToOpenspec');
}

function workspaceFolderUri() {
  const editor = vscode.window.activeTextEditor;
  const own = editor && editor.document && vscode.workspace.getWorkspaceFolder(editor.document.uri);
  const folder = own || (vscode.workspace.workspaceFolders || [])[0];
  return folder ? folder.uri : null;
}

// <openspec>/changes, or null when a relative folder has no workspace to live in.
function changesFolderUri() {
  const target = parseOpenspecFolder(settings().get('openspecFolder'), os.homedir());
  if (target.kind === 'absolute') return vscode.Uri.joinPath(vscode.Uri.file(target.path), 'changes');
  const base = workspaceFolderUri();
  return base ? vscode.Uri.joinPath(base, ...target.segments, 'changes') : null;
}

function configuredToken() {
  const token = String(settings().get('token') || '').trim();
  return token || null;
}

function configuredEmail() {
  return settings().get('email') || '';
}

function changeField() {
  return changeFieldSetting(settings().get('changeField'), settings().get('changeLabelPrefix'));
}

module.exports = { changesFolderUri, configuredToken, configuredEmail, changeField };
