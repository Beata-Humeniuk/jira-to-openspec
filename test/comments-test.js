const { commentsOf, commentsSection, withoutComments } = require('../src/comments');

const assert = (cond, msg) => { if (!cond) { console.error('FAIL: ' + msg); process.exit(1); } };

const fields = { comment: { comments: [
  { author: { displayName: 'Anna Nowak' }, created: '2026-10-20T09:15:00.000+0200', body: 'Looks *good*.\nh2. Open points\n* retry?' },
  { author: { name: 'jdoe' }, created: '2026-10-21T14:02:11.000+0200', body: '<p>Agreed &amp; <strong>done</strong>.</p>' },
  { body: '{code}\n## not a heading\n{code}' }
] } };

const comments = commentsOf(fields);
assert(comments.length === 3 && comments[1].author === 'jdoe' && comments[2].author === 'Unknown', 'authors, got: ' + JSON.stringify(comments));
assert(commentsOf({}).length === 0 && commentsSection([]) === '', 'no comments, no section');

const md = commentsSection(comments);
assert(md.startsWith('<!-- jira-to-openspec:comments'), 'the section starts with the marker, got:\n' + md);
assert(md.includes('\n## Comments\n\n### Anna Nowak · 2026-10-20 09:15\n\nLooks **good**.\n\n##### Open points\n\n- retry?'),
  'wiki comments become Markdown with headings under the comment, got:\n' + md);
assert(md.includes('### jdoe · 2026-10-21 14:02\n\nAgreed & **done**.'), 'HTML comments become Markdown, got:\n' + md);
assert(md.includes('### Unknown\n\n```\n## not a heading\n```'), 'code blocks are left alone, got:\n' + md);

const doc = '## Why\n\nBecause.\n\n' + md;
assert(withoutComments(doc) === '## Why\n\nBecause.\n', 'Push drops the section, got:\n' + withoutComments(doc));
assert(withoutComments('## Why\n\nBecause.\n') === '## Why\n\nBecause.\n', 'a file without comments is unchanged');

console.log('PASS: comments ok');
