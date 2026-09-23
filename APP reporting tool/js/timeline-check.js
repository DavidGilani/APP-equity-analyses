// Compares the APP timeline and status spreadsheet with what the tool knows,
// and lists the changes the spreadsheet probably needs.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});
  const DAY = 86400000;
  // Words that suggest a note is about timing. "May" and "term" only count in
  // phrases where they clearly mean a month or a teaching term.
  const TIMING_WORDS = new RegExp([
    '\\b(january|february|march|april|june|july|august|september|october|november|december)\\b',
    '\\b(in|by|from|until|during|end of|early|late) may\\b', '\\bmay 20\\d\\d\\b',
    '\\bsemester\\b', '\\b(this|next|each|per|every|autumn|spring|summer) term\\b', '\\btermly\\b',
    '\\b(christmas|easter)\\b', '\\b(this|next|academic) year\\b', '\\b20\\d\\d\\b',
  ].join('|'), 'i');

  // The tool's status, written the way the spreadsheet writes it.
  function sheetStatus(status) {
    return { 'BAU': 'BAU', 'On track': 'On Track', 'Ahead of schedule': 'On Track', 'To be mapped': 'To be mapped',
      'At risk': 'Behind schedule / at risk', 'Behind schedule': 'Behind schedule / at risk' }[status] || status;
  }

  const days = (a, b) => Math.round((Date.parse(a) - Date.parse(b)) / DAY);

  function span(periods, stage) {
    const ps = periods.filter((p) => p.stage === stage && p.activity !== 'existing');
    if (!ps.length) return null;
    return { start: ps.map((p) => p.start).sort()[0], end: ps.map((p) => p.end).sort().slice(-1)[0] };
  }

  function checkTimeline(tracker, parsed, tolerance = 14) {
    const { fmt } = APP.reports;
    const sheetById = new Map(parsed.interventions.map((p) => [p.id, p]));
    const results = [];

    for (const iv of tracker.interventions) {
      const items = [];
      const p = sheetById.get(iv.id);
      if (!p) { results.push({ iv, items: [{ kind: 'row', text: 'Not in the spreadsheet. Add a row for it.' }] }); continue; }

      // Status
      const want = sheetStatus(iv.status);
      const has = sheetStatus(APP.model.statusFromTracker(p.status) || p.status);
      if (want && has !== want) items.push({ kind: 'status', text: `Change the project status from "${has}" to "${want}".` });

      if (iv.status !== 'BAU') {
        // Stage dates: the template owns them, so the spreadsheet should match.
        const tf = iv.template && iv.template.timeframes;
        if (tf) {
          for (const [key, stage] of [['planning', 'Planning'], ['implementation', 'Implementation'], ['evaluation', 'Evaluation']]) {
            const t = tf[key];
            if (!t || !t.start || !t.end) continue;
            const s = span(p.plannedStages, stage);
            if (!s) items.push({ kind: 'dates', text: `Add ${stage.toLowerCase()} from ${fmt(t.start)} to ${fmt(t.end)}, as in the project template.` });
            else if (Math.abs(days(s.start, t.start)) > tolerance || Math.abs(days(s.end, t.end)) > tolerance) {
              items.push({ kind: 'dates', text: `${stage}: the spreadsheet has ${fmt(s.start)} to ${fmt(s.end)}, but the project template has ${fmt(t.start)} to ${fmt(t.end)}. Update the spreadsheet to match the template.` });
            }
          }
        } else if (!p.plannedStages.some((x) => x.stage !== 'BAU' && x.activity !== 'existing')) {
          items.push({ kind: 'dates', text: 'No planned stages for the current cycle. Add planning, implementation and evaluation dates once they are known.' });
        }

        // Deliverables due after the last planned date in the spreadsheet.
        const lastEnd = p.plannedStages.map((x) => x.end).sort().slice(-1)[0];
        for (const d of (iv.deliverables || []).filter((x) => x.due && x.status !== 'Done' && x.kind === 'deliverable')) {
          if (!lastEnd || d.due > lastEnd) {
            items.push({ kind: 'dates', text: `"${d.title}" is due ${fmt(d.due)}, after the timeline ends${lastEnd ? ` (${fmt(lastEnd)})` : ''}. Extend the timeline to cover it.` });
          }
        }
      }

      // Timeframe changes raised in meetings, and notes that mention timing.
      for (const u of (tracker.templateUpdates || []).filter((x) => x.interventionId === iv.id && !x.done && x.section === 'Timeframes')) {
        items.push({ kind: 'meeting', text: `Raised on ${fmt(u.raisedOn)}: ${u.text}` });
      }
      for (const n of (tracker.notes || []).filter((x) => x.interventionId === iv.id && ['Update', 'Decision', 'Scope change', 'Question'].includes(x.type) && TIMING_WORDS.test(x.text))) {
        items.push({ kind: 'note', text: `${n.type} on ${fmt(n.date)} mentions timing: ${n.text}` });
      }
      if (items.length) results.push({ iv, items });
    }

    const ids = new Set(tracker.interventions.map((iv) => iv.id));
    const extra = parsed.interventions.filter((p) => !ids.has(p.id)).map((p) => p.id);
    return { results, extra };
  }

  APP.timelineCheck = { checkTimeline, sheetStatus };
})(typeof window !== 'undefined' ? window : globalThis);
