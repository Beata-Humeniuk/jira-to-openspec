const vscode = require('vscode');
const { fetchIssueCommand } = require('./fetchCommand');
const { publishIssueCommand } = require('./publishCommand');
const { pullIssueCommand } = require('./pullCommand');
const { handlePreviewUri, pushFromPreview } = require('./previewActions');
const { previewButtons } = require('./previewButton');
const { parseFrontMatter } = require('./frontMatter');

const BOUND_CONTEXT = 'jiraToOpenspec.boundFile';

function updateBoundContext() {
  const editor = vscode.window.activeTextEditor;
  const bound = !!editor && editor.document.languageId === 'markdown' &&
    !!parseFrontMatter(editor.document.getText()).meta;
  vscode.commands.executeCommand('setContext', BOUND_CONTEXT, bound);
}

function editorDocument(uri) {
  const editor = vscode.window.activeTextEditor;
  if (!uri) return editor && editor.document;
  return vscode.workspace.textDocuments.find((doc) => doc.uri.toString() === uri.toString());
}

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraToOpenspec.fetchIssue', fetchIssueCommand),
    vscode.commands.registerCommand('jiraToOpenspec.publishIssue', publishIssueCommand),
    vscode.commands.registerCommand('jiraToOpenspec.pullIssue', pullIssueCommand),
    vscode.commands.registerCommand('jiraToOpenspec.pushFromEditor', (uri) => {
      const document = editorDocument(uri);
      return document && pushFromPreview(document);
    }),
    vscode.commands.registerCommand('jiraToOpenspec.pullFromEditor', (uri) => {
      const document = editorDocument(uri);
      return pullIssueCommand(document ? document.uri : uri);
    }),
    vscode.window.registerUriHandler({ handleUri: handlePreviewUri }),
    vscode.window.onDidChangeActiveTextEditor(updateBoundContext),
    vscode.workspace.onDidChangeTextDocument((e) => {
      const editor = vscode.window.activeTextEditor;
      if (editor && e.document === editor.document) updateBoundContext();
    })
  );
  updateBoundContext();
  return {
    extendMarkdownIt: (md) => previewButtons(md,
      { uriScheme: vscode.env.uriScheme, extensionId: context.extension.id })
  };
}

function deactivate() {}

module.exports = { activate, deactivate };
