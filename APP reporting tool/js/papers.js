// The termly ESE paper and the annual report, built from the tracker.
// Sections the tool can't know (narrative, judgement) are left as marked prompts.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  // Status colours: green for on track or ahead, purple for at risk or behind.
  const GREEN = '2F7F7A', PURPLE = '7B3FA0', GREEN_FILL = 'E4F1EF', PURPLE_FILL = 'F1E7F6';

  const els = (n, name) => Array.from(n.getElementsByTagNameNS(W, name));
  const textOf = (n) => els(n, 't').map((t) => t.textContent).join('');
  const clean = (s) => s.replace(/\s+/g, ' ').trim();

  function statusTone(status) {
    if (status === 'On track' || status === 'Ahead of schedule') return 'good';
    if (status === 'At risk' || status === 'Behind schedule') return 'bad';
    return null;
  }
  const statusRun = (status) => {
    const tone = statusTone(status);
    return { text: status || 'Not set', bold: !!tone, color: tone === 'good' ? GREEN : tone === 'bad' ? PURPLE : null };
  };
  const statusCell = (status) => {
    const tone = statusTone(status);
    return { content: [statusRun(status)], fill: tone === 'good' ? GREEN_FILL : tone === 'bad' ? PURPLE_FILL : null };
  };
  // A prompt for something only the author can write.
  const prompt = (text) => ({ text: `[${text}]`, italic: true, color: '8A6D00' });

  const fmt = (iso) => (iso ? new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : '');
  const monthYear = (iso) => new Date(iso + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
  function ordinalDate(iso) {
    const d = new Date(iso + 'T00:00:00Z');
    const n = d.getUTCDate();
    const suf = n % 10 === 1 && n !== 11 ? 'st' : n % 10 === 2 && n !== 12 ? 'nd' : n % 10 === 3 && n !== 13 ? 'rd' : 'th';
    return `${n}${suf} ${d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' })}`;
  }

  // ---------- reading the previous paper ----------

  // Cover sheet, Table 1 (targets) and the Interventions Fund table, if they can be found.
  async function readPreviousPaper(data) {
    const zip = await root.JSZip.loadAsync(data);
    const doc = new DOMParser().parseFromString(await zip.file('word/document.xml').async('string'), 'application/xml');
    const rowsOf = (tbl) => els(tbl, 'tr').map((tr) => Array.from(tr.childNodes).filter((n) => n.localName === 'tc')
      .map((tc) => els(tc, 'p').map((p) => clean(textOf(p))).filter(Boolean)));
    const out = { cover: [], table1: null, fund: null };
    for (const tbl of els(doc, 'tbl')) {
      const rows = rowsOf(tbl);
      const firstRow = rows[0] ? rows[0].map((c) => c.join(' ')).join(' ').toLowerCase() : '';
      const labels = rows.map((r) => (r[0] || []).join(' ').toLowerCase());
      if (!out.cover.length && labels.some((l) => l.startsWith('paper title')) && labels.some((l) => l.startsWith('committee'))) {
        out.cover = rows.map((r) => [(r[0] || []).join(' '), (r[1] || []).join('\n')]);
      } else if (!out.table1 && /baseline/.test(firstRow) && /target/.test(firstRow)) {
        out.table1 = rows;
      } else if (!out.fund && /round\s*\d/.test(firstRow)) {
        out.fund = rows;
      }
    }
    return out;
  }

  // ---------- shared pieces ----------

  function counts(list) {
    const c = Object.fromEntries(APP.model.COMMITTEE_CATEGORIES.map((k) => [k, 0]));
    for (const iv of list) { const k = APP.model.committeeCategory(iv.status); if (k) c[k]++; }
    return c;
  }
  const snapStatus = (snap, id) => snap && snap.interventions[id] ? snap.interventions[id].status : null;

  function coverTable(d, previousCover, overrides) {
    const rows = previousCover.length ? previousCover.map(([k, v]) => [k, v]) : [
      ['Paper title', ''], ['Committee', 'Education and Student Experience Committee'], ['Meeting date', ''],
      ['Purpose', 'To provide assurance'], ['The action required by the Committee', ''], ['Paper Author (s)', ''],
      ['Executive sponsor (s)', ''], ['Date written', ''], ['Sensitivity', 'The content of this paper is not confidential'], ['Can be shared', ''],
    ];
    const set = (label, value) => {
      const row = rows.find(([k]) => k.toLowerCase().startsWith(label.toLowerCase()));
      if (row) row[1] = value; else rows.push([label, value]);
    };
    // Carried-over wording such as "as of July 2026" moves on to this paper's month.
    if (overrides.__period) for (const row of rows) row[1] = String(row[1] || '').replace(/(as (?:of|at) )(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i, `$1${overrides.__period}`);
    for (const [k, v] of Object.entries(overrides)) if (v != null && k !== '__period') set(k, v);
    d.table(null, rows.map(([k, v]) => [{ content: [{ text: k, bold: true }], fill: 'EEF0F6' },
      String(v || '').split('\n').filter(Boolean).map((line) => [line]).concat(v ? [] : [[prompt('Add')]])]), [2800, 6838]);
  }

  function priorities(tracker, from, to) {
    return tracker.interventions.flatMap((iv) => (iv.deliverables || [])
      .filter((x) => x.status !== 'Done' && x.due && x.due >= from && x.due <= to)
      .map((x) => ({ ...x, iv }))).sort((a, b) => a.due.localeCompare(b.due));
  }

  function roadmapAppendix(d, tracker, today) {
    for (const s of tracker.strands) {
      const list = tracker.interventions.filter((iv) => iv.strand === s.number);
      d.h2(`Strand ${s.number}: ${s.name}`);
      d.table(['#', 'Intervention', 'Status', 'Targets', 'Next deliverable'], list.map((iv) => {
        const t = APP.model.TARGETS.map(([k], i) => (iv.targets && iv.targets[k] === 'Y' ? String(i + 1) : iv.targets && iv.targets[k] === 'Partial' ? `(${i + 1})` : null)).filter(Boolean).join(' ');
        const next = (iv.deliverables || []).filter((x) => x.status !== 'Done' && x.due && x.due >= today).sort((a, b) => a.due.localeCompare(b.due))[0];
        return [iv.id, iv.name, statusCell(iv.status), t || '-', next ? `${next.title} (${fmt(next.due)})` : '-'];
      }), [600, 3000, 1500, 1300, 3238]);
    }
    d.note(`Targets: ${APP.model.TARGETS.map(([, l], i) => `${i + 1} ${l}`).join('; ')}. A number in brackets means the intervention partly relates to that target.`);
  }

  function table1(d, previous, prevName) {
    if (previous && previous.table1) {
      const [head, ...rows] = previous.table1;
      d.table(head.map((c) => c.join(' ')), rows.map((r) => r.map((c) => c.map((line) => [line]))));
      d.note(`Carried over from ${prevName}. Update it if the OfS has published new data since.`);
    } else {
      d.p([prompt('Paste Table 1: equity gaps with baseline, the latest years and targets')]);
    }
  }

  // ---------- termly ESE paper ----------

  function termlyPaper({ tracker, today, prevSnapshot, committee, previous, prevName }) {
    const { model, templates } = APP;
    const d = APP.docx.create();
    const since = prevSnapshot ? prevSnapshot.date : null;
    const meeting = committee && committee.meeting;
    const now = counts(tracker.interventions);
    const was = prevSnapshot ? counts(tracker.interventions.map((iv) => ({ status: snapStatus(prevSnapshot, iv.id) }))) : null;
    const notesSince = (type) => (tracker.notes || []).filter((n) => n.type === type && (!since || n.date > since));
    const findIv = (id) => tracker.interventions.find((iv) => iv.id === id) || { id, name: '' };
    const changed = prevSnapshot ? tracker.interventions.filter((iv) => snapStatus(prevSnapshot, iv.id) && snapStatus(prevSnapshot, iv.id) !== iv.status) : [];

    const period = meeting ? monthYear(meeting) : monthYear(today);
    const prevTitle = (previous && previous.cover.find(([k]) => /^paper title/i.test(k)) || [])[1];
    coverTable(d, previous ? previous.cover : [], {
      'Paper title': prevTitle ? prevTitle.replace(/(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}/i, period) : `Access and Participation Planning – ${period} update`,
      'Committee': committee && committee.name && !/^ese committee$/i.test(committee.name) ? committee.name : null,
      'Meeting date': meeting ? ordinalDate(meeting) : null,
      'Date written': ordinalDate(today),
      'Regulatory position': 'Condition A1: no reportable events identified',
      'Consultation': 'APP strand leads; Student Partnership Board',
      __period: period,
    });

    d.h1('1. Executive summary');
    d.p(`This paper provides an update on progress against APP delivery plans${since ? ` since the ${monthYear(since)} update` : ''}.`);
    if (changed.length) for (const iv of changed) {
      const reason = notesSince('Reason for delay').filter((n) => n.interventionId === iv.id).slice(-1)[0];
      d.bullet([{ text: `${iv.id} ${iv.name}: `, bold: true }, 'moved from ', { text: snapStatus(prevSnapshot, iv.id) }, ' to ', statusRun(iv.status), reason ? `. ${reason.text}` : '.']);
    } else d.bullet(prevSnapshot ? 'No intervention has changed status since the last update.' : [prompt('No earlier snapshot: summarise changes since the last paper')]);
    d.p([prompt('Two or three sentences on the overall position, anything the committee should note, and the level of assurance')]);

    d.h1('2. Delivery at a glance');
    d.table(['Status', 'Last update', 'Now', 'Change'], model.COMMITTEE_CATEGORIES.map((k) => {
      const diff = was ? now[k] - was[k] : null;
      const tone = k === 'On track' ? 'good' : k === 'Behind schedule / at risk' ? 'bad' : null;
      return [{ content: [{ text: k, bold: true, color: tone === 'good' ? GREEN : tone === 'bad' ? PURPLE : null }] }, was ? String(was[k]) : '-', String(now[k]),
        diff == null ? '-' : diff === 0 ? 'No change' : `${diff > 0 ? '▲' : '▼'} ${Math.abs(diff)}`];
    }), [3600, 1800, 1800, 2438]);
    d.table(['Strand', 'Interventions', 'On track or ahead', 'At risk or behind', 'To be mapped', 'BAU'], tracker.strands.map((s) => {
      const c = counts(tracker.interventions.filter((iv) => iv.strand === s.number));
      const bad = c['Behind schedule / at risk'];
      return [`Strand ${s.number}: ${s.name}`, String(Object.values(c).reduce((a, b) => a + b, 0)),
        { content: [{ text: String(c['On track']), color: GREEN, bold: true }] },
        bad ? { content: [{ text: String(bad), color: PURPLE, bold: true }], fill: PURPLE_FILL } : '0',
        String(c['To be mapped']), String(c['BAU'])];
    }), [3000, 1300, 1400, 1400, 1300, 1238]);

    d.h1('3. Exceptions');
    const exceptions = tracker.interventions.filter((iv) => statusTone(iv.status) === 'bad' || changed.includes(iv));
    if (!exceptions.length) d.p('There are no interventions at risk or behind schedule, and none has changed status since the last update.');
    for (const iv of exceptions) {
      const notes = (tracker.notes || []).filter((n) => n.interventionId === iv.id);
      const latest = notes.filter((n) => n.type === 'Update').slice(-1)[0];
      const reason = notes.filter((n) => n.type === 'Reason for delay').slice(-1)[0];
      const next = (iv.deliverables || []).filter((x) => x.status !== 'Done').sort((a, b) => (a.due || '9').localeCompare(b.due || '9'))[0];
      d.h2(`${iv.id} ${iv.name}`);
      d.bullet([{ text: 'Status: ', bold: true }, prevSnapshot && snapStatus(prevSnapshot, iv.id) !== iv.status ? `${snapStatus(prevSnapshot, iv.id) || 'new'} to ` : '', statusRun(iv.status)]);
      d.bullet([{ text: 'What is happening: ', bold: true }, latest ? latest.text : prompt('Add')]);
      if (statusTone(iv.status) === 'bad') d.bullet([{ text: 'Why: ', bold: true }, reason ? reason.text : prompt('Add the reason')]);
      d.bullet([{ text: 'Next step: ', bold: true }, next ? `${next.title}${next.owner ? ` (${next.owner}` : ''}${next.due ? `${next.owner ? ', ' : ' ('}by ${fmt(next.due)})` : next.owner ? ')' : ''}` : prompt('Add')]);
      if (statusTone(iv.status) === 'bad') d.bullet([{ text: 'Expected back on track: ', bold: true }, prompt('Add a date')]);
    }
    d.p('All other interventions remain on track, are still being mapped, or are now business as usual. The full delivery roadmap is in Appendix A.');

    d.h1('4. Changes to the plan');
    const scope = notesSince('Scope change');
    if (scope.length) d.table(['#', 'Intervention', 'Change', 'Recorded'], scope.map((n) => [n.interventionId, findIv(n.interventionId).name, n.text, fmt(n.date)]), [600, 2600, 4800, 1638]);
    else d.p('No changes to the scope of interventions have been recorded since the last update.');

    d.h1('5. Theory of change and evaluation');
    const assessed = tracker.interventions.map((iv) => ({ iv, a: templates.assess(iv) }));
    const inScope = assessed.filter((x) => ['complete', 'partial', 'missing'].includes(x.a.state));
    const nState = (st) => inScope.filter((x) => x.a.state === st).length;
    const verb = (n, one, many) => `${n} ${n === 1 ? one : many}`;
    d.p(`Of the ${inScope.length} non-BAU interventions in strands 1 to 6, ${verb(nState('complete'), 'has', 'have')} a complete theory of change and evaluation plan, ${verb(nState('partial'), 'is', 'are')} partly written and ${verb(nState('missing'), 'does', 'do')} not yet have a project template.`);
    const reportsDue = tracker.interventions.filter((iv) => iv.template && iv.template.timeframes && iv.template.timeframes.reportPublication)
      .map((iv) => ({ iv, date: iv.template.timeframes.reportPublication, done: /stage\s*8/i.test(iv.template.stage || '') }))
      .filter((x) => !x.done && x.date <= APP.model.addDays(today, 365)).sort((a, b) => a.date.localeCompare(b.date));
    if (reportsDue.length) {
      d.p('Evaluation reports due in the next twelve months:');
      d.table(['#', 'Intervention', 'Report due', 'Status'], reportsDue.map((x) => [x.iv.id, x.iv.name, fmt(x.date),
        x.date < today ? { content: [{ text: 'Overdue', bold: true, color: PURPLE }], fill: PURPLE_FILL } : 'Due']), [600, 4600, 2200, 2238]);
    } else d.p('No evaluation reports are due in the next twelve months, based on the dates in the project templates.');

    d.h1('6. Successes and impact');
    const wins = notesSince('Success');
    if (wins.length) for (const n of wins) d.bullet([{ text: `${n.interventionId} ${findIv(n.interventionId).name}: `, bold: true }, n.text]);
    else d.p([prompt('Add two or three highlights, with a number or a quote where possible')]);

    d.h1('7. Progress against targets');
    table1(d, previous, prevName);
    d.p([prompt('If there is new data: for each target, say whether it was met or missed and by how much, and your judgement on the trend. If not: say when the next OfS data is expected')]);

    d.h1('8. Sector and regulatory context');
    d.p([prompt('Only if something has changed since the last update; otherwise delete this section')]);

    d.h1('9. APP Interventions Fund');
    d.p([prompt('Brief update on funding rounds and funded projects')]);
    if (previous && previous.fund) d.p('The table of funded projects is in Appendix B.');

    d.h1('10. Priorities for next term');
    const until = committee && committee.nextMeeting ? committee.nextMeeting : APP.model.addDays(today, 120);
    const pri = priorities(tracker, today, until).filter((x) => x.kind === 'deliverable');
    if (pri.length) {
      d.note('Drafted from deliverables due before the next update. Edit to the three to five that matter most.');
      pri.slice(0, 12).forEach((x) => d.bullet([{ text: `${x.iv.id}: `, bold: true }, `${x.title} (${x.owner || 'owner to confirm'}, by ${fmt(x.due)})`]));
    } else d.p([prompt('List three to five priorities for next term')]);

    d.h1('11. Action');
    d.p('The Committee is asked to take assurance on the delivery of the University’s Access and Participation Plan, noting the progress and exceptions set out in this paper.');

    d.pageBreak();
    d.h1('Appendix A: Delivery roadmap');
    roadmapAppendix(d, tracker, today);
    if (previous && previous.fund) {
      d.h1('Appendix B: APP Interventions Fund projects');
      const [head, ...rows] = previous.fund;
      d.table(head.map((c) => c.join(' ')), rows.map((r) => r.map((c) => c.map((line) => [line]))));
      d.note(`Carried over from ${prevName}. Add any projects funded since.`);
    }
    return d.toBlob();
  }

  // ---------- annual report ----------

  async function annualReport({ tracker, today, yearSnapshot, previous, prevName, annual, committee }) {
    const { model, templates } = APP;
    const d = APP.docx.create();
    const since = yearSnapshot ? yearSnapshot.date : APP.model.addDays(today, -365);
    const findIv = (id) => tracker.interventions.find((iv) => iv.id === id) || { id, name: '' };
    const notesYear = (type) => (tracker.notes || []).filter((n) => n.type === type && n.date > since);
    const now = counts(tracker.interventions);

    coverTable(d, previous ? previous.cover : [], {
      'Paper title': `Access and Participation Plan: annual report ${today.slice(0, 4)}`,
      'Committee': committee && committee.name ? committee.name : null,
      'Meeting date': committee && committee.meeting ? ordinalDate(committee.meeting) : null,
      'Date written': ordinalDate(today),
      'Regulatory position': 'Condition A1: no reportable events identified',
      'Consultation': 'APP strand leads; Student Partnership Board',
    });

    d.h1('1. Executive summary');
    d.p([prompt('The year in three or four sentences: headline results against targets, delivery, and what matters most next year')]);
    const ivScope = tracker.interventions.map((iv) => templates.assess(iv).state).filter((s) => ['complete', 'partial', 'missing'].includes(s));
    const are = (n) => `${n} ${n === 1 ? 'is' : 'are'}`;
    const done = ivScope.filter((s) => s === 'complete').length, wins = notesYear('Success').length;
    d.bullet(`${now['On track']} of ${tracker.interventions.length} interventions ${now['On track'] === 1 ? 'is' : 'are'} on track or ahead, ${are(now['BAU'])} business as usual, ${are(now['To be mapped'])} still being mapped and ${are(now['Behind schedule / at risk'])} at risk or behind.`);
    d.bullet(`${done} of ${ivScope.length} non-BAU interventions in strands 1 to 6 ${done === 1 ? 'has' : 'have'} a complete theory of change and evaluation plan.`);
    d.bullet(`${wins} ${wins === 1 ? 'success was' : 'successes were'} recorded during the year.`);

    d.h1('2. Delivery over the year');
    if (yearSnapshot) {
      const was = counts(tracker.interventions.map((iv) => ({ status: snapStatus(yearSnapshot, iv.id) })));
      d.table(['Status', fmt(yearSnapshot.date), 'Now'], model.COMMITTEE_CATEGORIES.map((k) => [k, String(was[k]), String(now[k])]), [4000, 2800, 2838]);
      const moved = tracker.interventions.filter((iv) => snapStatus(yearSnapshot, iv.id) && snapStatus(yearSnapshot, iv.id) !== iv.status);
      if (moved.length) d.table(['#', 'Intervention', 'Status change'], moved.map((iv) => [iv.id, iv.name, [{ text: `${snapStatus(yearSnapshot, iv.id)} to ` }, statusRun(iv.status)]]), [600, 5000, 4038]);
    } else {
      d.table(['Status', 'Now'], model.COMMITTEE_CATEGORIES.map((k) => [k, String(now[k])]), [6000, 3638]);
      d.note('There is no snapshot from a year ago yet, so changes over the year are not shown.');
    }
    d.p([prompt('What moved forward this year, and what did not')]);

    d.h1('3. Progress against targets');
    table1(d, previous, prevName);
    d.p([prompt('For each target: met or missed, by how much, the trend, and your judgement of the risk')]);

    d.h1('4. Targets by faculty');
    const gaps = annual && annual.facultyGaps;
    if (gaps && gaps.length) {
      d.p('Each chart shows the gap for each faculty, with the University gap marked by the black line. Arrows show the change since last year: purple where the gap has widened, green where it has narrowed.');
      const byTarget = new Map();
      for (const r of gaps) (byTarget.get(r.target) || byTarget.set(r.target, []).get(r.target)).push(r);
      for (const [target, rows] of byTarget) {
        const uni = rows.find((r) => /^university|^institution|^mdx|^all/i.test(r.faculty));
        const faculties = rows.filter((r) => r !== uni && r.gap != null);
        if (!faculties.length) continue;
        d.h2(target);
        const png = await APP.annualData.gapChart(faculties, uni ? uni.gap : null);
        if (png) d.image(png.bytes, png.width, png.height, `${target}: gap by faculty${uni && uni.gap != null ? `, University gap ${uni.gap}pp` : ''}`);
        const widest = faculties.slice().sort((a, b) => b.gap - a.gap);
        const narrowed = faculties.filter((r) => r.last != null && r.gap < r.last).length;
        const widened = faculties.filter((r) => r.last != null && r.gap > r.last).length;
        d.p(`${uni && uni.gap != null ? `The University gap is ${uni.gap}pp${uni.last != null ? ` (${uni.last}pp last year)` : ''}. ` : ''}The widest gap is in ${widest[0].faculty} (${widest[0].gap}pp)${widest[1] ? `, followed by ${widest[1].faculty} (${widest[1].gap}pp)` : ''}. Since last year the gap has narrowed in ${narrowed} ${narrowed === 1 ? 'faculty' : 'faculties'} and widened in ${widened}.`);
        d.table(['Faculty', 'Gap this year (pp)', 'Last year (pp)', 'Change', 'Students in group'], rows.map((r) => {
          const ch = r.gap != null && r.last != null ? Math.round((r.gap - r.last) * 10) / 10 : null;
          return [r.faculty, r.gap == null ? '-' : String(r.gap), r.last == null ? '-' : String(r.last),
            ch == null ? '-' : { content: [{ text: `${ch > 0 ? '▲' : ch < 0 ? '▼' : ''} ${Math.abs(ch)}`, color: ch > 0 ? PURPLE : GREEN, bold: true }] },
            r.population == null ? '-' : String(r.population)];
        }), [3000, 1700, 1600, 1400, 1938]);
        d.p([prompt(`What is driving the gap for ${target}, and what faculties are doing about it`)]);
      }
    } else {
      d.p([prompt('Fill in the "Faculty gaps" sheet of the annual report data spreadsheet, then create the report again to add charts here')]);
    }

    d.h1('5. Other gaps to monitor');
    const watch = annual && annual.watchList;
    if (watch && watch.length) {
      d.p('Gaps outside the current APP targets that may need action, or could become targets in the next plan.');
      d.table(['Measure', 'Groups compared', 'This year (pp)', 'Last year (pp)', 'Change', 'Notes'], watch.map((r) => {
        const ch = r.gap != null && r.last != null ? Math.round((r.gap - r.last) * 10) / 10 : null;
        return [r.measure, r.groups, r.gap == null ? '-' : String(r.gap), r.last == null ? '-' : String(r.last),
          ch == null ? '-' : { content: [{ text: `${ch > 0 ? '▲' : ch < 0 ? '▼' : ''} ${Math.abs(ch)}`, color: ch > 0 ? PURPLE : GREEN, bold: true }] }, r.note || ''];
      }), [1700, 2200, 1100, 1100, 900, 2638]);
      d.p([prompt('Which of these should the University watch closely, and why')]);
    } else d.p([prompt('Fill in the "Gaps to monitor" sheet of the annual report data spreadsheet')]);

    d.h1('6. Evaluation findings and impact');
    const completed = tracker.interventions.filter((iv) => iv.template && (/stage\s*8/i.test(iv.template.stage || '')
      || (iv.template.timeframes && iv.template.timeframes.evaluation && iv.template.timeframes.evaluation.end && iv.template.timeframes.evaluation.end <= today)));
    if (completed.length) {
      d.p('Interventions whose evaluation has finished:');
      for (const iv of completed) {
        d.h2(`${iv.id} ${iv.name}`);
        d.bullet([{ text: 'What was evaluated: ', bold: true }, iv.template.evaluation && iv.template.evaluation.researchQuestions ? iv.template.evaluation.researchQuestions : prompt('Research questions')]);
        d.bullet([{ text: 'Key findings: ', bold: true }, prompt('Add')]);
        d.bullet([{ text: 'What changes as a result: ', bold: true }, prompt('Add')]);
      }
    } else d.p([prompt('No evaluations are recorded as finished yet. Summarise any interim findings here')]);
    const yearWins = notesYear('Success');
    if (yearWins.length) {
      d.h2('Successes during the year');
      for (const n of yearWins) d.bullet([{ text: `${n.interventionId} ${findIv(n.interventionId).name}: `, bold: true }, n.text]);
    }

    d.h1('7. Expenditure against the plan');
    const spend = annual && annual.expenditure;
    if (spend && spend.length) {
      const money = (v) => (v == null ? '-' : `£${Math.round(v).toLocaleString('en-GB')}`);
      let tp = 0, ta = 0;
      const rows = spend.map((r) => {
        tp += r.planned || 0; ta += r.actual || 0;
        const v = r.planned != null && r.actual != null ? r.actual - r.planned : null;
        return [r.area, money(r.planned), money(r.actual), v == null ? '-' : { content: [{ text: `${v >= 0 ? '+' : '-'}${money(Math.abs(v))}`, color: v < 0 ? PURPLE : null }] }, r.note || ''];
      });
      rows.push([{ content: [{ text: 'Total', bold: true }] }, { content: [{ text: money(tp), bold: true }] }, { content: [{ text: money(ta), bold: true }] },
        { content: [{ text: `${ta - tp >= 0 ? '+' : '-'}${money(Math.abs(ta - tp))}`, bold: true, color: ta < tp ? PURPLE : null }] }, '']);
      d.table(['Area', 'Planned', 'Actual', 'Difference', 'Notes'], rows, [2600, 1500, 1500, 1500, 2538]);
      d.p([prompt('Explain any significant difference from the plan')]);
    } else d.p([prompt('Fill in the "Expenditure" sheet of the annual report data spreadsheet')]);

    d.h1('8. Priorities for next year');
    const pri = priorities(tracker, today, APP.model.addDays(today, 365)).filter((x) => x.kind === 'deliverable');
    d.p([prompt('Three to five priorities for next year')]);
    if (pri.length) {
      d.note(`For reference, ${pri.length} deliverables are due in the next twelve months:`);
      for (const s of tracker.strands) {
        const n = pri.filter((x) => x.iv.strand === s.number).length;
        if (n) d.bullet(`Strand ${s.number}: ${s.name}: ${n}`);
      }
    }

    d.pageBreak();
    d.h1('Appendix: Delivery roadmap');
    roadmapAppendix(d, tracker, today);
    return d.toBlob();
  }

  APP.papers = { readPreviousPaper, termlyPaper, annualReport, statusTone, GREEN, PURPLE };
})(typeof window !== 'undefined' ? window : globalThis);
