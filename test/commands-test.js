const assert = (ok, name) => { if (!ok) { console.error('FAIL: ' + name); process.exit(1); } };

// A VS Code stub, just enough to drive the commands end to end: an in-memory
// disk, open documents, recorded popups, and the answers prompts hand back.
const disk = new Map();
const info = [];
const errors = [];
const warnings = [];
const answers = {};
let settings = {};
let routes = [];
let docs = [];

function uri(path) {
  return {
    scheme: 'file', authority: '', path, fsPath: path,
    toString: () => 'file://' + path.split('/').map(encodeURIComponent).join('/')
  };
}

function joinPath(base, ...parts) {
  const out = [];
  for (const segment of (base.path + '/' + parts.join('/')).split('/')) {
    if (segment === '' || segment === '.') continue;
    if (segment === '..') out.pop();
    else out.push(segment);
  }
  return uri('/' + out.join('/'));
}

function openDoc(path, dirty) {
  const doc = {
    uri: uri(path),
    fileName: path,
    isDirty: !!dirty,
    saved: 0,
    getText: () => disk.get(path),
    positionAt: (offset) => offset,
    save: async () => { doc.saved++; doc.isDirty = false; return true; }
  };
  docs.push(doc);
  return doc;
}

function WorkspaceEdit() { this.edits = []; }
WorkspaceEdit.prototype.replace = function (target, range, text) { this.edits.push({ target, range, text }); };

