const { changeFieldSetting, resolveChangeField, changeOfIssue, changeUpdate, changeCreateFields, descriptionWithoutChange } = require('../src/changeField');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

const labels = resolveChangeField(changeFieldSetting('labels', undefined), []);
assert(labels.kind === 'label' && labels.id === 'labels' && labels.prefix === 'openspec:', 'labels on request');
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

const desc = resolveChangeField(changeFieldSetting('', undefined), null);
assert(desc.kind === 'description' && desc.id === 'description', 'the description by default');
assert(resolveChangeField(changeFieldSetting('Description'), null).kind === 'description', 'by name too');
const WIKI = 'h2. Why\n\nBecause.\n\nOpenSpec change: add-2fa';
assert(changeOfIssue(desc, { description: WIKI }) === 'add-2fa', 'change read from its line');
assert(changeOfIssue(desc, { description: '*OpenSpec change:* {{add-2fa}}\nh2. Why' }) === 'add-2fa', 'formatting around the line is ignored');
assert(changeOfIssue(desc, { description: 'openspec change:add-2fa' }) === 'add-2fa', 'case and spacing do not matter');
assert(changeOfIssue(desc, { description: 'No line here.' }) === '' && changeOfIssue(desc, { description: null }) === '', 'no line, no change');
assert(descriptionWithoutChange(desc, WIKI) === 'h2. Why\n\nBecause.', 'the file does not show the line');
assert(descriptionWithoutChange(desc, 'OpenSpec change: x\n\nBody.') === 'Body.', 'a line at the top goes too');
assert(descriptionWithoutChange(labels, WIKI) === WIKI, 'other modes leave the description alone');
assert(JSON.stringify(changeUpdate(desc, { description: WIKI }, 'add-mfa', 'New.')) === JSON.stringify({ fields: { description: 'New.\n\nOpenSpec change: add-mfa' } }),
  'the pushed description carries the line');
assert(changeUpdate(desc, { description: WIKI }, '', 'New.').fields.description === 'New.\n\nOpenSpec change: add-2fa',
  'without a local name the line from Jira is kept');
assert(changeUpdate(desc, { description: 'x' }, '', 'New.') === null, 'nothing to keep, nothing added');
assert(changeCreateFields(desc, 'x', '').description === 'OpenSpec change: x', 'a new issue gets the line');

console.log('PASS: change field ok');
