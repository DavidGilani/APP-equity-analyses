// Progress summaries, snapshots and the committee update.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});

  const fmt = (iso) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');
  const fmtLong = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });

  function isMine(owner, yourName) {
    const o = String(owner || '').trim().toLowerCase();
    const y = String(yourName || '').trim().toLowerCase();
    if (!o || !y) return false;
    return o === y || o === 'me' || o.split(/[\s,&/]+/).includes(y.split(/\s+/)[0]);
  }

  // The next planned change of stage after today.
  function nextStageChange(iv, today) {
    const { periods } = APP.model.plannedPeriods(iv);
    const next = periods.filter((p) => p.start > today).sort((a, b) => a.start.localeCompare(b.start))[0];
    if (next) return { text: `${next.stage} due to start ${fmt(next.start)}`, date: next.start };
    const current = periods.find((p) => today >= p.start && today <= p.end);
    if (current) return { text: `${current.stage} due to finish ${fmt(current.end)}`, date: current.end };
    return null;
  }

  function currentStage(iv, today) {
    const { periods, source } = APP.model.plannedPeriods(iv);
    const now = periods.filter((p) => today >= p.start && today <= p.end).map((p) => p.stage);
    if (now.length) return { text: now.join(' and '), source };
    if (!periods.length) return { text: 'No planned dates', source: null };
    const rank = APP.model.plannedRankOn(periods, today);
    return { text: rank === 0 ? 'Not started yet' : rank === 4 ? 'Finished' : `Between stages (after ${APP.model.PHASE_NAMES[rank].toLowerCase()})`, source };
  }

  function openItems(iv) {
    return (iv.deliverables || []).filter((d) => d.status !== 'Done')
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
  }

  // Everything the progress tab and the strand summary need for one strand.
  function strandProgress(tracker, strand, today, yourName) {
    const { model, templates } = APP;
    const all = tracker.interventions.filter((iv) => iv.strand === Number(strand));
    const notes = tracker.notes || [];
    const rows = all.filter((iv) => iv.status !== 'BAU').map((iv) => {
      const ivNotes = notes.filter((n) => n.interventionId === iv.id).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
      const items = openItems(iv);
      return {
        iv,
        toc: templates.assess(iv),
        stageCheck: model.slipCheck(iv, today),
        delivCheck: model.deliverableCheck(iv, today),
        flag: model.overallFlag(iv, today),
        now: currentStage(iv, today),
        nextStage: nextStageChange(iv, today),
        nextItem: items.find((d) => d.due) || items[0] || null,
        openItems: items,
        latest: ivNotes.find((n) => n.type === 'Update') || ivNotes[0] || null,
        risks: ivNotes.filter((n) => n.type === 'Risk'),
        questions: ivNotes.filter((n) => n.type === 'Question'),
        templateChanges: (tracker.templateUpdates || []).filter((u) => u.interventionId === iv.id && !u.done),
      };
    });
    const items = rows.flatMap((r) => r.openItems.map((d) => ({ ...d, iv: r.iv })))
      .sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'));
    return {
      strand: Number(strand),
      name: (tracker.strands.find((s) => s.number === Number(strand)) || {}).name || '',
      bauCount: all.length - rows.length,
      rows,
      yours: items.filter((d) => isMine(d.owner, yourName)),
      team: items.filter((d) => !isMine(d.owner, yourName)),
    };
  }

  const TOC_TEXT = { complete: 'Complete', partial: 'Partly written', missing: 'No template yet', exempt: 'Not needed', bau: 'Not needed' };

  function tocLine(toc) {
    if (toc.state !== 'partial') return TOC_TEXT[toc.state];
    return `Partly written (${toc.filled} of ${toc.total} parts)`;
  }

  // Word summary for a strand lead.
  function strandSummaryDoc(tracker, strand, today, yourName) {
    const sp = strandProgress(tracker, strand, today, yourName);
    const d = APP.docx.create();
    d.title(`Strand ${sp.strand}: ${sp.name}, progress summary`);
    d.note(`As at ${fmtLong(today)}. Generated from the APP tracker; please check and let me know if anything doesn't match what you're expecting.`);

    d.h1('Actions and deliverables coming up');
    if (!sp.yours.length && !sp.team.length) d.p('No open actions or deliverables are recorded.');
    const itemRow = (x) => [`${x.iv.id}`, x.title, x.owner || 'Not set', x.due ? fmt(x.due) : 'No date', x.status];
    if (sp.team.length) {
      d.h2('With the strand team');
      d.table(['#', 'Action or deliverable', 'Owner', 'Due', 'Status'], sp.team.map(itemRow), [600, 4400, 1400, 1300, 1300]);
    }
    if (sp.yours.length) {
      d.h2(`With ${yourName || 'me'}`);
      d.table(['#', 'Action or deliverable', 'Owner', 'Due', 'Status'], sp.yours.map(itemRow), [600, 4400, 1400, 1300, 1300]);
    }

    d.h1('Interventions');
    for (const r of sp.rows) {
      d.h2(`${r.iv.id} ${r.iv.name}`);
      d.bullet([{ text: 'Status: ', bold: true }, r.iv.status || 'Not set']);
      d.bullet([{ text: 'Planned stage now: ', bold: true }, r.now.text]);
      if (r.nextStage) d.bullet([{ text: 'Next: ', bold: true }, r.nextStage.text]);
      d.bullet([{ text: 'Theory of change: ', bold: true }, tocLine(r.toc)]);
      if (r.latest) d.bullet([{ text: `Latest update (${fmt(r.latest.date)}): `, bold: true }, r.latest.text]);
      for (const n of r.risks) d.bullet([{ text: 'Risk: ', bold: true }, n.text]);
      for (const n of r.questions) d.bullet([{ text: 'Open question: ', bold: true }, n.text]);
    }
    if (sp.bauCount) d.note(`${sp.bauCount} business as usual intervention${sp.bauCount === 1 ? ' is' : 's are'} not included.`);
    return d.toBlob();
  }

  // Plain text version, for pasting into an email.
  function strandSummaryText(tracker, strand, today, yourName) {
    const sp = strandProgress(tracker, strand, today, yourName);
    const lines = [`Strand ${sp.strand}: ${sp.name}, progress summary as at ${fmtLong(today)}`, ''];
    const item = (x) => `- ${x.iv.id}: ${x.title} (${x.owner || 'owner not set'}, ${x.due ? 'due ' + fmt(x.due) : 'no date'})`;
    if (sp.team.length) lines.push('With the strand team:', ...sp.team.map(item), '');
    if (sp.yours.length) lines.push(`With ${yourName || 'me'}:`, ...sp.yours.map(item), '');
    for (const r of sp.rows) {
      lines.push(`${r.iv.id} ${r.iv.name}`);
      lines.push(`  Status: ${r.iv.status || 'Not set'}. Planned stage now: ${r.now.text}.${r.nextStage ? ` Next: ${r.nextStage.text}.` : ''}`);
      lines.push(`  Theory of change: ${tocLine(r.toc)}.`);
      if (r.latest) lines.push(`  Latest update: ${r.latest.text}`);
      for (const n of r.risks) lines.push(`  Risk: ${n.text}`);
      lines.push('');
    }
    return lines.join('\n');
  }

  // ---------- snapshots and the committee update ----------

  function snapshot(tracker, today) {
    const interventions = {};
    for (const iv of tracker.interventions) {
      interventions[iv.id] = {
        name: iv.name, strand: iv.strand, status: iv.status, toc: APP.templates.assess(iv).state,
        deliverables: Object.fromEntries((iv.deliverables || []).map((d) => [d.id, { title: d.title, status: d.status, due: d.due }])),
      };
    }
    return { date: today, createdAt: new Date().toISOString(), interventions };
  }

  function diff(prev, cur, tracker) {
    const out = { statusChanges: [], tocChanges: [], delivered: [], added: [], newRisks: [] };
    if (!prev) return out;
    for (const [id, c] of Object.entries(cur.interventions)) {
      const p = prev.interventions[id];
      if (!p) { out.statusChanges.push({ id, name: c.name, from: null, to: c.status }); continue; }
      if (p.status !== c.status) out.statusChanges.push({ id, name: c.name, from: p.status, to: c.status });
      if (p.toc !== c.toc && ['partial', 'complete'].includes(c.toc)) out.tocChanges.push({ id, name: c.name, from: p.toc, to: c.toc });
      for (const [did, d] of Object.entries(c.deliverables)) {
        const pd = p.deliverables[did];
        if (d.status === 'Done' && (!pd || pd.status !== 'Done')) out.delivered.push({ id, title: d.title });
        else if (!pd) out.added.push({ id, title: d.title, due: d.due });
      }
    }
    out.newRisks = (tracker.notes || []).filter((n) => n.type === 'Risk' && n.date > prev.date)
      .map((n) => ({ id: n.interventionId, text: n.text }));
    return out;
  }

  const TOC_STATE = { missing: 'no template', partial: 'partly written', complete: 'complete', bau: 'not needed', exempt: 'not needed' };

  function committeeDoc(tracker, today, prev) {
    const { model } = APP;
    const cur = snapshot(tracker, today);
    const ch = diff(prev, cur, tracker);
    const counts = (list) => {
      const c = Object.fromEntries(model.COMMITTEE_CATEGORIES.map((k) => [k, 0]));
      for (const iv of list) { const k = model.committeeCategory(iv.status); if (k) c[k]++; }
      return c;
    };
    const all = counts(tracker.interventions);
    const d = APP.docx.create();
    d.title('APP update: generated sections');
    d.note(`Generated on ${fmtLong(today)}${prev ? `, compared with the snapshot from ${fmtLong(prev.date)}` : '. There is no earlier snapshot, so the "what changed" section is empty'}. Copy these sections into the committee paper and edit the narrative there. Table 1 (OfS targets) and Table 3 (Interventions Fund) are added by hand.`);

    d.h1('Executive summary: what changed since the last update');
    if (!prev) d.p('No earlier snapshot to compare with.');
    else {
      const none = !ch.statusChanges.length && !ch.tocChanges.length && !ch.delivered.length && !ch.newRisks.length;
      if (none) d.p('No changes recorded since the last snapshot.');
      for (const s of ch.statusChanges) d.bullet(s.from ? `${s.id} ${s.name}: status changed from ${s.from} to ${s.to}.` : `${s.id} ${s.name}: added, with status ${s.to}.`);
      for (const s of ch.tocChanges) d.bullet(`${s.id} ${s.name}: theory of change now ${TOC_STATE[s.to]} (was ${TOC_STATE[s.from] || s.from}).`);
      for (const s of ch.delivered) d.bullet(`${s.id}: delivered "${s.title}".`);
      for (const s of ch.newRisks) d.bullet(`${s.id}: new risk, ${s.text}`);
    }

    d.h1('Analysis of progress against the delivery plan');
    d.p(`There are ${tracker.interventions.length} interventions across the seven strands:`);
    d.bullet(`${all['BAU']} interventions now classified as business as usual (BAU);`);
    d.bullet(`${all['To be mapped']} interventions that are at risk because they still require further mapping to determine scope and timeframes;`);
    d.bullet(`${all['On track']} interventions that are on track;`);
    d.bullet(`${all['Behind schedule / at risk']} interventions that are behind schedule / at risk.`);

    d.h2('Table 2: status by strand');
    const rows = tracker.strands.map((s) => {
      const list = tracker.interventions.filter((iv) => iv.strand === s.number);
      const c = counts(list);
      const risks = (tracker.notes || []).filter((n) => n.type === 'Risk' && list.some((iv) => iv.id === n.interventionId) && (!prev || n.date > prev.date));
      const notes = risks.length ? risks.map((n) => [{ text: `${n.interventionId}: `, bold: true }, n.text]) : [[{ text: 'Add notes', italic: true, muted: true }]];
      return [`Strand ${s.number}: ${s.name}`, String(c['BAU']), String(c['On track']), String(c['To be mapped']), String(c['Behind schedule / at risk']), notes];
    });
    d.table(['Strand', 'BAU', 'On track', 'To be mapped', 'Behind / at risk', 'Notes and risks'], rows, [1900, 700, 900, 1000, 1000, 3900]);
    d.note('The notes column lists risks recorded since the last snapshot, as a starting point. Edit before use.');

    d.h2('Theory of change progress');
    const tocRows = tracker.strands.map((s) => {
      const list = tracker.interventions.filter((iv) => iv.strand === s.number).map((iv) => APP.templates.assess(iv).state);
      const n = (st) => String(list.filter((x) => x === st).length);
      return [`Strand ${s.number}: ${s.name}`, n('complete'), n('partial'), n('missing'), String(list.filter((x) => x === 'bau' || x === 'exempt').length)];
    });
    d.table(['Strand', 'Complete', 'Partly written', 'No template', 'Not needed'], tocRows, [3000, 1500, 1500, 1500, 1500]);
    return { blob: d.toBlob(), snapshot: cur, changes: ch };
  }

  APP.reports = { strandProgress, strandSummaryDoc, strandSummaryText, snapshot, diff, committeeDoc, isMine, fmt, tocLine };
})(typeof window !== 'undefined' ? window : globalThis);
