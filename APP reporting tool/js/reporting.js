// Committee calendar, deadline nudges, the readiness checklist and Outlook reminders.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});
  const NUDGE_DAYS = 28;

  const days = (from, to) => Math.round((Date.parse(to) - Date.parse(from)) / 86400000);

  function committees(tracker) {
    return ((tracker.settings && tracker.settings.committees) || []).slice().sort((a, b) => (a.deadline || a.meeting).localeCompare(b.deadline || b.meeting));
  }

  // The next paper deadline on or after today, and the one before it.
  function cycle(tracker, today) {
    const list = committees(tracker);
    const next = list.find((c) => (c.deadline || c.meeting) >= today) || null;
    const prev = list.filter((c) => (c.meeting || c.deadline) < today).slice(-1)[0] || null;
    return { next, prev, daysLeft: next ? days(today, next.deadline || next.meeting) : null, nudge: next ? days(today, next.deadline || next.meeting) <= NUDGE_DAYS : false };
  }

  // What still needs doing before the next paper. "since" is the last snapshot,
  // or the previous committee, or three months ago.
  function readiness(tracker, today, { lastSnapshot, timeline, papers }) {
    const { model, reports } = APP;
    const cyc = cycle(tracker, today);
    const since = (lastSnapshot && lastSnapshot.date) || (cyc.prev && cyc.prev.meeting) || model.addDays(today, -90);
    const items = [];
    const notes = tracker.notes || [];
    const contacts = tracker.strandContacts || {};

    // Strand leads: summary sent and response back.
    for (const s of tracker.strands) {
      const c = contacts[s.number] || {};
      const sent = c.summarySent && c.summarySent >= since;
      const back = c.responseReceived && c.responseReceived >= (c.summarySent || since);
      items.push({
        group: 'Strand leads', ok: sent && back, strand: s.number,
        text: `Strand ${s.number}: ${s.name}`,
        detail: !sent ? 'Summary not sent yet' : !back ? `Summary sent ${reports.fmt(c.summarySent)}, waiting for a response` : `Summary sent ${reports.fmt(c.summarySent)}, response ${reports.fmt(c.responseReceived)}`,
        sent: c.summarySent, received: c.responseReceived,
      });
    }

    // Anything behind schedule or at risk needs a reason for the committee.
    for (const iv of tracker.interventions) {
      if (model.committeeCategory(iv.status) !== 'Behind schedule / at risk') continue;
      const reason = notes.find((n) => n.interventionId === iv.id && n.type === 'Reason for delay' && n.date >= since);
      items.push({ group: 'Explanations', ok: !!reason, id: iv.id, text: `${iv.id} ${iv.name} is ${iv.status.toLowerCase()}`, detail: reason ? reason.text : 'No reason recorded yet' });
    }

    const successes = notes.filter((n) => n.type === 'Success' && n.date >= since);
    items.push({ group: 'Successes', ok: successes.length > 0, text: `${successes.length} success${successes.length === 1 ? '' : 'es'} recorded since ${reports.fmt(since)}`, detail: successes.length ? '' : 'Worth adding any achievements to report' });

    const draft = tracker.committeeDraft || {};
    const strandNotes = Object.values(draft.strandNotes || {}).filter((x) => x && x.trim()).length;
    items.push({ group: 'Table 2 notes', ok: strandNotes === tracker.strands.length, text: `${strandNotes} of ${tracker.strands.length} strands have Table 2 notes written`, detail: '' });

    if (timeline) {
      const pending = timeline.plan ? timeline.plan.changes.length : 0;
      items.push({ group: 'Timeline spreadsheet', ok: pending === 0, text: pending ? `${pending} intervention${pending === 1 ? '' : 's'} with spreadsheet updates to apply` : 'Spreadsheet matches the tool', detail: '' });
    } else {
      items.push({ group: 'Timeline spreadsheet', ok: false, text: 'Not checked in this session', detail: 'Check it on the Timeline spreadsheet tab' });
    }

    items.push({ group: 'Committee paper', ok: !!(papers && papers.length), text: papers && papers.length ? `Latest paper: ${papers[0].name}` : 'No committee paper found in Committees and reporting', detail: '' });
    return { since, items, cycle: cyc };
  }

  // An .ics file with each paper deadline and meeting, plus reminders, for Outlook.
  function ics(tracker) {
    const stampNow = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
    const d = (iso) => iso.replace(/-/g, '');
    const esc = (s) => String(s).replace(/[,;\\]/g, (c) => '\\' + c);
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//APP reporting tool//EN', 'CALSCALE:GREGORIAN'];
    // One reminder per event (Outlook uses only the first), at 9am the day before.
    const event = (uid, date, title, desc) => {
      lines.push('BEGIN:VEVENT', `UID:${uid}@app-reporting-tool`, `DTSTAMP:${stampNow}`, `DTSTART;VALUE=DATE:${d(date)}`,
        `DTEND;VALUE=DATE:${d(APP.model.addDays(date, 1))}`, `SUMMARY:${esc(title)}`, `DESCRIPTION:${esc(desc)}`, 'TRANSP:TRANSPARENT',
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(title)}`, 'TRIGGER:-PT15H', 'END:VALARM', 'END:VEVENT');
    };
    const add = APP.model.addDays;
    const today = new Date().toISOString().slice(0, 10);
    for (const c of committees(tracker).filter((x) => (x.meeting || x.deadline) >= today)) {
      const name = c.name || 'ESE Committee';
      if (c.deadline) {
        event(`${c.id}-4w`, add(c.deadline, -28), `APP paper for ${name}: 4 weeks to go`, 'Open the APP reporting tool. Send each strand lead their summary from the Progress tab.');
        event(`${c.id}-2w`, add(c.deadline, -14), `APP paper for ${name}: 2 weeks to go`, 'Chase strand lead responses, record them, and write reasons for delay, successes and Table 2 notes on the Reporting tab.');
        event(`${c.id}-3d`, add(c.deadline, -3), `APP paper for ${name}: generate the draft`, 'Update the timeline spreadsheet, then generate the paper from the Reporting tab.');
        event(`${c.id}-deadline`, c.deadline, `APP paper due: ${name}`, 'Submit the APP update.');
      }
      if (c.meeting) event(`${c.id}-meeting`, c.meeting, `${name} meeting`, 'APP update to the committee.');
    }
    lines.push('END:VCALENDAR');
    return lines.join('\r\n');
  }

  APP.reporting = { committees, cycle, readiness, ics, NUDGE_DAYS };
})(typeof window !== 'undefined' ? window : globalThis);
