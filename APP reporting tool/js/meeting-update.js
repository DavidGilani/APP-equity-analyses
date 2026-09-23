// Parses a structured meeting update and applies it to the tracker.
// The same format is produced by hand or by the saved Copilot prompt.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});

  const NOTE_KEYS = {
    'update': 'Update', 'risk': 'Risk', 'decision': 'Decision', 'scope change': 'Scope change', 'question': 'Question',
    'reason for delay': 'Reason for delay', 'reason': 'Reason for delay', 'success': 'Success',
  };

  function parseDate(s) {
    s = (s || '').trim();
    if (!s) return null;
    return APP.templates.parseDateText(s);
  }

  // "Title | owner: Name | due: 16/10/2026" -> { text, fields }
  function splitFields(value) {
    const parts = value.split('|').map((p) => p.trim());
    const fields = {};
    for (const p of parts.slice(1)) {
      const m = /^([a-z ]+):\s*(.*)$/i.exec(p);
      if (m) fields[m[1].trim().toLowerCase()] = m[2].trim();
    }
    return { text: parts[0], fields };
  }

  function parseUpdate(text, tracker) {
    const { model } = APP;
    const ids = new Set(tracker.interventions.map((iv) => iv.id));
    const out = { meeting: '', date: null, groups: [], warnings: [] };
    let group = null;

    text.split(/\r?\n/).forEach((raw, i) => {
      const line = raw.replace(/^\s*[-*•]\s*/, '').trim();
      const where = `Line ${i + 1}`;
      if (!line) return;

      // Intervention headings: "[6.2]", "APP6.2 Local part-time", "## 6.2 ..."
      const head = /^(?:#+\s*)?\[?\s*(?:APP\s*)?(\d+)\.(\d+)\b/i.exec(line);
      if (head && /^(\[|APP|#)/i.test(line)) {
        const id = `${Number(head[1])}.${Number(head[2])}`;
        if (!ids.has(id)) { out.warnings.push(`${where}: ${id} isn't in the tracker, so its lines are skipped.`); group = null; return; }
        group = out.groups.find((g) => g.id === id) || (out.groups.push({ id, notes: [], deliverables: [], templateUpdates: [], status: null }), out.groups[out.groups.length - 1]);
        return;
      }

      const kv = /^([A-Za-z ]+?)\s*:\s*(.*)$/.exec(line);
      if (!kv) { out.warnings.push(`${where}: not understood, skipped: "${line}"`); return; }
      const key = kv[1].trim().toLowerCase();
      const value = kv[2].trim();

      if (key === 'meeting') { out.meeting = value; return; }
      if (key === 'date') {
        out.date = parseDate(value);
        if (!out.date) out.warnings.push(`${where}: date not understood: "${value}"`);
        return;
      }
      if (!group) { out.warnings.push(`${where}: comes before any intervention heading like [6.2], skipped.`); return; }
      if (!value) { out.warnings.push(`${where}: empty ${key}, skipped.`); return; }

      if (NOTE_KEYS[key]) {
        group.notes.push({ type: NOTE_KEYS[key], text: value });
      } else if (key === 'action' || key === 'deliverable') {
        const { text: title, fields } = splitFields(value);
        const due = fields.due ? parseDate(fields.due) : null;
        if (fields.due && !due) out.warnings.push(`${where}: due date not understood: "${fields.due}"`);
        let status = 'Not started';
        if (fields.status) {
          status = model.DELIVERABLE_STATUSES.find((s) => s.toLowerCase() === fields.status.toLowerCase());
          if (!status) { out.warnings.push(`${where}: status "${fields.status}" not recognised, set to Not started.`); status = 'Not started'; }
        }
        group.deliverables.push({ kind: key, title, owner: fields.owner || '', due, status });
      } else if (key === 'template') {
        const { text: section, fields } = splitFields(value);
        const rest = value.includes('|') ? value.slice(value.indexOf('|') + 1).trim() : '';
        const match = model.TEMPLATE_SECTIONS.find((s) => s.toLowerCase() === section.toLowerCase());
        if (!match) out.warnings.push(`${where}: template section "${section}" not recognised. Use one of: ${model.TEMPLATE_SECTIONS.join(', ')}.`);
        group.templateUpdates.push({ section: match || 'Top-level details', text: match ? rest : value, fields });
      } else if (key === 'status') {
        const s = model.STATUSES.find((x) => x.toLowerCase() === value.toLowerCase());
        if (!s) out.warnings.push(`${where}: status "${value}" not recognised. Use one of: ${model.STATUSES.join(', ')}.`);
        else group.status = s;
      } else {
        out.warnings.push(`${where}: "${kv[1]}" isn't a recognised line type, skipped.`);
      }
    });

    out.groups.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
    return out;
  }

  function applyUpdate(tracker, parsed, nowIso) {
    const { model } = APP;
    const t = JSON.parse(JSON.stringify(tracker));
    t.notes = t.notes || [];
    t.templateUpdates = t.templateUpdates || [];
    t.meetings = t.meetings || [];
    const date = parsed.date || nowIso.slice(0, 10);
    const meetingId = model.newId('m');
    t.meetings.push({ id: meetingId, title: parsed.meeting || 'Meeting', date, importedAt: nowIso });
    const source = { meetingId, date };

    for (const g of parsed.groups) {
      const iv = t.interventions.find((x) => x.id === g.id);
      iv.deliverables = iv.deliverables || [];
      for (const n of g.notes) t.notes.push({ id: model.newId('n'), interventionId: g.id, ...n, ...source });
      for (const d of g.deliverables) iv.deliverables.push({ id: model.newId('d'), ...d, ...source });
      for (const u of g.templateUpdates) t.templateUpdates.push({ id: model.newId('t'), interventionId: g.id, section: u.section, text: u.text, raisedOn: date, meetingId, done: false });
      if (g.status && g.status !== iv.status) {
        t.notes.push({ id: model.newId('n'), interventionId: g.id, type: 'Status change', text: `${iv.status || 'No status'} to ${g.status}`, ...source });
        iv.status = g.status;
      }
    }
    return t;
  }

  APP.meetingUpdate = { parseUpdate, applyUpdate };
})(typeof window !== 'undefined' ? window : globalThis);
