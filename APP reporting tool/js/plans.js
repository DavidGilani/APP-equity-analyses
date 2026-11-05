// Delivery and data plans: the deliverables agreed with each team, with dates,
// and the data each intervention will provide for its evaluation.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});

  const DATA_STATUSES = ['To agree', 'Agreed', 'Received'];

  const fmt = (iso) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }) : '');

  function weeksBetween(a, b) {
    const days = (new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000;
    return Math.round(days / 7);
  }

  // How far a deliverable has moved from the date agreed with the team.
  function slip(d) {
    if (!d.agreedDue || !d.due || d.due <= d.agreedDue) return null;
    const w = weeksBetween(d.agreedDue, d.due);
    return { weeks: w, text: w >= 1 ? `${w} week${w === 1 ? '' : 's'} later than agreed` : 'Later than agreed' };
  }

  function needsPlan(iv) {
    return iv.status !== 'BAU';
  }

  // What is missing from an intervention's plan, and what has slipped or is late.
  function planCheck(iv, today) {
    const deliv = (iv.deliverables || []).filter((d) => d.kind !== 'action');
    const data = iv.dataNeeds || [];
    const gaps = [];
    if (!deliv.length) gaps.push('No deliverables recorded');
    const undated = deliv.filter((d) => !d.due && d.status !== 'Done');
    if (undated.length) gaps.push(`${undated.length} deliverable${undated.length === 1 ? '' : 's'} without a date`);
    if (!data.length) gaps.push('No data requirements recorded');
    const dataGaps = data.filter((x) => !x.owner || !x.when || !x.format);
    if (dataGaps.length) gaps.push(`${dataGaps.length} data requirement${dataGaps.length === 1 ? '' : 's'} missing who, when or format`);
    const agreed = !!(iv.plan && iv.plan.agreedOn);
    if (!agreed) gaps.push('Not yet agreed with the team');
    const slipped = deliv.filter((d) => d.status !== 'Done' && slip(d));
    const overdue = deliv.filter((d) => d.status !== 'Done' && d.due && d.due < today);
    const dataLate = data.filter((x) => x.status !== 'Received' && x.due && x.due < today);
    const changedSinceAgreed = agreed && [...deliv, ...data].some((x) => (x.addedOn || x.date || '') > iv.plan.agreedOn);
    return { deliv, data, gaps, agreed, slipped, overdue, dataLate, changedSinceAgreed,
      complete: agreed && deliv.length > 0 && !undated.length && data.length > 0 && !dataGaps.length };
  }

  // Recording the plan as agreed fixes each deliverable's agreed date, so later
  // changes show as slippage.
  function agreePlan(iv, withWhom, today) {
    iv.plan = { agreedOn: today, agreedWith: withWhom || '' };
    for (const d of iv.deliverables || []) if (d.due && !d.agreedDue) d.agreedDue = d.due;
    for (const x of iv.dataNeeds || []) if (x.status === 'To agree') x.status = 'Agreed';
  }

  // Move a deliverable's date, keeping its history.
  function moveDue(d, to, reason, today) {
    const from = d.due || null;
    if (from === to) return false;
    d.dueHistory = d.dueHistory || [];
    d.dueHistory.push({ from, to, on: today, reason: reason || '' });
    d.due = to || null;
    return true;
  }

  // A Word document of each intervention's deliverables and data, for agreeing with the team.
  async function planDoc(tracker, strand, today) {
    const d = APP.docx.create();
    const s = tracker.strands.find((x) => x.number === Number(strand));
    const list = tracker.interventions.filter((iv) => iv.strand === Number(strand) && needsPlan(iv));
    d.title(`Strand ${strand}${s ? `: ${s.name}` : ''}. Delivery and data plans`);
    d.note(`Prepared on ${fmt(today)}. Please check each plan, and let us know of any changes, so we can record it as agreed.`);
    d.p('For each intervention, this sets out what will be delivered and by when, and the data needed to evaluate it: what will be collected, by whom, in what format and when. Once agreed, any change to a date is recorded, so we can see where plans have moved and why.');
    for (const iv of list) {
      const c = planCheck(iv, today);
      d.h1(`${iv.id} ${iv.name}`);
      d.p([{ text: 'Plan status: ', bold: true }, c.agreed ? `agreed on ${fmt(iv.plan.agreedOn)}${iv.plan.agreedWith ? ` with ${iv.plan.agreedWith}` : ''}` : 'draft, not yet agreed']);
      d.h2('Deliverables');
      if (c.deliv.length) {
        d.table(['Deliverable', 'Owner', 'Agreed date', 'Current date', 'Status'], c.deliv.map((x) => [
          x.title, x.owner || 'To confirm', x.agreedDue ? fmt(x.agreedDue) : 'Not agreed yet',
          x.due ? `${fmt(x.due)}${slip(x) ? ` (${slip(x).text})` : ''}` : 'To confirm', x.status,
        ]), [3300, 1300, 1400, 1800, 1200]);
      } else d.p('None recorded yet. What will this intervention deliver, and by when?');
      d.h2('Data for the evaluation');
      if (c.data.length) {
        d.table(['Data', 'Why it is needed', 'Who provides it', 'Format', 'When', 'Status'], c.data.map((x) => [
          x.what, x.purpose || 'To confirm', x.owner || 'To confirm', x.format || 'To confirm',
          [x.when, x.due ? `next due ${fmt(x.due)}` : ''].filter(Boolean).join(', ') || 'To confirm', x.status,
        ]), [2000, 2000, 1400, 1200, 1400, 1000]);
      } else d.p('None recorded yet. What data will show whether this intervention is working?');
      if (c.gaps.length) {
        d.p([{ text: 'Still to confirm: ', bold: true }, c.gaps.join('; ') + '.']);
      }
    }
    return d.toBlob();
  }

  APP.plans = { DATA_STATUSES, slip, needsPlan, planCheck, agreePlan, moveDue, planDoc, weeksBetween };
})(typeof window !== 'undefined' ? window : globalThis);
