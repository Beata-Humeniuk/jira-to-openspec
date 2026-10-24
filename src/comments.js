const { wikiToMd } = require('./wikiToMd');
const { htmlToMd, looksLikeHtml } = require('./htmlToMd');

// Download and Pull write comments below this line; Push sends only what is above it.
const MARKER = '<!-- jira-to-openspec:comments — downloaded from Jira, Push leaves this section out -->';
const MARKER_START = '<!-- jira-to-openspec:comments';

function jiraTextToMd(text) {
  return looksLikeHtml(text) ? htmlToMd(text) : wikiToMd(text);
}

function commentsOf(fields) {
  const list = (fields && fields.comment && fields.comment.comments) || [];
  return list.map((c) => ({
    author: (c.author && (c.author.displayName || c.author.name)) || 'Unknown',
    created: String(c.created || ''),
    body: c.body || ''
  }));
}

function demoteHeadings(md, by) {
  let fence = null;
  return md.split('\n').map((line) => {
    const f = line.match(/^\s*(`{3,}|~{3,})/);
    if (f && (!fence || f[1][0] === fence[0] && f[1].length >= fence.length)) {
      fence = fence ? null : f[1];
      return line;
    }
    if (fence) return line;
    return line.replace(/^(#{1,6})(?=[ \t])/, (h) => '#'.repeat(Math.min(6, h.length + by)));
  }).join('\n');
}

function when(created) {
  const m = created.match(/^(\d{4}-\d{2}-\d{2})T(\d{2}:\d{2})/);
  return m ? m[1] + ' ' + m[2] : created;
}

function commentsSection(comments) {
  if (!comments || !comments.length) return '';
  const parts = comments.map((c) => {
    const body = demoteHeadings(jiraTextToMd(c.body).replace(/\n+$/, ''), 3);
    return '### ' + c.author + (c.created ? ' · ' + when(c.created) : '') + (body ? '\n\n' + body : '');
  });
  return MARKER + '\n\n## Comments\n\n' + parts.join('\n\n') + '\n';
}

function withoutComments(md) {
  const at = md.search(new RegExp('^' + MARKER_START.replace(/[-!]/g, '\\$&'), 'm'));
  return at < 0 ? md : md.slice(0, at).replace(/\s+$/, '') + '\n';
}

module.exports = { jiraTextToMd, commentsOf, commentsSection, withoutComments };
