const { fetchFields, fetchIssue, searchIssues, isCloud } = require('./jiraClient');
const { resolveChangeField, changeOfIssue } = require('./changeField');
const { changeName } = require('./openspecPaths');
const { changeField } = require('./config');

const BASE_FIELDS = ['summary', 'description', 'issuetype', 'status', 'parent', 'labels', 'updated', 'project'];

// What one command needs to know about the instance: where the change name
// lives and, on Server/DC, which field holds the epic link.
async function jiraContext(creds, site) {
  const setting = changeField();
  const needsFields = setting.kind === 'field' && !/^customfield_\d+$/.test(setting.field);
  const list = needsFields || !isCloud(site) ? await fetchFields(creds, site) : [];
  const epicLink = isCloud(site) ? null
    : (list.find((f) => f.schema && f.schema.custom === 'com.pyxis.greenhopper.jira:gh-epic-link') ||
      list.find((f) => String(f.name).toLowerCase() === 'epic link') || null);
  return {
    creds,
    site,
    change: resolveChangeField(setting, list),
    epicLinkId: epicLink ? epicLink.id : ''
  };
}

function fieldsFor(ctx) {
  return BASE_FIELDS.concat(ctx.change.id === 'labels' ? [] : [ctx.change.id], ctx.epicLinkId ? [ctx.epicLinkId] : []);
}

function isEpic(j) {
  const type = (j.fields && j.fields.issuetype) || {};
  return String(type.name || '').toLowerCase() === 'epic' || type.hierarchyLevel === 1;
}

function epicOf(ctx, j) {
  const f = j.fields || {};
  if (ctx.epicLinkId && f[ctx.epicLinkId]) return String(f[ctx.epicLinkId]);
  const parent = f.parent;
  const parentType = parent && parent.fields && parent.fields.issuetype;
  return parent && parentType && isEpic(parent) ? parent.key : '';
}

function issueOf(ctx, j) {
  const f = j.fields || {};
  return {
    key: j.key,
    summary: f.summary || '',
    description: f.description || '',
    type: (f.issuetype && f.issuetype.name) || '',
    status: (f.status && f.status.name) || '',
    updated: f.updated || '',
    project: (f.project && f.project.key) || String(j.key).split('-')[0],
    epic: epicOf(ctx, j),
    isEpic: isEpic(j),
    change: changeName(changeOfIssue(ctx.change, f)),
    fields: f,
    site: ctx.site
  };
}

async function loadIssue(ctx, key) {
  return issueOf(ctx, await fetchIssue(ctx.creds, ctx.site, key, fieldsFor(ctx)));
}

// Stories, tasks and other issues directly in the epic.
async function loadEpicChildren(ctx, epicKey) {
  const jql = (ctx.epicLinkId ? '"Epic Link" = ' : 'parent = ') + epicKey + ' ORDER BY key ASC';
  const found = await searchIssues(ctx.creds, ctx.site, jql, fieldsFor(ctx));
  return found.map((j) => ({ ...issueOf(ctx, j), epic: epicKey }));
}

module.exports = { jiraContext, loadIssue, loadEpicChildren, fieldsFor };
