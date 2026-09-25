const { changeFieldSetting, resolveChangeField, changeOfIssue, changeUpdate, changeCreateFields } = require('../src/changeField');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

// Default: a label with a prefix.
const labels = resolveChangeField(changeFieldSetting('', undefined), []);
assert(labels.kind === 'label' && labels.id === 'labels' && labels.prefix === 'openspec:', 'labels by default');
assert(resolveChangeField(changeFieldSetting('Labels', 'os-'), []).prefix === 'os-', 'the prefix is configurable');

const fields = { labels: ['backend', 'openspec:add-2fa'] };
assert(changeOfIssue(labels, fields) === 'add-2fa', 'change read from the prefixed label');
assert(changeOfIssue(labels, { labels: ['backend', 'openspec:'] }) === '', 'an empty prefixed label names no change');
assert(changeUpdate(labels, fields, 'add-2fa') === null, 'nothing to write when Jira already has the name');
const relabel = changeUpdate(labels, fields, 'add-mfa');
assert(JSON.stringify(relabel) === JSON.stringify({ update: { labels: [{ remove: 'openspec:add-2fa' }, { add: 'openspec:add-mfa' }] } }),
  'a new name replaces the old label and keeps the others');
assert(JSON.stringify(changeCreateFields(labels, 'x')) === JSON.stringify({ labels: ['openspec:x'] }), 'a new issue gets the label');
assert(changeUpdate(labels, fields, '') === null, 'no name, no change');

// A custom field, by id or by name.
const byId = resolveChangeField(changeFieldSetting('customfield_10050'), null);
assert(byId.kind === 'field' && byId.id === 'customfield_10050', 'a field id is used as given');
const byName = resolveChangeField(changeFieldSetting('OpenSpec change'),
  [{ id: 'summary', name: 'Summary' }, { id: 'customfield_777', name: 'OpenSpec Change' }]);
assert(byName.id === 'customfield_777', 'a field name is looked up, ignoring case');
let threw = '';
try { resolveChangeField(changeFieldSetting('Nope'), []); } catch (e) { threw = e.message; }
assert(threw === 'change-field', 'an unknown field name is reported');

assert(changeOfIssue(byName, { customfield_777: 'add-2fa ' }) === 'add-2fa', 'text field value');
assert(changeOfIssue(byName, { customfield_777: { value: 'add-2fa' } }) === 'add-2fa', 'select field value');
assert(changeOfIssue(byName, { customfield_777: null }) === '', 'empty field');
assert(JSON.stringify(changeUpdate(byName, { customfield_777: 'old' }, 'new')) === JSON.stringify({ fields: { customfield_777: 'new' } }),
  'field update');
assert(JSON.stringify(changeCreateFields(byName, 'x')) === JSON.stringify({ customfield_777: 'x' }), 'field on create');

console.log('PASS: change field ok');
