const { serializeFrontMatter, parseFrontMatter } = require('./frontMatter');
const { issueWebUrl } = require('./jiraClient');
const { wikiToMd } = require('./wikiToMd');

const EXTENSION_VERSION = require('../package.json').version;

function isoToday() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
}

function describeLines(issue, change) {
  const lines = [];
  if (change) lines.push('change: ' + change);
  lines.push('key: ' + issue.key);
  if (issue.type) lines.push('issueType: ' + issue.type);
  if (issue.status) lines.push('status: ' + issue.status);
  if (issue.epic) lines.push('epic: ' + issue.epic);
  lines.push('generator: jira-to-openspec@' + EXTENSION_VERSION, 'generated: ' + isoToday(), 'managed: true');
  return lines;
}

function content(issue) {
  const body = wikiToMd(issue.description);
  return '\n# ' + issue.summary + '\n' + (body ? '\n' + body : '');
}

function issueDocument(issue, change) {
  const fm = serializeFrontMatter(
    { url: issueWebUrl(issue.site, issue.key), updated: issue.updated }, describeLines(issue, change));
  return fm + content(issue);
}

function topKey(line) {
  return /^\s/.test(line) ? null : line.split(':')[0].trim();
}

// Front matter lines of the previous file that the refreshed issue does not set
// itself, with any indented lines that belong to them.
function keptLines(previousLines, freshLines) {
  const fresh = new Set(freshLines.map(topKey));
  const kept = [];
  let keep = false;
  for (const line of previousLines) {
    const key = topKey(line);
    if (key !== null) keep = !fresh.has(key);
    if (keep) kept.push(line);
  }
  return kept;
}

function pulledDocument(issue, previousText) {
  const previous = parseFrontMatter(previousText);
  const fresh = describeLines(issue, issue.change);
  const fm = serializeFrontMatter(
    { url: previous.meta.url, updated: issue.updated },
    fresh.concat(keptLines(previous.extraLines, fresh)));
  return fm + content(issue);
}

module.exports = { issueDocument, pulledDocument };
