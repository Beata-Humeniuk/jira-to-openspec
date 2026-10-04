const LABELS = 'labels';
const DESCRIPTION = 'description';
const MARKER = 'OpenSpec change';
const MARKER_LINE = /^[ \t]*[*_]{0,2}openspec[ \t]+change[*_]{0,2}[ \t]*:[ \t]*(.*?)[ \t]*$/im;

function changeFieldSetting(value, prefix) {
  const field = String(value == null ? '' : value).trim();
  const lower = field.toLowerCase();
  return {
    kind: !field || lower === DESCRIPTION ? 'description' : lower === LABELS ? 'label' : 'field',
    field,
    prefix: String(prefix == null ? 'openspec:' : prefix)
  };
}

function resolveChangeField(setting, fieldList) {
  if (setting.kind === 'description') return { ...setting, id: DESCRIPTION };
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

function changeInDescription(description) {
  const m = String(description || '').match(MARKER_LINE);
  return m ? m[1].replace(/[*_{}]/g, '').trim() : '';
}

function descriptionWithoutChange(resolved, description) {
  const text = String(description || '');
  if (resolved.kind !== 'description' || !MARKER_LINE.test(text)) return text;
  const line = new RegExp(MARKER_LINE.source, 'i');
  return text.replace(/\r\n?/g, '\n').split('\n')
    .filter((l) => !line.test(l))
    .join('\n').replace(/\n{3,}/g, '\n\n').replace(/^\n+|\n+$/g, '');
}

function withChangeLine(description, change) {
  const body = String(description || '').replace(/\n+$/, '');
  return (body ? body + '\n\n' : '') + MARKER + ': ' + change;
}

function changeOfIssue(resolved, fields) {
  if (resolved.kind === 'description') return changeInDescription(fields && fields.description);
  if (resolved.kind === 'label') {
    const label = ((fields && fields.labels) || []).find((l) => l.startsWith(resolved.prefix) && l.length > resolved.prefix.length);
    return label ? label.slice(resolved.prefix.length) : '';
  }
  return textOf(fields && fields[resolved.id]).trim();
}

function changeUpdate(resolved, fields, change, description) {
  if (resolved.kind === 'description') {
    const name = change || changeInDescription(fields && fields.description);
    return name ? { fields: { description: withChangeLine(description, name) } } : null;
  }
  if (!change || changeOfIssue(resolved, fields) === change) return null;
  if (resolved.kind === 'field') return { fields: { [resolved.id]: change } };
  const stale = ((fields && fields.labels) || []).filter((l) => l.startsWith(resolved.prefix));
  return {
    update: {
      labels: stale.map((l) => ({ remove: l })).concat([{ add: resolved.prefix + change }])
    }
  };
}

function changeCreateFields(resolved, change, description) {
  if (!change) return {};
  if (resolved.kind === 'description') return { description: withChangeLine(description, change) };
  return resolved.kind === 'field' ? { [resolved.id]: change } : { labels: [resolved.prefix + change] };
}

module.exports = {
  changeFieldSetting, resolveChangeField, changeOfIssue, changeUpdate, changeCreateFields,
  descriptionWithoutChange
};
