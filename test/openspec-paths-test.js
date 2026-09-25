const { changeName, derivedChangeName, changeOfPath, parseOpenspecFolder, placeIssues } = require('../src/openspecPaths');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

assert(changeName('Add 2FA Login') === 'add-2fa-login', 'names become kebab-case');
assert(changeName('Zażółć gęślą') === 'zazolc-gesla', 'Polish letters are transliterated');
assert(derivedChangeName('PROJ-12', 'Add two-factor login for admins') === 'proj-12-add-two-factor-login-for-admins', 'derived from key and summary');
assert(derivedChangeName('PROJ-12', 'a'.repeat(80)) === 'proj-12', 'long words are dropped rather than cut');
assert(derivedChangeName('PROJ-12', 'Word '.repeat(30)).length <= 48, 'derived names stay short');

assert(changeOfPath('/w/openspec/changes/add-2fa/proposal.md') === 'add-2fa', 'change of a proposal');
assert(changeOfPath('C:\\w\\openspec\\changes\\add-2fa\\proposal.md') === 'add-2fa', 'Windows paths');
assert(changeOfPath('/w/openspec/changes/add-2fa/PROJ-2.md') === '', 'only proposals name their change by place');
assert(changeOfPath('/w/docs/proposal.md') === '', 'a proposal outside changes/');

assert(JSON.stringify(parseOpenspecFolder('', '/home/a')) === JSON.stringify({ kind: 'relative', segments: ['openspec'] }), 'default folder');
assert(parseOpenspecFolder('specs/openspec', '/home/a').segments.join('/') === 'specs/openspec', 'relative folder');
assert(parseOpenspecFolder('~/work/openspec', '/home/a').path === '/home/a/work/openspec', 'home folder');

const places = placeIssues([
  { key: 'P-1', change: 'add-2fa' },
  { key: 'P-2', change: 'add-2fa' },
  { key: 'P-3', change: 'local-only' },
  { key: 'P-4', change: 'renamed' },
  { key: 'P-5', change: 'taken' }
], new Map([['P-4', 'old-name/proposal.md']]), new Map([
  ['local-only/proposal.md', ''],
  ['old-name/proposal.md', 'P-4'],
  ['taken/proposal.md', 'P-9']
]));
assert(places.get('P-1') === 'add-2fa/proposal.md', 'the first issue of a change is its proposal');
assert(places.get('P-2') === 'add-2fa/P-2.md', 'the next one goes next to it');
assert(places.get('P-3') === 'local-only/proposal.md', 'an unbound local proposal is a target (the user is asked before overwriting)');
assert(places.get('P-4') === 'old-name/proposal.md', 'an issue saved before stays where it is');
assert(places.get('P-5') === 'taken/P-5.md', 'a proposal bound to another issue is not taken over');

console.log('PASS: openspec paths ok');
