const vscode = require('vscode');
const { fetchIssueCommand } = require('./fetchCommand');
const { publishIssueCommand } = require('./publishCommand');
const { pullIssueCommand } = require('./pullCommand');
const { handlePreviewUri } = require('./previewActions');
const { previewButtons } = require('./previewButton');

function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('jiraToOpenspec.fetchIssue', fetchIssueCommand),
    vscode.commands.registerCommand('jiraToOpenspec.publishIssue', publishIssueCommand),
    vscode.commands.registerCommand('jiraToOpenspec.pullIssue', pullIssueCommand),
    vscode.window.registerUriHandler({ handleUri: handlePreviewUri })
  );
  return {
    extendMarkdownIt: (md) => previewButtons(md,
      { uriScheme: vscode.env.uriScheme, extensionId: context.extension.id })
  };
}

function deactivate() {}

module.exports = { activate, deactivate };