const vscodeStub = {
  Uri: { file: uri, joinPath, parse: (t) => uri(t.slice('file://'.length).split('/').map(decodeURIComponent).join('/')) },
  Range: function Range(start, end) { this.start = start; this.end = end; },
  WorkspaceEdit,
  ProgressLocation: { Notification: 15 },
  FileType: { File: 1, Directory: 2 },
  window: {
    activeTextEditor: null,
    showInformationMessage: (message) => { info.push(message); },
    showErrorMessage: (message) => { errors.push(message); },
    showWarningMessage: async (message) => { warnings.push(message); return answers.warning; },
    showInputBox: async () => answers.input,
    showQuickPick: async (items) => answers.pick(items),
    showTextDocument: async () => {},
    withProgress: (options, task) => task()
  },
  workspace: {
    get textDocuments() { return docs; },
    openTextDocument: async (target) => docs.find((d) => d.uri.path === target.path) || openDoc(target.path),
    applyEdit: async (edit) => {
      for (const e of edit.edits) {
        const text = disk.get(e.target.path);
        disk.set(e.target.path, text.slice(0, e.range.start) + e.text + text.slice(e.range.end));
      }
      return true;
    },
    asRelativePath: (target) => target.path.replace(/^\/w\//, ''),
    getConfiguration: () => ({ get: (key) => Object.assign({ token: 'T', email: 'a@b.com' }, settings)[key] }),
    fs: {
      stat: async (target) => {
        if (!disk.has(target.path)) throw new Error('EntryNotFound');
        return {};
      },
      readFile: async (target) => {
        if (!disk.has(target.path)) throw new Error('EntryNotFound: ' + target.path);
        return Buffer.from(disk.get(target.path), 'utf8');
      },
      writeFile: async (target, bytes) => { disk.set(target.path, Buffer.from(bytes).toString('utf8')); },
      createDirectory: async () => {},
      readDirectory: async (folder) => {
        const prefix = folder.path.replace(/\/+$/, '') + '/';
        const entries = new Map();
        for (const path of disk.keys()) {
          if (!path.startsWith(prefix)) continue;
          const rest = path.slice(prefix.length).split('/');
          entries.set(rest[0], rest.length > 1 ? 2 : 1);
        }
        if (!entries.size) throw new Error('EntryNotFound');
        return Array.from(entries);
      }
    },
    getWorkspaceFolder: () => null,
    workspaceFolders: [{ uri: uri('/w') }]
  },
  commands: { executeCommand: async () => {} }
};

const Module = require('module');
const resolve = Module._resolveFilename;
Module._resolveFilename = function (request, ...rest) {
  return request === 'vscode' ? 'vscode' : resolve.call(this, request, ...rest);
};
require.cache.vscode = { id: 'vscode', filename: 'vscode', loaded: true, exports: vscodeStub, children: [], paths: [] };

const sent = [];
global.fetch = async (url, options) => {
  const method = (options && options.method) || 'GET';
  const body = options && options.body ? JSON.parse(options.body) : null;
  sent.push({ method, url: decodeURIComponent(url), body });
  const route = routes.find((r) => (r.method || 'GET') === method && decodeURIComponent(url).indexOf(r.match) >= 0);
  const status = route ? (route.status || 200) : 404;
  const reply = route && (typeof route.body === 'function' ? route.body(body) : route.body);
  return { ok: status < 300, status, url, json: async () => reply || {} };
};

const { fetchIssueCommand } = require('../src/fetchCommand');
const { pullIssueCommand } = require('../src/pullCommand');
const { publishIssueCommand } = require('../src/publishCommand');
const { handlePreviewUri } = require('../src/previewActions');

function reset() {
  disk.clear();
  info.length = 0;
  errors.length = 0;
  warnings.length = 0;
  sent.length = 0;
  routes = [];
  docs = [];
  settings = {};
  answers.input = undefined;
  answers.warning = undefined;
  answers.pick = (items) => items.filter((i) => i.picked);
}

const SITE = 'https://acme.atlassian.net';
const EPIC_TYPE = { name: 'Epic', hierarchyLevel: 1 };

function issue(key, fields) {
  return {
    key,
    fields: Object.assign({
      summary: 'Summary of ' + key, description: '', labels: [], updated: '2026-09-01T10:00:00.000+0000',
      issuetype: { name: 'Story' }, status: { name: 'To Do' }, project: { key: 'PROJ' }
    }, fields)
  };
}

const EPIC = issue('PROJ-1', { summary: 'Login rework', issuetype: EPIC_TYPE });
const STORY = issue('PROJ-2', {
  summary: 'Add two-factor login', labels: ['backend', 'openspec:add-2fa'],
  description: 'h2. Why\nUsers need *stronger* logins.\n\nh2. What Changes\n* Add a TOTP step',
  parent: { key: 'PROJ-1', fields: { issuetype: EPIC_TYPE } }
});
const TASK = issue('PROJ-3', { summary: 'Store TOTP secrets', labels: ['openspec:add-2fa'], issuetype: { name: 'Task' } });
const LOOSE = issue('PROJ-4', { summary: 'Remember this device', issuetype: { name: 'Task' } });

function epicRoutes() {
  return [
    { match: '/rest/api/2/issue/PROJ-1?', body: EPIC },
    { match: '/rest/api/2/search/jql?jql=parent = PROJ-1', body: { issues: [STORY, TASK, LOOSE], isLast: true } }
  ];
}

async function main() {
  // An epic: every story and task in it is saved as an OpenSpec change.
  reset();
  routes = epicRoutes();
  answers.input = SITE + '/browse/PROJ-1';
  let offered = [];
  answers.pick = (items) => { offered = items; return items.filter((i) => i.picked); };
  await fetchIssueCommand();
  assert(!errors.length, 'no errors, got: ' + errors.join(' | '));
  assert(offered.length === 4 && !offered[0].picked && offered.slice(1).every((i) => i.picked),
    'the epic and its issues are offered; the epic without a change name is not preselected');
  const proposal = disk.get('/w/openspec/changes/add-2fa/proposal.md');
  assert(proposal, 'the story became the proposal of its change');
  assert(proposal.startsWith('---\njira:\n  url: ' + SITE + '/browse/PROJ-2\n  updated: 2026-09-01T10:00:00.000+0000\nchange: add-2fa\nkey: PROJ-2\n'),
    'the proposal is bound to the issue, got:\n' + proposal);
  assert(proposal.includes('epic: PROJ-1'), 'the epic is recorded');
  assert(proposal.includes('# Add two-factor login\n\n## Why\n\nUsers need **stronger** logins.\n\n## What Changes\n\n- Add a TOTP step\n'),
    'the description is converted to Markdown, got:\n' + proposal);
  assert(disk.get('/w/openspec/changes/add-2fa/PROJ-3.md').includes('# Store TOTP secrets'), 'a second issue of the same change goes next to the proposal');
  assert(disk.get('/w/openspec/changes/proj-4-remember-this-device/proposal.md').includes('change: proj-4-remember-this-device'),
    'an issue without a change name gets one from its key and summary');
  assert(!Array.from(disk.keys()).some((p) => p.includes('login-rework')), 'the unpicked epic is not saved');
  assert(info.some((m) => m.includes('Saved 3 issues') && m.includes('Push saves it in Jira')), 'a summary, got: ' + info.join(' | '));

  // Downloading again refreshes the same files without asking.
  warnings.length = 0;
  await fetchIssueCommand();
  assert(!warnings.length, 'files bound to the same issues are refreshed without a prompt');
  assert(!disk.has('/w/openspec/changes/add-2fa/PROJ-2.md'), 'the proposal is not duplicated');

  // A single issue: no picker, just the issue.
  reset();
  routes = [{ match: '/rest/api/2/issue/PROJ-2?', body: STORY }];
  answers.input = SITE + '/browse/PROJ-2';
  answers.pick = () => { throw new Error('no picker for a single issue'); };
  await fetchIssueCommand();
  assert(!errors.length && disk.has('/w/openspec/changes/add-2fa/proposal.md'), 'a single issue is saved, got: ' + errors.join(' | '));

  // A local proposal that is not bound is overwritten only when the user agrees.
  reset();
  disk.set('/w/openspec/changes/add-2fa/proposal.md', '## Why\nLocal draft.\n');
  routes = [{ match: '/rest/api/2/issue/PROJ-2?', body: STORY }];
  answers.input = SITE + '/browse/PROJ-2';
  await fetchIssueCommand();
  assert(warnings.length === 1 && disk.get('/w/openspec/changes/add-2fa/proposal.md').includes('Local draft'),
    'declining keeps the local proposal');

  // Pull: a newer issue in Jira replaces the file once the user agrees.
  reset();
  const LOCAL = '---\njira:\n  url: ' + SITE + '/browse/PROJ-2\n  updated: 2026-09-01T10:00:00.000+0000\nchange: add-2fa\nkey: PROJ-2\n' +
    'owner: team-auth\ngenerated: 2026-01-01\n---\n\n# Add two-factor login\n\nOld body.\n';
  const FILE = '/w/openspec/changes/add-2fa/proposal.md';
  disk.set(FILE, LOCAL);
  routes = [{ match: '/rest/api/2/issue/PROJ-2?', body: issue('PROJ-2', Object.assign({}, STORY.fields, {
    updated: '2026-09-20T08:00:00.000+0000', description: 'New *body*.'
  })) }];
  answers.warning = 'Pull';
  await pullIssueCommand(uri(FILE));
  let text = disk.get(FILE);
  assert(!errors.length, 'no pull errors, got: ' + errors.join(' | '));
  assert(warnings.length === 1 && warnings[0].includes('2026-09-20'), 'the user is asked first');
  assert(text.includes('  updated: 2026-09-20T08:00:00.000+0000\n'), 'the binding moves to the pulled timestamp');
  assert(text.includes('New **body**.') && !text.includes('Old body'), 'content is replaced');
  assert(text.includes('owner: team-auth') && !text.includes('generated: 2026-01-01'), 'custom keys survive, generated ones refresh');
  assert(docs[0].saved === 1, 'the document is saved');

  // Pull when nothing changed.
  reset();
  disk.set(FILE, LOCAL);
  routes = [{ match: '/rest/api/2/issue/PROJ-2?', body: STORY }];
  await pullIssueCommand(uri(FILE));
  assert(!warnings.length && info.some((m) => m.includes('Already up to date')), 'up to date, no prompt');

  // Push an update: summary and description go to Jira; the change name follows the folder.
  reset();
  const MOVED = '/w/openspec/changes/add-mfa/proposal.md';
  disk.set(MOVED, LOCAL.replace('Old body.', 'Users need **MFA**.\n\n- [ ] 1.1 Add TOTP'));
  let current = STORY;
  routes = [
    { match: '/rest/api/2/issue/PROJ-2?fields=updated', body: () => ({ fields: { updated: '2026-09-25T12:00:00.000+0000' } }) },
    { match: '/rest/api/2/issue/PROJ-2?', body: () => current },
    { method: 'PUT', match: '/rest/api/2/issue/PROJ-2', status: 204 }
  ];
  await publishIssueCommand(uri(MOVED));
  const put = sent.find((r) => r.method === 'PUT');
  assert(!errors.length && put, 'the issue is updated, got: ' + errors.join(' | '));
  assert(put.body.fields.summary === 'Add two-factor login', 'the H1 is the summary');
  assert(put.body.fields.description === 'Users need *MFA*.\n\n* [ ] 1.1 Add TOTP', 'the body is sent as wiki markup, got: ' + put.body.fields.description);
  assert(JSON.stringify(put.body.update) === JSON.stringify({ labels: [{ remove: 'openspec:add-2fa' }, { add: 'openspec:add-mfa' }] }),
    'the change label follows the folder the proposal lives in');
  text = disk.get(MOVED);
  assert(text.includes('  updated: 2026-09-25T12:00:00.000+0000\n') && text.includes('change: add-mfa'), 'binding and change name are recorded');

  // Push over a newer issue asks first.
  reset();
  disk.set(FILE, LOCAL);
  current = issue('PROJ-2', Object.assign({}, STORY.fields, { updated: '2026-09-24T00:00:00.000+0000' }));
  routes = [
    { match: '/rest/api/2/issue/PROJ-2?', body: () => current },
    { method: 'PUT', match: '/rest/api/2/issue/PROJ-2', status: 204 }
  ];
  await publishIssueCommand(uri(FILE));
  assert(warnings.length === 1 && warnings[0].includes('changed in Jira'), 'a newer issue is called out');
  assert(!sent.some((r) => r.method === 'PUT'), 'declining leaves Jira alone');

  // A new proposal made with OpenSpec becomes a story in an epic.
  reset();
  const NEW = '/w/openspec/changes/add-audit-log/proposal.md';
  disk.set(NEW, '# Add an audit log\n\n## Why\n\nCompliance.\n');
  routes = [
    { match: '/rest/api/2/issue/PROJ-1?', body: EPIC },
    { method: 'POST', match: '/rest/api/2/issue', body: { id: '100', key: 'PROJ-50' } },
    { match: '/rest/api/2/issue/PROJ-50?fields=updated', body: { fields: { updated: '2026-09-25T13:00:00.000+0000' } } }
  ];
  answers.input = SITE + '/browse/PROJ-1';
  answers.pick = (items) => items[0];
  const result = await publishIssueCommand(uri(NEW));
  const post = sent.find((r) => r.method === 'POST');
  assert(!errors.length && post, 'the issue is created, got: ' + errors.join(' | '));
  assert(post.body.fields.project.key === 'PROJ' && post.body.fields.issuetype.name === 'Story' &&
    post.body.fields.parent.key === 'PROJ-1', 'in the epic\'s project, under the epic');
  assert(JSON.stringify(post.body.fields.labels) === JSON.stringify(['openspec:add-audit-log']), 'with the change label');
  assert(post.body.fields.description === 'h2. Why\n\nCompliance.', 'with the proposal as description');
  assert(result && result.key === 'PROJ-50' && result.action === 'created', 'the result names the new issue');
  assert(disk.get(NEW).startsWith('---\njira:\n  url: ' + SITE + '/browse/PROJ-50\n  updated: 2026-09-25T13:00:00.000+0000\nchange: add-audit-log\n---\n\n# Add an audit log'),
    'the file is bound to the new issue, got:\n' + disk.get(NEW));

  // Server/Data Center: epics are linked through the Epic Link field and the
  // change name can live in a custom field.
  reset();
  settings = { changeField: 'OpenSpec Change' };
  const SERVER = 'https://jira.acme.com/jira';
  const FIELDS = [
    { id: 'customfield_10100', name: 'Epic Link', schema: { custom: 'com.pyxis.greenhopper.jira:gh-epic-link' } },
    { id: 'customfield_10200', name: 'OpenSpec Change' }
  ];
  routes = [
    { match: SERVER + '/rest/api/2/field', body: FIELDS },
    { match: '/rest/api/2/issue/ABC-1?', body: issue('ABC-1', { issuetype: { name: 'Epic' } }) },
    { match: '/rest/api/2/search?jql="Epic Link" = ABC-1', body: {
      total: 1, issues: [issue('ABC-2', { customfield_10200: 'Add Export', customfield_10100: 'ABC-1' })]
    } }
  ];
  answers.input = SERVER + '/browse/ABC-1';
  await fetchIssueCommand();
  assert(!errors.length, 'server epic downloads, got: ' + errors.join(' | '));
  const serverFile = disk.get('/w/openspec/changes/add-export/proposal.md');
  assert(serverFile && serverFile.includes('url: ' + SERVER + '/browse/ABC-2') && serverFile.includes('epic: ABC-1'),
    'the custom field names the change, got: ' + Array.from(disk.keys()).join(', '));
  assert(sent.every((r) => r.url.indexOf('/search/jql') < 0), 'server uses the classic search');

  // Push from the preview asks first and saves unsaved edits.
  reset();
  disk.set(FILE, LOCAL);
  const doc = openDoc(FILE, true);
  current = STORY;
  routes = [
    { match: '/rest/api/2/issue/PROJ-2?fields=updated', body: { fields: { updated: '2026-09-25T12:00:00.000+0000' } } },
    { match: '/rest/api/2/issue/PROJ-2?', body: () => current },
    { method: 'PUT', match: '/rest/api/2/issue/PROJ-2', status: 204 }
  ];
  const push = { path: '/push', query: 'file=' + encodeURIComponent(uri(FILE).toString()) };
  await handlePreviewUri(push);
  assert(!sent.some((r) => r.method === 'PUT') && doc.saved === 0, 'declined push neither saves nor pushes');
  answers.warning = 'Push';
  await handlePreviewUri(push);
  assert(doc.saved === 1 && sent.some((r) => r.method === 'PUT'), 'confirmed push saves and pushes');
  assert(!errors.length, 'no errors on push, got: ' + errors.join(' | '));

  // Jira's explanation of a rejected request reaches the user.
  reset();
  disk.set(FILE, LOCAL);
  routes = [
    { match: '/rest/api/2/issue/PROJ-2?', body: STORY },
    { method: 'PUT', match: '/rest/api/2/issue/PROJ-2', status: 400, body: { errorMessages: [], errors: { labels: 'Labels cannot contain spaces.' } } }
  ];
  await publishIssueCommand(uri(FILE)).catch((e) => errors.push(e.message));
  assert(errors.length === 1 && errors[0] === 'Jira: labels: Labels cannot contain spaces.', 'Jira errors are shown as sent, got: ' + errors.join(' | '));

  console.log('PASS: download, pull and push commands ok');
}

main().catch((e) => { console.error(e); process.exit(1); });
