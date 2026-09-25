const path = require('path');

function slugify(text) {
  return String(text)
    .replace(/ł/g, 'l').replace(/Ł/g, 'L')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
}

// OpenSpec change ids are kebab-case; a name typed in Jira is made one.
function changeName(text) {
  return slugify(text);
}

// For an issue that names no change: its key and the start of its summary,
// e.g. "proj-12-add-two-factor-login".
function derivedChangeName(key, summary) {
  const words = slugify(summary).split('-').filter(Boolean);
  let name = slugify(key);
  for (const word of words) {
    if ((name + '-' + word).length > 48) break;
    name += '-' + word;
  }
  return name;
}

// The change a file belongs to by its place: <openspec>/changes/<change>/proposal.md.
function changeOfPath(filePath) {
  const parts = String(filePath || '').split(/[\\/]+/);
  const n = parts.length;
  if (n < 3 || parts[n - 1].toLowerCase() !== 'proposal.md' || parts[n - 3] !== 'changes') return '';
  return parts[n - 2];
}

function parseOpenspecFolder(configured, homeDir) {
  const value = String(configured == null ? '' : configured).trim() || 'openspec';
  const expanded = expandHome(value, homeDir);
  if (path.isAbsolute(expanded) || /^[a-zA-Z]:[\\/]/.test(expanded) || expanded.startsWith('/')) {
    return { kind: 'absolute', path: expanded };
  }
  const segments = expanded.split(/[\\/]+/).filter((s) => s && s !== '.');
  return segments.length ? { kind: 'relative', segments } : { kind: 'relative', segments: ['openspec'] };
}

function expandHome(value, homeDir) {
  if (!homeDir) return value;
  if (value === '~') return homeDir;
  if (value.startsWith('~/') || value.startsWith('~\\')) return path.join(homeDir, value.slice(2));
  return value;
}

// Where each issue goes: the proposal of its change, unless that proposal
// already belongs to another issue — then next to it, named by the key.
// `known` maps keys to paths (relative to the changes folder) saved before;
// `owners` maps those paths back to keys.
function placeIssues(entries, known, owners) {
  const taken = new Map(owners);
  const out = new Map();
  for (const entry of entries) {
    if (known.has(entry.key)) {
      out.set(entry.key, known.get(entry.key));
      continue;
    }
    const proposal = entry.change + '/proposal.md';
    const owner = taken.get(proposal);
    const target = owner && owner !== entry.key ? entry.change + '/' + entry.key + '.md' : proposal;
    taken.set(target, entry.key);
    out.set(entry.key, target);
  }
  return out;
}

module.exports = { slugify, changeName, derivedChangeName, changeOfPath, parseOpenspecFolder, placeIssues };
