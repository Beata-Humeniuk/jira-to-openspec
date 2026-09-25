// Where a Jira issue keeps the name of its OpenSpec change: a label such as
// "openspec:add-2fa" (every issue has labels, nothing to set up), or a custom
// text field an administrator added.

const LABELS = 'labels';

function changeFieldSetting(value, prefix) {
  const field = String(value == null ? '' : value).trim();
  return {
    kind: !field || field.toLowerCase() === LABELS ? 'label' : 'field',
    field,
    prefix: String(prefix == null ? 'openspec:' : prefix)
  };
}

// The field id to request and write: labels, an id as given, or the id of the
// field whose name matches (case-insensitive).
function resolveChangeField(setting, fieldList) {
  if (setting.kind === 'label') return { ...setting, id: LABELS };
  if (/^customfield_\d+$/.test(setting.field)) return { ...setting, id: setting.field };
  const wanted = setting.field.toLowerCase();
  const match = (fieldList || []).find((f) => String(f.name || '').toLowerCase() === wanted);
  if (!match) throw new Error('change-field');
  return { ...setting, id: match.id };
}

function textOf(value) {
  if (value == null) return '';
  if (Array.isArray(value)) return value.length ? textOf(value[0]) : '';
  if (typeof value === 'object') return String(value.value || value.name || '');
  return String(value);
}

function changeOfIssue(resolved, fields) {
  if (resolved.kind === 'label') {
    const label = ((fields && fields.labels) || []).find((l) => l.startsWith(resolved.prefix) && l.length > resolved.prefix.length);
    return label ? label.slice(resolved.prefix.length) : '';
  }
  return textOf(fields && fields[resolved.id]).trim();
}

// The part of an issue update that sets the change name. Other labels stay.
function changeUpdate(resolved, fields, change) {
  if (!change || changeOfIssue(resolved, fields) === change) return null;
  if (resolved.kind === 'field') return { fields: { [resolved.id]: change } };
  const stale = ((fields && fields.labels) || []).filter((l) => l.startsWith(resolved.prefix));
  return {
    update: {
      labels: stale.map((l) => ({ remove: l })).concat([{ add: resolved.prefix + change }])
    }
  };
}

// The same, for a new issue.
function changeCreateFields(resolved, change) {
  if (!change) return {};
  return resolved.kind === 'field' ? { [resolved.id]: change } : { labels: [resolved.prefix + change] };
}

module.exports = { changeFieldSetting, resolveChangeField, changeOfIssue, changeUpdate, changeCreateFields };
