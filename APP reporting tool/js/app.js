// Page logic: folder connection, strand view, template audit and tracker import.
(function () {
  const { model, folder, templates, trackerImport, meetingUpdate, reports, timelineCheck, docx, xlsxWrite, papers, annualData, reporting, plans, fund } = window.APPTool;
  const $ = (sel) => document.querySelector(sel);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

  const params = new URLSearchParams(location.search);
  const TODAY = /^\d{4}-\d{2}-\d{2}$/.test(params.get('today') || '') ? params.get('today') : new Date().toLocaleDateString('en-CA');

  const state = {
    conn: null,        // { root, projects }
    remembered: null,  // a stored handle awaiting permission
    tracker: null,
    audit: null,
    pendingImport: null,
    pendingUpdate: null,
    pasteOpen: false,  // Updates: the paste box is open
    meetingText: '',
    showDone: false,
    yourName: 'David',
    lastSnapshot: null,
    timelineFiles: [],
    timeline: null,
    papers: [],
    annualFile: null,
    tab: 'progress',
    sub: 'summary',    // Progress sub-page: summary, strands, reporting or timeline
    cat: null,         // Progress summary filter: { cat, strand }
    ivPage: null,      // intervention shown on its own page
    fundDir: null,     // the APP Interventions Fund folder, once connected
    fundRemembered: null,
    fundCheck: null,   // result of the last read of the Fund documents
    editing: null,     // the deliverable or data row open for editing, as "ivId|itemId"
    strand: 'all',
    nonBauOnly: true,
    message: null,
  };

  try {
    const s = localStorage.getItem('app-tool-strand');
    if (s) state.strand = s;
  } catch { /* storage unavailable */ }

  function setStrand(s) {
    state.strand = s;
    try { localStorage.setItem('app-tool-strand', s); } catch { /* ignore */ }
    render();
  }

  function flash(kind, text) {
    state.message = { kind, text };
    render();
  }

  // Save the tracker after an edit made on the page.
  async function persist(okText) {
    try {
      await folder.saveTracker(state.conn.projects, state.tracker);
      state.message = okText ? { kind: 'ok', text: okText } : null;
    } catch (e) {
      state.message = { kind: 'error', text: `Couldn't save: ${e.message}` };
    }
    render();
  }

  // Interventions and Fund projects share one ID space: Fund project IDs start with F.
  const findIv = (id) => state.tracker.interventions.find((x) => x.id === id) || (state.tracker.fundProjects || []).find((x) => x.id === id);
  const isFund = (iv) => !!(iv && iv.round);

  const fmtDate = (iso) => {
    if (!iso) return '';
    const d = new Date(iso + 'T00:00:00Z');
    return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const strandName = (n) => {
    const s = state.tracker && state.tracker.strands.find((x) => x.number === Number(n));
    return s ? s.name : model.STRANDS[n] || '';
  };

  // ---------- folder ----------

  async function connect() {
    try {
      state.conn = await folder.choose();
      await afterConnect();
    } catch (e) {
      if (e.name !== 'AbortError') flash('error', e.message);
    }
  }

  async function reconnect() {
    try {
      state.conn = await folder.reconnect(state.remembered);
      await afterConnect();
    } catch (e) {
      flash('error', e.message);
    }
  }

  async function afterConnect() {
    state.remembered = null;
    try {
      state.tracker = await folder.loadTracker(state.conn.projects);
    } catch (e) {
      state.tracker = null;
      flash('error', `The tracker file couldn't be read: ${e.message}`);
      return;
    }
    if (!state.tracker) { state.tab = 'progress'; state.sub = 'timeline'; }
    state.message = null;
    try { state.timelineFiles = await folder.findTimelineFile(state.conn); } catch { state.timelineFiles = []; }
    try { state.papers = (await folder.committeePapers(state.conn)).papers; } catch { state.papers = []; }
    try { state.annualFile = await folder.dataFileInfo(state.conn.projects, annualData.FILE); } catch { state.annualFile = null; }
    if (state.tracker) {
      state.yourName = (state.tracker.settings && state.tracker.settings.yourName) || state.yourName;
      try { state.lastSnapshot = await folder.latestSnapshot(state.conn.projects); } catch { state.lastSnapshot = null; }
    }
    render();
    if (state.tracker) {
      const removed = plans.mergeDuplicateData(state.tracker);
      if (removed) {
        try {
          await folder.saveTracker(state.conn.projects, state.tracker, { backup: true });
          state.message = { kind: 'ok', text: `Merged ${removed} duplicate data requirement${removed === 1 ? '' : 's'}. The previous tracker is in the backups folder.` };
          render();
        } catch (e) { state.message = { kind: 'error', text: `Couldn't save after merging duplicates: ${e.message}` }; }
      }
      runAudit({ quiet: true });
      connectFund({ quiet: true });
    }
  }

  // ---------- Interventions Fund ----------

  // quiet: reconnect a remembered folder without asking; otherwise ask to choose one.
  async function connectFund({ quiet = false, pick = false } = {}) {
    try {
      if (pick) state.fundDir = await folder.chooseFund();
      else {
        const h = state.fundRemembered || await folder.rememberedFund();
        if (!h) return;
        try { state.fundDir = await folder.reconnectFund(h, !quiet); }
        catch (e) { state.fundRemembered = h; if (!quiet) throw e; render(); return; }
      }
      state.fundRemembered = null;
      await readFund({ quiet });
    } catch (e) {
      if (e.name !== 'AbortError') flash('error', e.message);
    }
  }

  async function readFund({ quiet = false } = {}) {
    try {
      const r = await fund.sync(state.tracker, state.fundDir, new Date().toISOString());
      state.fundCheck = { ...r, at: TODAY };
      await folder.saveTracker(state.conn.projects, state.tracker);
      if (quiet) render();
      else flash(r.errors.length ? 'error' : 'ok', `Read ${r.read} of ${r.docs} project document${r.docs === 1 ? '' : 's'}${r.added ? `, and added ${r.added} new project${r.added === 1 ? '' : 's'}` : ''}.${r.errors.length ? ` Couldn't read: ${r.errors.join('; ')}` : ''}`);
    } catch (e) {
      flash('error', `Couldn't read the Fund folder: ${e.message}`);
    }
  }

  function renderFundTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    if (state.ivPage && findIv(state.ivPage)) return renderInterventionPage(findIv(state.ivPage));
    const list = state.tracker.fundProjects || [];
    const connect = state.fundDir
      ? `<p class="small muted">Connected to <strong>${esc(state.fundDir.name)}</strong>${state.fundCheck ? `. ${state.fundCheck.docs} project document${state.fundCheck.docs === 1 ? '' : 's'} found.` : '.'}
          <button class="quiet small-btn" id="read-fund">Check documents again</button> <button class="link small" id="pick-fund">Change folder</button></p>`
      : `<section class="panel intro"><h3>Connect the Fund folder</h3>
          <p class="small">Choose the <strong>APP Interventions Fund</strong> folder in OneDrive (in APP 2025-29 monitoring). The tool reads the project documents in each round's planning folder, such as "Project planning documents" or "Round 2 Project documents - Theories of Change", and adds a project for each one.</p>
          ${state.fundRemembered ? `<button class="primary" id="reconnect-fund">Reconnect to ${esc(state.fundRemembered.name)}</button> ` : ''}<button class="${state.fundRemembered ? 'quiet' : 'primary'}" id="pick-fund">Choose folder</button></section>`;
    const rows = fund.rounds(state.tracker).map(({ round, label }) => {
      const items = list.filter((p) => p.round === round).map((p) => {
        const cat = model.progressCategory(p, TODAY);
        const c = plans.planCheck(p, TODAY);
        const next = (p.deliverables || []).filter((d) => d.status !== 'Done').sort((a, b) => (b.kind === 'action') - (a.kind === 'action') || (a.due || '9999').localeCompare(b.due || '9999'))[0];
        const { periods } = model.plannedPeriods(p);
        const span = periods.length ? `${fmtDate(periods[0].start)} to ${fmtDate(periods[periods.length - 1].end)}` : '';
        return `<tr><td class="nowrap"><span class="id">${esc(p.id)}</span></td>
          <td><button class="link" data-iv="${esc(p.id)}">${esc(p.name)}</button>${p.lead || (p.template && p.template.lead) ? `<div class="muted small">${esc(p.lead || p.template.lead)}</div>` : ''}</td>
          <td>${statusPill(p.status)}</td><td>${catPill(cat)}</td>
          <td class="small">${span || '<span class="muted">No dates</span>'}</td>
          <td>${c.agreed ? '<span class="small">Agreed</span>' : '<span class="small muted">Not yet agreed</span>'}</td>
          <td>${next ? `${esc(next.title)}<div class="muted small">${next.due ? `<span class="${dueClass(next)}">${fmtDate(next.due)}</span>` : 'No date'}</div>` : '<span class="muted small">None</span>'}</td></tr>`;
      }).join('');
      return `<h3 class="section">${esc(label)}</h3>
        <div class="table-wrap"><table class="grid">
          <thead><tr><th>#</th><th>Project and lead</th><th>Status</th><th>Progress</th><th>Timeframe</th><th>Plan</th><th>Next due</th></tr></thead>
          <tbody>${items}</tbody></table></div>`;
    }).join('');
    const roundOpts = [...new Set([...fund.rounds(state.tracker).map((r) => r.round), 1, 2, 3])].sort().map((n) => `<option value="${n}">Round ${n}</option>`).join('');
    return `<h2>Fund projects</h2>
      <p class="muted intro">Projects funded through the APP Interventions Fund. Each opens a page like an intervention's: status, timeframes from its project document, deliverables and actions, data requirements and notes.</p>
      ${connect}
      ${rows || (state.fundDir ? '<p class="muted">No project documents found yet.</p>' : '')}
      <details class="record"><summary>Add a project without a document yet</summary>
        <div class="record-form" id="fund-add">
          <label>Round <select name="round">${roundOpts}</select></label>
          <label class="grow">Project <input name="name" type="text" autocomplete="off"></label>
          <label>Lead <input name="lead" type="text" size="14" autocomplete="off"></label>
          <button class="quiet" id="add-fund">Add</button>
        </div>
        <p class="small muted">If its document is saved later with the same name, the tool links the two.</p></details>`;
  }

  // ---------- import ----------

  async function onImportFile(file) {
    try {
      const parsed = await trackerImport.parseTracker(await file.arrayBuffer());
      const merged = trackerImport.mergeImport(state.tracker, parsed, file.name, new Date().toISOString());
      state.pendingImport = { fileName: file.name, parsed, ...merged };
      state.message = null;
    } catch (e) {
      state.pendingImport = null;
      state.message = { kind: 'error', text: `That file couldn't be read: ${e.message}` };
    }
    render();
  }

  async function saveImport() {
    try {
      await folder.saveTracker(state.conn.projects, state.pendingImport.tracker, { backup: true });
      state.tracker = state.pendingImport.tracker;
      state.pendingImport = null;
      state.tab = 'progress';
      flash('ok', `Saved to ${folder.PROJECTS}/${folder.DATA}/${folder.TRACKER}.`);
      await runAudit({ quiet: true });
    } catch (e) {
      flash('error', `Couldn't save: ${e.message}`);
    }
  }

  // ---------- audit ----------

  // Reads every project template. Runs quietly each time the folder is opened,
  // so the theory of change and progress views are always current.
  async function runAudit({ quiet = false } = {}) {
    if (!quiet) flash('info', 'Checking templates…');
    try {
      const audit = await templates.auditTemplates(state.conn.projects, state.tracker, new Date().toISOString());
      state.audit = audit;
      // The template owns these fields; the tracker keeps a copy for the other views.
      const strip = (t) => (t ? JSON.stringify({ ...t, checkedAt: null }) : null);
      let changed = !state.tracker.templatesCheckedAt;
      for (const r of audit.results) {
        const iv = findIv(r.id);
        if (!iv || r.error) continue;
        if (strip(iv.template) !== strip(r.template)) changed = true;
        iv.template = r.template;
      }
      if (changed || !quiet) {
        state.tracker.templatesCheckedAt = new Date().toISOString();
        await folder.saveTracker(state.conn.projects, state.tracker);
      }
      if (quiet) render();
      else flash('ok', `Checked ${audit.fileCount} template file${audit.fileCount === 1 ? '' : 's'} and updated the tracker.`);
    } catch (e) {
      flash('error', `The template check didn't finish: ${e.message}`);
    }
  }

  // ---------- rendering ----------

  function statusPill(status) {
    const cat = model.committeeCategory(status);
    const cls = status === 'Completed' ? 'ok' : { 'BAU': 'bau', 'On track': 'ok', 'To be mapped': 'map', 'Behind schedule / at risk': 'risk' }[cat] || 'map';
    return `<span class="pill ${cls}">${esc(status || 'No status')}</span>`;
  }

  function flagPill(check) {
    const cls = { behind: 'risk', soon: 'warn', ok: 'ok', unknown: 'map', bau: 'bau' }[check.flag];
    const label = { behind: 'Behind plan', soon: 'Due soon', ok: 'In line', unknown: "Can't check", bau: 'BAU' }[check.flag];
    return `<span class="pill ${cls}" title="${esc(check.text)}">${label}</span>`;
  }

  function countsFor(list) {
    const c = Object.fromEntries(model.COMMITTEE_CATEGORIES.map((k) => [k, 0]));
    for (const iv of list) {
      const k = model.committeeCategory(iv.status);
      if (k) c[k]++;
    }
    return c;
  }

  function strandTabs() {
    const nums = state.tracker.strands.map((s) => String(s.number));
    return `<div class="seg" role="tablist" aria-label="Strand">
      <button class="${state.strand === 'all' ? 'on' : ''}" data-strand="all">All</button>
      ${nums.map((n) => `<button class="${state.strand === n ? 'on' : ''}" data-strand="${n}" title="${esc(strandName(n))}">${n}</button>`).join('')}
    </div>`;
  }

  function periodsText(iv) {
    const { source, periods } = model.plannedPeriods(iv);
    if (!periods.length) return '<span class="muted">No planned dates</span>';
    const src = source === 'template' ? 'project template' : 'tracker timeline';
    return `<ul class="periods">${periods.map((p) => {
      const now = TODAY >= p.start && TODAY <= p.end;
      return `<li class="${now ? 'now' : ''}"><span>${esc(p.stage)}${p.activity ? ` <span class="muted">(${esc(p.activity)})</span>` : ''}</span> <span class="muted">${fmtDate(p.start)} to ${fmtDate(p.end)}</span></li>`;
    }).join('')}</ul><div class="muted small">Dates from the ${src}</div>`;
  }

  function templateText(iv) {
    if (iv.status === 'BAU') return '<span class="muted">Not needed for BAU</span>';
    if (!iv.template) return state.tracker.templatesCheckedAt ? '<span class="hot">No template found</span>' : '<span class="muted">Not checked yet</span>';
    const c = templates.completeness(iv.template);
    return `${c.done} of 3 sections complete${iv.template.stage ? `<br><span class="muted">${esc(iv.template.stage)}</span>` : ''}`;
  }

  function dueClass(d) {
    if (d.status === 'Done' || !d.due) return '';
    if (d.due < TODAY) return 'hot';
    if (d.due <= model.addDays(TODAY, 14)) return 'due-soon';
    return '';
  }

  function notesBlock(iv) {
    const notes = (state.tracker.notes || []).filter((n) => n.interventionId === iv.id)
      .sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    if (!notes.length) return '<p class="muted small">No notes yet.</p>';
    const item = (n) => `<li><span class="muted small">${fmtDate(n.date)}</span> <span class="chip ${n.type === 'Risk' ? 'risk' : n.type === 'Question' ? 'warn' : ''}">${esc(n.type)}</span> ${esc(n.text)}</li>`;
    return `<ul class="notes">${notes.slice(0, 4).map(item).join('')}</ul>
      ${notes.length > 4 ? `<details><summary class="small">${notes.length - 4} older</summary><ul class="notes">${notes.slice(4).map(item).join('')}</ul></details>` : ''}`;
  }

  function templateUpdatesBlock(iv) {
    const open = (state.tracker.templateUpdates || []).filter((u) => u.interventionId === iv.id && !u.done);
    if (!open.length) return '';
    return `<div class="tu-block"><h4>Project template changes to make (${open.length})</h4><ul class="tu">${open.map((u) => `<li>
        <label><input type="checkbox" data-tu="${esc(u.id)}"> <strong>${esc(u.section)}:</strong> ${esc(u.text)}</label></li>`).join('')}</ul></div>`;
  }

  // ---------- delivery and data plans ----------

  function slipText(d) {
    const sl = plans.slip(d);
    return sl ? `<div class="small hot">${esc(sl.text)}</div>` : '';
  }

  function historyText(d) {
    const h = (d.dueHistory || []).filter((x) => x.from);
    if (!h.length) return '';
    return `<details class="small"><summary class="muted">${h.length} date change${h.length === 1 ? '' : 's'}</summary><ul class="notes">${h.map((x) => `<li>${fmtDate(x.on)}: ${fmtDate(x.from)} to ${x.to ? fmtDate(x.to) : 'no date'}${x.reason ? `. ${esc(x.reason)}` : ''}</li>`).join('')}</ul></details>`;
  }

  async function savePlans(ivId) {
    try {
      const iv = ivId ? findIv(ivId) : null;
      const n = iv ? iv.strand : state.strand;
      const name = iv ? `${iv.id} delivery and data plan - ${TODAY}.docx` : `Strand ${n} delivery and data plans - ${TODAY}.docx`;
      const path = await folder.saveReport(state.conn, name, await plans.planDoc(state.tracker, n, TODAY, ivId));
      flash('ok', `Saved to ${path}. Send it to the strand lead, then record each plan as agreed.`);
    } catch (e) {
      flash('error', `Couldn't save: ${e.message}`);
    }
  }

  // Tables for pasting into an email: HTML for Outlook, with plain text as a fallback.
  function copyTables(iv, which) {
    const cellCss = 'border:1px solid #bfbfbf;padding:4px 8px;text-align:left;vertical-align:top;font-family:Arial,sans-serif;font-size:10pt';
    const table = (head, rows) => `<table style="border-collapse:collapse">
      <tr>${head.map((h) => `<th style="${cellCss};background:#2e2654;color:#ffffff">${esc(h)}</th>`).join('')}</tr>
      ${rows.map((r) => `<tr>${r.map((c) => `<td style="${cellCss}">${esc(c)}</td>`).join('')}</tr>`).join('')}</table>`;
    const text = (head, rows) => [head, ...rows].map((r) => r.join('\t')).join('\n');
    const items = (iv.deliverables || []).filter((d) => d.status !== 'Done')
      .sort((a, b) => (b.kind === 'action') - (a.kind === 'action') || (a.due || '9999').localeCompare(b.due || '9999'));
    const dHead = ['Type', 'Deliverable or action', 'Owner', 'Due', 'Status'];
    const dRows = items.map((d) => [d.kind === 'action' ? 'Action' : 'Deliverable', d.title, d.owner || 'To confirm',
      d.due ? fmtDate(d.due) : 'To confirm', d.status]);
    const xHead = ['Data needed', 'Why it is needed', 'Who provides it', 'Format', 'Data shared frequency', 'Next due', 'Status'];
    const xRows = (iv.dataNeeds || []).map((x) => [x.what, x.purpose || '', x.owner || 'To confirm', x.format || 'To confirm', x.when || 'To confirm', x.due ? fmtDate(x.due) : '', x.status]);
    const title = (t) => `<p style="font-family:Arial,sans-serif;font-size:11pt;font-weight:bold;margin:12px 0 4px">${esc(t)}</p>`;
    let html = '', plain = '';
    if (which !== 'data') {
      html += (which === 'all' ? title(`${iv.id} ${iv.name}: deliverables and actions`) : '') + (dRows.length ? table(dHead, dRows) : '<p>None recorded yet.</p>');
      plain += (which === 'all' ? `${iv.id} ${iv.name}: deliverables and actions\n` : '') + (dRows.length ? text(dHead, dRows) : 'None recorded yet.');
    }
    if (which !== 'deliv') {
      html += (which === 'all' ? title('Data needed for the evaluation') : '') + (xRows.length ? table(xHead, xRows) : '<p>None recorded yet.</p>');
      plain += (which === 'all' ? '\n\nData needed for the evaluation\n' : '') + (xRows.length ? text(xHead, xRows) : 'None recorded yet.');
    }
    const done = () => flash('ok', 'Copied. Paste it into an email.');
    const fail = (e) => flash('error', `Couldn't copy: ${e.message}`);
    if (window.ClipboardItem) {
      navigator.clipboard.write([new ClipboardItem({ 'text/html': new Blob([html], { type: 'text/html' }), 'text/plain': new Blob([plain], { type: 'text/plain' }) })]).then(done, fail);
    } else navigator.clipboard.writeText(plain).then(done, fail);
  }

  function addNote(ivId) {
    const form = document.querySelector(`[data-noteform="${CSS.escape(ivId)}"]`);
    const get = (n) => form.querySelector(`[name="${n}"]`).value.trim();
    const text = get('text');
    if (!text) { flash('error', 'Add some text first.'); return; }
    if (get('type') === 'template') {
      state.tracker.templateUpdates = state.tracker.templateUpdates || [];
      state.tracker.templateUpdates.push({ id: model.newId('t'), interventionId: ivId, section: get('section'), text, raisedOn: TODAY, done: false });
    } else {
      state.tracker.notes = state.tracker.notes || [];
      state.tracker.notes.push({ id: model.newId('n'), interventionId: ivId, type: get('type'), text, date: TODAY });
    }
    persist('Note added.');
  }

  // Without a SharePoint address, the browser can only hand over a copy of the file.
  async function openDocCopy(ivId) {
    try {
      const iv = findIv(ivId);
      let dir = isFund(iv) ? state.fundDir : state.conn.projects;
      if (!dir) throw new Error('Connect the Fund folder first, on the Fund projects tab.');
      const parts = iv.template.file.split('/');
      for (const p of parts.slice(0, -1)) dir = await dir.getDirectoryHandle(p);
      const file = await (await dir.getFileHandle(parts[parts.length - 1])).getFile();
      const a = document.createElement('a');
      a.href = URL.createObjectURL(file);
      a.download = file.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 10000);
      flash('info', 'Opened a copy. Changes to the copy are not saved to OneDrive, so edit the original in the strand folder.');
    } catch (e) {
      flash('error', `Couldn't open the document: ${e.message}`);
    }
  }

  function addData(ivId) {
    const form = document.querySelector(`[data-dataform="${CSS.escape(ivId)}"]`);
    const get = (n) => form.querySelector(`[name="${n}"]`).value.trim();
    if (!get('what')) { flash('error', 'Say what data is needed first.'); return; }
    const iv = findIv(ivId);
    iv.dataNeeds = iv.dataNeeds || [];
    iv.dataNeeds.push({ id: model.newId('data'), what: get('what'), purpose: get('purpose'), owner: get('owner'), format: get('format'), when: get('when'), due: get('due') || null, status: 'To agree', addedOn: TODAY });
    persist(`Data requirement added to ${ivId}.`);
  }

  // ---------- meeting update ----------

  const EXAMPLE = `Meeting: Strand 6 catch-up with strand lead
Date: 22/09/2026

[6.2]
Update: Still investigating options. No decision yet.
Action: Invite the provider in to go through the details | owner: Strand lead | due: 30/10/2026
Deliverable: Decision on approach | owner: Strand lead | due: 18/12/2026
Data: Attendance by student ID | from: Strand lead | format: Excel | when: end of each term | due: 30/01/2027 | for: compare outcomes of attenders and non-attenders
Risk: Budget pressure this year
Template: Timeframes | Set planning dates once the approach is decided
Status: At risk`;

  function renderMeetingTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    const p = state.pendingUpdate;
    let preview = '';
    if (p) {
      const count = (k) => p.groups.reduce((a, g) => a + g[k].length, 0);
      preview = `<section class="panel" id="update-preview">
        <h3>${esc(p.meeting || 'Meeting')}${p.date ? `, ${fmtDate(p.date)}` : ''}</h3>
        <p>${p.groups.length} intervention${p.groups.length === 1 ? '' : 's'}: ${count('notes')} notes, ${count('deliverables')} actions and deliverables, ${count('dataNeeds')} data requirements, ${count('templateUpdates')} template changes.</p>
        ${p.warnings.length ? `<div class="msg error"><strong>Check these before saving:</strong><ul>${p.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
        ${!p.date ? '<p class="hot small">No date given, so today\'s date will be used.</p>' : ''}
        ${p.groups.map((g) => {
          const iv = findIv(g.id);
          return `<div class="preview-group"><h4>${esc(g.id)} ${esc(iv.name)}</h4><ul>
            ${g.status ? `<li><span class="chip warn">Status</span> ${esc(iv.status)} to ${esc(g.status)}</li>` : ''}
            ${g.notes.map((n) => `<li><span class="chip ${n.type === 'Risk' ? 'risk' : ''}">${esc(n.type)}</span> ${esc(n.text)}</li>`).join('')}
            ${g.deliverables.map((d) => `<li><span class="chip">${d.kind === 'action' ? 'Action' : 'Deliverable'}</span> ${esc(d.title)} <span class="muted small">${esc(d.owner || 'No owner')}, ${d.due ? fmtDate(d.due) : 'no date'}</span></li>`).join('')}
            ${g.dataNeeds.map((x) => `<li><span class="chip map">Data</span> ${esc(x.what)} <span class="muted small">${esc([x.owner || 'who to confirm', x.format, x.when, x.due ? fmtDate(x.due) : ''].filter(Boolean).join(', '))}</span></li>`).join('')}
            ${g.templateUpdates.map((u) => `<li><span class="chip map">Template: ${esc(u.section)}</span> ${esc(u.text)}</li>`).join('')}
          </ul></div>`;
        }).join('')}
        <button id="save-update" class="primary" ${p.groups.length ? '' : 'disabled'}>Save to the tracker</button>
        <span class="muted small">The current tracker is copied to the backups folder first.</span>
      </section>`;
    }
    return `<h2>Updates</h2>
      <p class="muted intro">Add an update from a meeting or a strand lead. It can add notes, deliverables and actions, data requirements, project document changes and status changes. You'll see a preview before anything is saved.</p>
      <div class="update-options">
        <div class="drop-zone" id="drop-zone" tabindex="0" role="button" aria-label="Drop an update file here">
          <span class="opt-num">1</span><strong>Drag a file in here</strong><span class="muted small">A .txt file in the update format</span></div>
        <label class="opt-card"><span class="opt-num">2</span><strong>Choose a file</strong><span class="muted small">Browse to a .txt file</span>
          <input type="file" id="update-file" accept=".txt,.md" hidden><span class="quiet opt-btn">Choose file</span></label>
        <button class="opt-card ${state.pasteOpen ? 'on' : ''}" id="open-paste"><span class="opt-num">3</span><strong>Copy in text</strong><span class="muted small">Paste the update into a box</span></button>
      </div>
      ${state.pasteOpen ? `<textarea id="meeting-text" rows="14" spellcheck="true" placeholder="Paste the update here">${esc(state.meetingText)}</textarea>
      <div class="bar start"><button id="preview-update" class="primary">Preview</button></div>` : ''}
      ${preview}
      <details class="panel help"><summary><strong>The update format</strong></summary>
        <ul class="small">
          <li><code>Meeting:</code> and <code>Date:</code> at the top.</li>
          <li>An intervention heading in square brackets, like <code>[6.2]</code>. Each line goes to the heading above it.</li>
          <li><code>Update:</code>, <code>Risk:</code>, <code>Decision:</code>, <code>Scope change:</code> or <code>Question:</code> for notes.</li>
          <li><code>Action:</code> or <code>Deliverable:</code>, followed by <code>| owner: Name | due: dd/mm/yyyy</code>.</li>
          <li><code>Data:</code> followed by <code>| from: Name | format: Excel | when: end of each term | due: dd/mm/yyyy | for: why it's needed</code>. A data line with the same description as an existing one updates it.</li>
          <li><code>Template: Section | what needs changing</code>, where the section is ${model.TEMPLATE_SECTIONS.map((s) => `<code>${s}</code>`).join(', ')}.</li>
          <li><code>Status:</code> to change the live status, using ${model.STATUSES.map((s) => `<code>${s}</code>`).join(', ')}.</li>
        </ul>
        <pre class="example">${esc(EXAMPLE)}</pre>
      </details>`;
  }

  function loadUpdateFile(file) {
    if (!/\.(txt|md)$/i.test(file.name)) { flash('error', 'Use a .txt file in the update format.'); return; }
    file.text().then((txt) => { state.meetingText = txt; state.pasteOpen = true; previewUpdate(); });
  }

  // Drag and drop onto the drop zone on Updates.
  document.addEventListener('dragover', (e) => {
    const z = e.target.closest && e.target.closest('#drop-zone');
    if (!z) return;
    e.preventDefault();
    z.classList.add('over');
  });
  document.addEventListener('dragleave', (e) => {
    const z = e.target.closest && e.target.closest('#drop-zone');
    if (z) z.classList.remove('over');
  });
  document.addEventListener('drop', (e) => {
    const z = e.target.closest && e.target.closest('#drop-zone');
    if (!z) return;
    e.preventDefault();
    z.classList.remove('over');
    const f = e.dataTransfer.files[0];
    if (f) loadUpdateFile(f);
  });

  function previewUpdate() {
    state.pendingUpdate = meetingUpdate.parseUpdate(state.meetingText, state.tracker);
    state.message = null;
    render();
  }

  async function saveUpdate() {
    const p = state.pendingUpdate;
    try {
      const updated = meetingUpdate.applyUpdate(state.tracker, p, new Date().toISOString());
      await folder.saveTracker(state.conn.projects, updated, { backup: true });
      state.tracker = updated;
      state.pendingUpdate = null;
      state.meetingText = '';
      const first = p.groups[0] && findIv(p.groups[0].id);
      state.tab = 'interventions';
      state.ivPage = first ? first.id : null;
      flash('ok', `Saved the update for ${p.groups.map((g) => g.id).join(', ')}.`);
    } catch (e) {
      flash('error', `Couldn't save: ${e.message}`);
    }
  }

  // ---------- template changes ----------

  function templateChangesHtml(strandFilter) {
    let items = (state.tracker.templateUpdates || []).filter((u) => state.showDone || !u.done);
    if (strandFilter !== 'all') items = items.filter((u) => (findIv(u.interventionId) || {}).strand === Number(strandFilter));
    const byIv = new Map();
    for (const u of items) (byIv.get(u.interventionId) || byIv.set(u.interventionId, []).get(u.interventionId)).push(u);
    const ids = [...byIv.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return ids.map((id) => {
      const iv = findIv(id);
      const file = iv.template && iv.template.file;
      return `<section class="panel tight" data-id="${esc(id)}">
        <h3><span class="id">${esc(id)}</span> ${esc(iv.name)}</h3>
        <p class="small ${file ? 'muted' : 'hot'}">${file ? esc(file) : 'No project template yet. Create one first.'}</p>
        <ul class="tu">${byIv.get(id).sort((a, b) => model.TEMPLATE_SECTIONS.indexOf(a.section) - model.TEMPLATE_SECTIONS.indexOf(b.section)).map((u) => `<li class="${u.done ? 'is-done' : ''}">
          <label><input type="checkbox" data-tu="${esc(u.id)}" ${u.done ? 'checked' : ''}> <strong>${esc(u.section)}:</strong> ${esc(u.text)}</label>
          <span class="muted small">raised ${fmtDate(u.raisedOn)}${u.done && u.doneOn ? `, done ${fmtDate(u.doneOn)}` : ''}</span></li>`).join('')}</ul>
      </section>`;
    }).join('') || '<p class="muted">Nothing outstanding.</p>';
  }

  // ---------- theory of change audit ----------

  const TOC_PILL = {
    complete: '<span class="pill ok">Complete</span>',
    partial: '<span class="pill warn">Partly written</span>',
    missing: '<span class="pill risk">Missing</span>',
  };

  function gapsHtml(a) {
    if (a.state !== 'partial') return '';
    const part = (label, list) => (list.length ? `<li><strong>${label}:</strong> ${list.map(esc).join(', ')}</li>` : '');
    return `<ul class="gaps">
      ${part('Timeframes still needed', a.gaps.timeframes)}
      ${part('Theory of change still needed', a.gaps.theoryOfChange)}
      ${part('Evaluation still needed', a.gaps.evaluation)}
      ${part('Details still needed', a.gaps.details)}
    </ul>
    ${a.mismatch.length ? `<p class="small hot">Marked as completed in the template, but still has gaps: ${a.mismatch.join(', ')}.</p>` : ''}
    ${a.recheck ? '<p class="small muted">Run the check again to see which parts are missing.</p>' : ''}`;
  }

  // Notes and meeting items that could help fill the gaps.
  function helpHtml(iv) {
    const notes = (state.tracker.notes || []).filter((n) => n.interventionId === iv.id && n.type !== 'Status change');
    const changes = (state.tracker.templateUpdates || []).filter((u) => u.interventionId === iv.id && !u.done);
    if (!notes.length && !changes.length) return '';
    return `<details class="help-notes"><summary class="small">From your meeting notes (${notes.length + changes.length})</summary><ul class="notes">
      ${changes.map((u) => `<li><span class="chip map">Change: ${esc(u.section)}</span> ${esc(u.text)}</li>`).join('')}
      ${notes.map((n) => `<li><span class="muted small">${fmtDate(n.date)}</span> <span class="chip ${n.type === 'Risk' ? 'risk' : n.type === 'Question' ? 'warn' : ''}">${esc(n.type)}</span> ${esc(n.text)}</li>`).join('')}
    </ul></details>`;
  }

  function renderAuditTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    const checked = state.tracker.templatesCheckedAt;
    let list = state.tracker.interventions;
    if (state.strand !== 'all') list = list.filter((iv) => iv.strand === Number(state.strand));
    const assessed = list.map((iv) => ({ iv, a: templates.assess(iv) }));
    const inScope = assessed.filter((x) => ['complete', 'partial', 'missing'].includes(x.a.state));
    const exempt = assessed.filter((x) => x.a.state === 'exempt' && x.iv.status !== 'BAU');
    const n = (st) => inScope.filter((x) => x.a.state === st).length;
    const extra = state.audit ? new Map(state.audit.results.map((r) => [r.id, r])) : new Map();

    const rows = inScope.map(({ iv, a }) => {
      const r = extra.get(iv.id) || {};
      const t = iv.template;
      const pill = r.error ? `<span class="pill risk" title="${esc(r.error)}">Unreadable</span>` : TOC_PILL[a.state];
      return `<tr data-id="${esc(iv.id)}">
        <td>${esc(iv.id)}</td>
        <td><strong>${esc(iv.name)}</strong>
          ${t && t.file ? `<div class="muted small">${esc(t.file)}</div>` : ''}
          ${r.others && r.others.length ? `<div class="small hot">Also found: ${r.others.map(esc).join(', ')}</div>` : ''}
          ${r.error ? `<div class="small hot">The template file couldn't be opened: ${esc(r.error)}. Check it opens in Word.</div>` : a.state === 'missing' ? '<div class="small">No project template in the strand folder yet.</div>' : ''}
          ${gapsHtml(a)}
          ${helpHtml(iv)}</td>
        <td>${pill}${a.state === 'partial' ? `<div class="muted small">${a.filled} of ${a.total} parts</div>` : ''}</td>
        <td>${t ? esc(t.lead || '') : ''}</td>
        <td>${t ? fmtDate(t.lastUpdated) : ''}</td>
      </tr>`;
    });

    return `<div class="bar">${strandTabs()}
        <button id="run-audit" class="primary">${checked ? 'Check again' : 'Check templates'}</button></div>
      <h2>Theory of Change audit</h2>
      <p class="muted">Which non-BAU interventions have a project template with a written theory of change, evaluation plan and timeframes. It reads the Word files named like <code>APP6.3 - Name.docx</code> in each strand folder.
        ${checked ? `Last checked ${fmtDate(checked.slice(0, 10))}.` : ''}</p>
      <div class="counts three">
        <div><span class="big">${n('complete')}</span><span>Complete</span></div>
        <div><span class="big">${n('partial')}</span><span>Partly written</span></div>
        <div><span class="big">${n('missing')}</span><span>Missing</span></div>
      </div>
      <p class="muted small">Out of ${inScope.length} non-BAU interventions${state.strand === 'all' ? ' in strands 1 to 6' : ''}. Strand 7 isn't counted, because its interventions are architectural and don't need a full theory of change.
        "Complete" means every theory of change and evaluation section has written content, and all three stages have dates.</p>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>#</th><th>Intervention and what's still needed</th><th>Theory of change</th><th>Lead</th><th>Last updated</th></tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="5" class="muted">None in this view.</td></tr>'}</tbody>
      </table></div>
      ${state.audit && state.audit.unmatched.length ? `<p class="small">Template files that don't match a tracker row: ${state.audit.unmatched.map(esc).join(', ')}</p>` : ''}
      ${exempt.length ? `<details class="panel tight"><summary><strong>Not needing a full theory of change (${exempt.length})</strong></summary>
        <ul class="small">${exempt.map(({ iv }) => `<li>${esc(iv.id)} ${esc(iv.name)}${iv.template ? ' <span class="muted">(template found)</span>' : ''}</li>`).join('')}</ul></details>` : ''}
      <h2>Changes raised in meetings</h2>
      <p class="muted">Changes that need making in the project templates. Tick each one once the template is updated, then check the templates again.
        <label class="small"><input type="checkbox" id="showdone" ${state.showDone ? 'checked' : ''}> Show done</label></p>
      ${templateChangesHtml(state.strand)}`;
  }

  // ---------- targets ----------

  const TARGET_WORD = { Y: 'Yes', Partial: 'Partly', N: 'No' };

  function targetChips(iv) {
    const t = iv.targets || {};
    const label = model.TARGETS.map(([k, l], i) => `${i + 1} ${l}: ${TARGET_WORD[t[k]] || 'not set'}`).join('; ');
    return `<span class="targets" role="img" aria-label="${esc(label)}">${model.TARGETS.map(([k, l], i) => {
      const v = t[k];
      const cls = v === 'Y' ? 't-y' : v === 'Partial' ? 't-p' : 't-n';
      return `<span class="t ${cls}" title="${i + 1}. ${esc(l)}: ${TARGET_WORD[v] || 'not set'}">${i + 1}</span>`;
    }).join('')}</span>`;
  }

  function targetLegend() {
    return `<details class="legend"><summary class="small">Targets key: <span class="t t-y">1</span> relates <span class="t t-p">1</span> partly relates <span class="t t-n">1</span> doesn't relate</summary>
      <ol class="small legend-list">${model.TARGETS.map(([, l]) => `<li>${esc(l)}</li>`).join('')}</ol></details>`;
  }

  // ---------- progress ----------

  const FLAG_LABEL = { behind: 'Behind plan', soon: 'Due soon', ok: 'In line', unknown: "Can't check", bau: 'BAU' };
  const FLAG_CLASS = { behind: 'risk', soon: 'warn', ok: 'ok', unknown: 'map', bau: 'bau' };

  function itemRows(list, showIv) {
    if (!list.length) return '<p class="muted small">Nothing open.</p>';
    return `<ul class="deliv wide">${list.map((d) => `<li>
        <span class="chip">${d.kind === 'action' ? 'Action' : 'Deliverable'}</span>
        <span class="deliv-title">${showIv ? `<span class="id">${esc(d.iv.id)}</span> ` : ''}${esc(d.title)}</span>
        <span class="muted small">${esc(d.owner || 'No owner')}</span>
        <span class="small ${dueClass(d)}">${d.due ? fmtDate(d.due) : '<span class="muted">No date</span>'}</span>
        <select data-deliv="${esc(d.iv.id)}|${esc(d.id)}" aria-label="Status">${model.DELIVERABLE_STATUSES.map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </li>`).join('')}</ul>`;
  }

  function renderStrandProgress(n) {
    const sp = reports.strandProgress(state.tracker, n, TODAY, state.yourName);
    const rows = sp.rows.map((r) => {
      const toc = r.toc.state === 'partial' ? `Partly written<div class="muted small">${r.toc.filled} of ${r.toc.total} parts</div>` : { complete: 'Complete', missing: '<span class="hot">No template</span>', exempt: '<span class="muted">Not needed</span>' }[r.toc.state] || '';
      const next = r.nextItem ? `<div>${esc(r.nextItem.title)}</div><div class="muted small">${esc(r.nextItem.owner || 'No owner')}${r.nextItem.due ? `, <span class="${dueClass(r.nextItem)}">${fmtDate(r.nextItem.due)}</span>` : ''}</div>` : '<span class="muted small">No actions recorded</span>';
      return `<tr data-id="${esc(r.iv.id)}">
        <td class="nowrap"><span class="id">${esc(r.iv.id)}</span></td>
        <td><strong>${esc(r.iv.name)}</strong>
          ${r.latest ? `<div class="small muted">${fmtDate(r.latest.date)}: ${esc(r.latest.text)}</div>` : ''}
          ${r.risks.length ? `<div class="small hot">Risk: ${r.risks.map((x) => esc(x.text)).join(' ')}</div>` : ''}</td>
        <td>${targetChips(r.iv)}</td>
        <td>${statusPill(r.iv.status)}<div style="margin-top:4px"><span class="pill ${FLAG_CLASS[r.flag]}" title="${esc([r.stageCheck.text, r.delivCheck.text].filter(Boolean).join('. '))}">${FLAG_LABEL[r.flag]}</span></div></td>
        <td>${esc(r.now.text)}${r.nextStage ? `<div class="muted small">${esc(r.nextStage.text)}</div>` : ''}</td>
        <td>${next}${r.openItems.length > 1 ? `<div class="muted small">+${r.openItems.length - 1} more</div>` : ''}</td>
        <td>${toc}</td>
      </tr>`;
    });
    return `<h2>Strand ${sp.strand}: ${esc(sp.name)}</h2>
      <div class="bar start">
        <button id="save-summary" class="primary">Save summary for the strand lead</button>
        <button id="copy-summary" class="quiet">Copy as email text</button>
        <label class="small">Your actions are those owned by <input id="your-name" type="text" size="8" value="${esc(state.yourName)}"></label>
      </div>
      <h3 class="section">With you (${sp.yours.length})</h3>${itemRows(sp.yours, true)}
      <h3 class="section">With the strand team (${sp.team.length})</h3>${itemRows(sp.team, true)}
      <h3 class="section">Interventions on the go</h3>
      ${targetLegend()}
      <div class="table-wrap"><table class="grid progress">
        <thead><tr><th>#</th><th>Intervention and latest update</th><th>Targets</th><th>Status</th><th>Planned stage now</th><th>Next action or deliverable</th><th>Theory of change</th></tr></thead>
        <tbody>${rows.join('') || '<tr><td colspan="7" class="muted">No non-BAU interventions.</td></tr>'}</tbody>
      </table></div>
      ${sp.bauCount ? `<p class="muted small">${sp.bauCount} business as usual intervention${sp.bauCount === 1 ? '' : 's'} not shown.</p>` : ''}`;
  }

  const CAT_CLASS = { 'BAU': 'bau', 'On track': 'ok', 'Behind': 'risk', 'Completed': 'ok', 'Needs scoping': 'warn' };

  function catPill(cat) {
    return `<span class="pill ${CAT_CLASS[cat]}">${esc(cat === 'Behind' ? 'Behind schedule' : cat === 'Needs scoping' ? 'Needs scoping' : cat)}</span>`;
  }

  function progressSubnav() {
    const subs = [['summary', 'Summary'], ['strands', 'Strand lead summaries'], ['reporting', 'Committee reporting'], ['timeline', 'Timeline spreadsheet']];
    return `<div class="subnav">${subs.map(([k, l]) => `<button class="${state.sub === k ? 'on' : ''}" data-sub="${k}">${l}</button>`).join('')}</div>`;
  }

  function renderSummary() {
    const ivs = state.tracker.interventions;
    const catOf = new Map(ivs.map((iv) => [iv.id, model.progressCategory(iv, TODAY)]));
    const count = (list, c) => list.filter((iv) => catOf.get(iv.id) === c).length;
    const cards = model.PROGRESS_CATEGORIES.map((c) => `<button class="stat ${CAT_CLASS[c]}-edge ${state.cat && state.cat.cat === c && !state.cat.strand && !state.cat.round ? 'on' : ''}" data-cat="${c}">
        <span class="big">${count(ivs, c)}</span><span>${esc(model.PROGRESS_LABELS[c])}</span></button>`).join('');
    const rows = state.tracker.strands.map((st) => {
      const list = ivs.filter((iv) => iv.strand === st.number);
      return `<tr><th scope="row">Strand ${st.number}: ${esc(st.name)}</th>
        ${model.PROGRESS_CATEGORIES.map((c) => { const n = count(list, c); return `<td class="num">${n ? `<button class="link" data-cat="${c}" data-cat-strand="${st.number}">${n}</button>` : '<span class="muted">0</span>'}</td>`; }).join('')}
        <td class="num">${list.length}</td></tr>`;
    }).join('');
    const fps = state.tracker.fundProjects || [];
    for (const p of fps) catOf.set(p.id, model.progressCategory(p, TODAY));
    let detail = '';
    if (state.cat) {
      const pool = state.cat.round ? fps.filter((p) => state.cat.round === 'all' || p.round === Number(state.cat.round)) : ivs;
      const list = pool.filter((iv) => catOf.get(iv.id) === state.cat.cat && (!state.cat.strand || iv.strand === Number(state.cat.strand)))
        .sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));
      detail = `<h3 class="section">${state.cat.round ? 'Fund projects: ' : ''}${esc(model.PROGRESS_LABELS[state.cat.cat])}${state.cat.strand ? `, strand ${esc(state.cat.strand)}` : ''}${state.cat.round && state.cat.round !== 'all' ? `, round ${esc(state.cat.round)}` : ''} (${list.length}) <button class="link small" data-cat-clear="1">Show all</button></h3>
        <div class="table-wrap"><table class="grid">
          <thead><tr><th>#</th><th>${state.cat.round ? 'Project' : 'Intervention'}</th><th>${state.cat.round ? 'Round' : 'Strand'}</th><th>Status</th><th>Next deliverable or action</th></tr></thead>
          <tbody>${list.map((iv) => {
            const next = (iv.deliverables || []).filter((d) => d.status !== 'Done').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0];
            const why = model.progressReason(iv, TODAY);
            return `<tr><td class="nowrap"><span class="id">${esc(iv.id)}</span></td>
              <td><button class="link" data-iv="${esc(iv.id)}">${esc(iv.name)}</button>${why ? `<div class="small hot">${esc(why)}</div>` : ''}</td>
              <td>${isFund(iv) ? esc(iv.roundLabel || `Round ${iv.round}`) : esc(strandName(iv.strand))}</td><td>${statusPill(iv.status)}</td>
              <td>${next ? `${esc(next.title)}<div class="muted small">${esc(next.owner || 'No owner')}${next.due ? `, <span class="${dueClass(next)}">${fmtDate(next.due)}</span>` : ''}</div>` : '<span class="muted small">None recorded</span>'}</td></tr>`;
          }).join('') || '<tr><td colspan="5" class="muted">None.</td></tr>'}</tbody></table></div>`;
    }
    return `<p class="muted small">As at ${fmtDate(TODAY)}. Click a number to see the interventions behind it.</p>
      <div class="stats">${cards}</div>
      ${detail}
      <h3 class="section">By strand</h3>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Strand</th>${model.PROGRESS_CATEGORIES.map((c) => `<th class="num">${esc(c === 'Behind' ? 'Behind schedule' : c)}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>${rows}</tbody></table></div>
      ${fps.length ? `<h3 class="section">APP Interventions Fund projects</h3>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Round</th>${model.PROGRESS_CATEGORIES.map((c) => `<th class="num">${esc(c === 'Behind' ? 'Behind schedule' : c)}</th>`).join('')}<th class="num">Total</th></tr></thead>
        <tbody>${fund.rounds(state.tracker).map(({ round, label }) => {
          const list = fps.filter((p) => p.round === round);
          return `<tr><th scope="row">${esc(label)}</th>${model.PROGRESS_CATEGORIES.map((c) => { const n = count(list, c); return `<td class="num">${n ? `<button class="link" data-cat="${c}" data-cat-round="${round}">${n}</button>` : '<span class="muted">0</span>'}</td>`; }).join('')}<td class="num">${list.length}</td></tr>`;
        }).join('')}</tbody>
        <tfoot><tr><th>All rounds</th>${model.PROGRESS_CATEGORIES.map((c) => { const n = count(fps, c); return `<td class="num">${n ? `<button class="link" data-cat="${c}" data-cat-round="all">${n}</button>` : '0'}</td>`; }).join('')}<td class="num">${fps.length}</td></tr></tfoot>
      </table></div>` : ''}
      <p class="muted small">"Behind schedule" covers interventions and projects marked at risk or behind, and any with a deliverable or action overdue or blocked, a deliverable later than its agreed date, or data past its due date.</p>`;
  }

  function renderProgressTab() {
    if (!state.tracker && state.sub !== 'timeline') state.sub = 'timeline';
    const body = {
      summary: () => renderSummary(),
      strands: () => `<div class="bar">${strandTabs()}</div>${state.strand === 'all' ? '<p class="muted">Choose a strand to see its summary for the strand lead.</p>' : renderStrandProgress(state.strand)}`,
      reporting: renderReportingTab,
      timeline: renderTimelineTab,
    }[state.sub] || renderSummary;
    return `<h2>Progress</h2>${state.tracker ? progressSubnav() : ''}${body()}`;
  }

  // ---------- interventions ----------

  function renderInterventionsTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    if (state.ivPage && findIv(state.ivPage)) return renderInterventionPage(findIv(state.ivPage));
    let list = state.tracker.interventions;
    if (state.strand !== 'all') list = list.filter((iv) => iv.strand === Number(state.strand));
    const rows = list.map((iv) => {
      const cat = model.progressCategory(iv, TODAY);
      const c = plans.planCheck(iv, TODAY);
      const next = c.deliv.concat((iv.deliverables || []).filter((d) => d.kind === 'action')).filter((d) => d.status !== 'Done').sort((a, b) => (a.due || '9999').localeCompare(b.due || '9999'))[0];
      return `<tr><td class="nowrap"><span class="id">${esc(iv.id)}</span></td>
        <td><button class="link" data-iv="${esc(iv.id)}">${esc(iv.name)}</button></td>
        <td>${esc(strandName(iv.strand))}</td>
        <td>${statusPill(iv.status)}</td><td>${catPill(cat)}</td>
        <td>${plans.needsPlan(iv) ? (c.agreed ? '<span class="small">Agreed</span>' : '<span class="small muted">Not yet agreed</span>') : '<span class="muted small">Not needed</span>'}</td>
        <td>${next ? `${esc(next.title)}<div class="muted small">${next.due ? `<span class="${dueClass(next)}">${fmtDate(next.due)}</span>` : 'No date'}</div>` : '<span class="muted small">None</span>'}</td></tr>`;
    }).join('');
    return `<div class="bar">${strandTabs()}${state.strand !== 'all' ? '<button id="save-plans" class="primary">Save the strand\'s plans to send for agreement</button>' : ''}</div>
      <h2>Interventions</h2>
      <p><button class="quiet small-btn" data-myics="all">Add all my deliverables and actions to Outlook</button></p>
      <p class="muted intro">Open an intervention to see and edit everything about it: status, deliverables and actions, data requirements, notes and its project document.</p>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>#</th><th>Intervention</th><th>Strand</th><th>Status</th><th>Progress</th><th>Plan</th><th>Next due</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="7" class="muted">None.</td></tr>'}</tbody></table></div>`;
  }

  function docLink(iv) {
    const t = iv.template;
    if (!t || !t.file) return state.tracker.templatesCheckedAt ? '<span class="hot small">No project document found</span>' : '<span class="muted small">Not checked yet</span>';
    const base = state.tracker.settings && state.tracker.settings[isFund(iv) ? 'fundDocsUrl' : 'docsUrl'];
    const name = t.file.split('/').pop();
    if (base) {
      const url = `${base.replace(/\/+$/, '')}/${t.file.split('/').map(encodeURIComponent).join('/')}?web=1`;
      return `<a class="link" href="${esc(url)}" target="_blank" rel="noopener">${esc(name)}</a>`;
    }
    return `<span class="small">${esc(name)}</span> <button class="quiet small-btn" data-opendoc="${esc(iv.id)}">Open a copy</button>`;
  }

  function viewRow(iv, d) {
    const key = `${esc(iv.id)}|${esc(d.id)}`;
    return `<tr class="${d.status === 'Done' ? 'is-done' : ''}">
      <td><span class="chip">${d.kind === 'action' ? 'Action' : 'Deliverable'}</span></td>
      <td>${esc(d.title)}${historyText(d)}</td>
      <td>${d.owner ? esc(d.owner) : '<span class="hot small">No owner</span>'}</td>
      <td class="nowrap"><span class="${dueClass(d)}">${d.due ? fmtDate(d.due) : '<span class="muted">No date</span>'}</span>${slipText(d)}${d.status !== 'Done' && d.due && d.due < TODAY ? '<div class="small hot">Overdue</div>' : ''}</td>
      <td><select class="status-select st-${esc(d.status.replace(/\s+/g, '-').toLowerCase())}" data-deliv="${key}" aria-label="Status">${model.DELIVERABLE_STATUSES.map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td class="nowrap"><button class="quiet small-btn" data-edit="${key}">Edit</button></td></tr>`;
  }

  function editRow(iv, d) {
    if (state.editing !== `${iv.id}|${d.id}`) return viewRow(iv, d);
    const key = `${esc(iv.id)}|${esc(d.id)}`;
    return `<tr class="editing" class="${d.status === 'Done' ? 'is-done' : ''}">
      <td><select data-dedit="${key}|kind" aria-label="Type"><option value="deliverable" ${d.kind !== 'action' ? 'selected' : ''}>Deliverable</option><option value="action" ${d.kind === 'action' ? 'selected' : ''}>Action</option></select></td>
      <td class="grow"><input type="text" value="${esc(d.title)}" data-dedit="${key}|title" aria-label="Title">${historyText(d)}</td>
      <td><input type="text" size="10" value="${esc(d.owner || '')}" data-dedit="${key}|owner" aria-label="Owner"></td>
      <td class="nowrap"><input type="date" value="${esc(d.due || '')}" data-due="${key}" aria-label="Due date">${slipText(d)}${d.status !== 'Done' && d.due && d.due < TODAY ? '<div class="small hot">Overdue</div>' : ''}</td>
      <td><select data-deliv="${key}" aria-label="Status">${model.DELIVERABLE_STATUSES.map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td class="nowrap"><button class="primary small-btn" data-edit-done="1">Done</button> <button class="link small" data-ddel="${key}">Delete</button></td></tr>`;
  }

  function dataRow(iv, x) {
    const key = `${esc(iv.id)}|${esc(x.id)}`;
    const late = x.status !== 'Received' && x.due && x.due < TODAY;
    if (state.editing !== `${iv.id}|${x.id}`) {
      const tc = (v) => (v ? esc(v) : '<span class="hot small">To confirm</span>');
      return `<tr>
        <td><strong>${esc(x.what)}</strong>${x.purpose ? `<div class="small muted">${esc(x.purpose)}</div>` : ''}</td>
        <td>${tc(x.owner)}</td><td>${tc(x.format)}</td><td>${tc(x.when)}</td>
        <td class="nowrap">${x.due ? `<span class="${late ? 'hot' : ''}">${fmtDate(x.due)}</span>${late ? '<div class="small hot">Late</div>' : ''}` : '<span class="muted small">None</span>'}</td>
        <td><select class="status-select" data-datastatus="${key}" aria-label="Status">${plans.DATA_STATUSES.map((s) => `<option ${s === x.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
        <td class="nowrap"><button class="quiet small-btn" data-edit="${key}">Edit</button></td></tr>`;
    }
    const f = (field, size, label) => `<input type="text" ${size ? `size="${size}"` : ''} value="${esc(x[field] || '')}" data-xedit="${key}|${field}" aria-label="${label}" placeholder="To confirm">`;
    return `<tr>
      <td class="grow">${f('what', 0, 'Data')}<div class="small" style="margin-top:4px">${f('purpose', 0, 'Why it is needed')}</div></td>
      <td>${f('owner', 10, 'Who provides it')}</td><td>${f('format', 12, 'Format')}</td><td>${f('when', 12, 'When')}</td>
      <td class="nowrap"><input type="date" value="${esc(x.due || '')}" data-xedit="${key}|due" aria-label="Next due">${x.status !== 'Received' && x.due && x.due < TODAY ? '<div class="small hot">Late</div>' : ''}</td>
      <td><select data-datastatus="${key}" aria-label="Status">${plans.DATA_STATUSES.map((s) => `<option ${s === x.status ? 'selected' : ''}>${s}</option>`).join('')}</select></td>
      <td class="nowrap"><button class="primary small-btn" data-edit-done="1">Done</button> <button class="link small" data-deldata="${key}">Delete</button></td></tr>`;
  }

  function renderInterventionPage(iv) {
    const check = model.slipCheck(iv, TODAY);
    const c = plans.planCheck(iv, TODAY);
    const cat = model.progressCategory(iv, TODAY);
    const why = model.progressReason(iv, TODAY);
    const items = (iv.deliverables || []).filter((d) => state.showDone || d.status !== 'Done')
      .sort((a, b) => (b.kind === 'action') - (a.kind === 'action') || (a.due || '9999').localeCompare(b.due || '9999'));
    const hidden = (iv.deliverables || []).filter((d) => d.status === 'Done').length;
    const agreedLine = !plans.needsPlan(iv) ? '' : c.agreed
      ? `<span class="pill ok">Plan agreed ${fmtDate(iv.plan.agreedOn)}${iv.plan.agreedWith ? ` with ${esc(iv.plan.agreedWith)}` : ''}</span>${c.changedSinceAgreed ? ' <span class="pill warn">Changed since agreed</span>' : ''}`
      : '<span class="pill warn">Plan not yet agreed</span>';
    const urlKey = isFund(iv) ? 'fundDocsUrl' : 'docsUrl';
    const base = (state.tracker.settings && state.tracker.settings[urlKey]) || '';
    return `<p><button class="link" data-iv-back="1">${isFund(iv) ? 'All Fund projects' : 'All interventions'}</button></p>
      <article class="ivpage">
        <header class="iv-head">
          <div><div class="muted">${isFund(iv) ? `APP Interventions Fund, ${esc(iv.roundLabel || `Round ${iv.round}`)}${iv.lead ? `. Lead: ${esc(iv.lead)}` : ''}` : `Strand ${esc(iv.strand)}: ${esc(strandName(iv.strand))}`}</div><h2><span class="id">${esc(iv.id)}</span> ${esc(iv.name)}</h2></div>
          <div class="pills">
            <label class="small">Status <select class="status-select" data-status-for="${esc(iv.id)}">${model.STATUSES.map((s) => `<option ${s === iv.status ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
            ${catPill(cat)} ${agreedLine}
          </div>
        </header>
        ${why ? `<p class="hot small">${esc(why)}</p>` : ''}
        ${iv.description ? `<p class="desc">${esc(iv.description)}</p>` : ''}
        <div class="facts">
          <div><h4>Where it should be</h4>${periodsText(iv)}</div>
          <div><h4>Stage check</h4><p class="small">${esc(check.text)}</p></div>
          <div><h4>Project document</h4><p>${docLink(iv)}</p><p class="small muted">${iv.template ? `${templateText(iv)}` : ''}</p></div>
        </div>
        ${templateUpdatesBlock(iv)}

        <div class="section-head"><h3 class="section">Deliverables and actions</h3>
          <span class="row-actions"><button class="quiet small-btn" data-copy="deliv|${esc(iv.id)}">Copy table</button><button class="quiet small-btn" data-copy="all|${esc(iv.id)}">Copy both for an email</button><button class="quiet small-btn" data-myics="${esc(iv.id)}" title="All-day entries, shown as free, for open items owned by ${esc(state.yourName)}">Add mine to Outlook</button></span></div>
        <div class="table-wrap"><table class="grid edit">
          <thead><tr><th>Type</th><th>Title</th><th>Owner</th><th>Due</th><th>Status</th><th></th></tr></thead>
          <tbody>${items.map((d) => editRow(iv, d)).join('') || '<tr><td colspan="6" class="muted small">None yet. Add each deliverable with an owner and a date.</td></tr>'}</tbody></table></div>
        <label class="small"><input type="checkbox" id="showdone" ${state.showDone ? 'checked' : ''}> Show finished${hidden && !state.showDone ? ` (${hidden} hidden)` : ''}</label>
        <div class="record-form" data-form="${esc(iv.id)}">
          <label>Type <select name="type"><option value="deliverable">Deliverable</option><option value="action">Action</option></select></label>
          <input type="hidden" name="section" value="">
          <label class="grow">Title <input name="text" type="text" autocomplete="off"></label>
          <label>Owner <input name="owner" type="text" size="10" autocomplete="off"></label>
          <label>Due <input name="due" type="date"></label>
          <button class="quiet" data-add="${esc(iv.id)}">Add</button>
        </div>

        <div class="section-head"><h3 class="section">Data for the evaluation</h3>
          <span class="row-actions"><button class="quiet small-btn" data-copy="data|${esc(iv.id)}">Copy table</button></span></div>
        <div class="table-wrap"><table class="grid edit">
          <thead><tr><th>Data, and why it's needed</th><th>Who provides it</th><th>Format</th><th>Data shared frequency</th><th>Next due</th><th>Status</th><th></th></tr></thead>
          <tbody>${c.data.map((x) => dataRow(iv, x)).join('') || '<tr><td colspan="7" class="muted small">None yet. What data will show whether this intervention is working?</td></tr>'}</tbody></table></div>
        <div class="record-form" data-dataform="${esc(iv.id)}">
          <label class="grow">Data <input name="what" type="text" placeholder="e.g. Attendance at each session, by student ID" autocomplete="off"></label>
          <label class="grow">Why it's needed <input name="purpose" type="text" autocomplete="off"></label>
          <label>Who provides it <input name="owner" type="text" size="10" autocomplete="off"></label>
          <label>Format <input name="format" type="text" size="10" autocomplete="off"></label>
          <label>Shared how often <input name="when" type="text" size="12" autocomplete="off"></label>
          <label>Next due <input name="due" type="date"></label>
          <button class="quiet" data-adddata="${esc(iv.id)}">Add</button>
        </div>

        ${plans.needsPlan(iv) ? `<h3 class="section">Agreeing the plan</h3>
        ${c.gaps.length ? `<p class="small"><strong>Still to confirm:</strong> ${esc(c.gaps.join('; '))}.</p>` : '<p class="small">Everything the plan needs is recorded.</p>'}
        <div class="bar start">
          <label class="small">Agreed with <input type="text" size="16" data-agreewith="${esc(iv.id)}" value="${esc((iv.plan && iv.plan.agreedWith) || (iv.template && iv.template.lead) || '')}"></label>
          <button class="primary" data-agree="${esc(iv.id)}">${c.agreed ? 'Record as agreed again' : 'Record plan as agreed'}</button>
          <button class="quiet" data-save-plan="${esc(iv.id)}">Save this plan as a Word file</button>
        </div>
        <p class="muted small">Once a plan is agreed, its dates are fixed. Moving a date later asks for the reason and shows as behind schedule on Progress.</p>` : ''}

        <h3 class="section">Notes</h3>
        ${notesBlock(iv)}
        <div class="record-form" data-noteform="${esc(iv.id)}">
          <label>Type <select name="type">${model.NOTE_TYPES.map((t) => `<option>${t}</option>`).join('')}<option value="template">Project document change</option></select></label>
          <label class="grow">Text <input name="text" type="text" autocomplete="off"></label>
          <label>Section <select name="section">${model.TEMPLATE_SECTIONS.map((s) => `<option>${s}</option>`).join('')}</select></label>
          <button class="quiet" data-addnote="${esc(iv.id)}">Add</button>
        </div>
        <p class="muted small">Section applies to project document changes.</p>
        ${base ? '' : `<details class="record"><summary>Link project documents to SharePoint</summary>
          <p class="small muted">Paste the web address of the ${isFund(iv) ? 'APP Interventions Fund' : 'APP Projects'} folder in SharePoint (open the folder in the browser and copy the address). Project documents then open in Word, and edits save straight to OneDrive.</p>
          <div class="inline-form"><input type="text" id="docs-url" placeholder="https://mdxac.sharepoint.com/..."><button class="quiet small-btn" id="save-docs-url" data-url-key="${urlKey}">Save</button></div></details>`}
      </article>`;
  }

  async function saveSummary() {
    try {
      const n = state.strand;
      const blob = await reports.strandSummaryDoc(state.tracker, n, TODAY, state.yourName);
      const path = await folder.saveReport(state.conn, `Strand ${n} summary - ${TODAY}.docx`, blob);
      recordContact(n, 'summarySent');
      await folder.saveTracker(state.conn.projects, state.tracker);
      flash('ok', `Saved to ${path}. Recorded as sent to the strand lead today.`);
    } catch (e) {
      flash('error', `Couldn't save the summary: ${e.message}`);
    }
  }

  async function copySummary() {
    try {
      await navigator.clipboard.writeText(reports.strandSummaryText(state.tracker, state.strand, TODAY, state.yourName));
      recordContact(state.strand, 'summarySent');
      await folder.saveTracker(state.conn.projects, state.tracker);
      flash('ok', 'Copied. Paste it into an email. Recorded as sent to the strand lead today.');
    } catch (e) {
      flash('error', `Couldn't copy: ${e.message}`);
    }
  }

  // ---------- reporting ----------

  function nudgeBanner() {
    if (!state.tracker) return '';
    const cyc = reporting.cycle(state.tracker, TODAY);
    if (!cyc.nudge || state.tab !== 'progress' || state.sub === 'reporting') return '';
    const n = cyc.next;
    return `<div class="msg nudge" role="status"><strong>${esc(n.name || 'ESE Committee')} paper due in ${cyc.daysLeft} day${cyc.daysLeft === 1 ? '' : 's'}</strong> (${fmtDate(n.deadline || n.meeting)}).
      <button class="link" data-tab="reporting">Check what's still needed</button></div>`;
  }

  function responseTemplate(strand) {
    const ivs = state.tracker.interventions.filter((iv) => iv.strand === Number(strand) && iv.status !== 'BAU');
    return `Meeting: Strand ${strand} lead response to progress summary\nDate: ${TODAY.split('-').reverse().join('/')}\n\n${ivs.map((iv) => `[${iv.id}]\nUpdate: \n`).join('\n')}`;
  }

  function renderReportingTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    const r = reporting.readiness(state.tracker, TODAY, { lastSnapshot: state.lastSnapshot, timeline: state.timeline, papers: state.papers });
    const cyc = r.cycle;
    const group = (g) => r.items.filter((i) => i.group === g);
    const tick = (ok) => `<span class="tick ${ok ? 'ok' : 'todo'}" aria-label="${ok ? 'Done' : 'To do'}">${ok ? '✓' : '○'}</span>`;
    const done = r.items.filter((i) => i.ok).length;

    const strandRows = group('Strand leads').map((i) => `<li>${tick(i.ok)} <strong>${esc(i.text)}</strong> <span class="muted small">${esc(i.detail)}</span>
      <span class="row-actions">
        <button class="quiet small-btn" data-go-strand="${i.strand}">Progress page</button>
        ${i.sent ? `<button class="quiet small-btn" data-response="${i.strand}">Record response</button>` : ''}
        ${i.sent && !(i.received && i.received >= i.sent) ? `<button class="quiet small-btn" data-received="${i.strand}">Mark response received</button>` : ''}
      </span></li>`).join('');

    const explanations = group('Explanations').map((i) => `<li>${tick(i.ok)} <strong>${esc(i.text)}</strong>
      ${i.ok ? `<div class="small muted">${esc(i.detail)}</div>` : `<div class="inline-form"><input type="text" data-reason-for="${esc(i.id)}" placeholder="Why it's behind, and what's being done about it"><button class="quiet small-btn" data-save-reason="${esc(i.id)}">Save</button></div>`}</li>`).join('')
      || '<li class="muted small">Nothing is behind schedule or at risk.</li>';

    const ivOptions = state.tracker.interventions.filter((iv) => iv.status !== 'BAU').map((iv) => `<option value="${esc(iv.id)}">${esc(iv.id)} ${esc(iv.name)}</option>`).join('');
    const successes = (state.tracker.notes || []).filter((n) => n.type === 'Success' && n.date >= r.since);

    const papers = state.papers || [];
    const list = reporting.committees(state.tracker);
    return `<section class="panel">
        ${cyc.next ? `<p class="lead-line"><strong>Next paper: ${esc(cyc.next.name || 'ESE Committee')}</strong>, due ${fmtDate(cyc.next.deadline || cyc.next.meeting)}
          (${cyc.daysLeft} day${cyc.daysLeft === 1 ? '' : 's'} away)${cyc.next.meeting ? `, meeting ${fmtDate(cyc.next.meeting)}` : ''}.</p>` : '<p class="lead-line">Add your committee dates below, and the tool will show what\'s needed ahead of each deadline.</p>'}
        <p class="muted small">${done} of ${r.items.length} checks done. Changes are counted from ${fmtDate(r.since)}${state.lastSnapshot ? ', the date of the last committee snapshot' : ''}.</p>
      </section>

      <h3 class="section">1. Strand lead summaries and responses</h3>
      <p class="muted small">Send each strand lead their summary from the Progress page (saving or copying it records the date). When they reply, record their response as a meeting update, which adds it to the tracker.</p>
      <ul class="checklist">${strandRows}</ul>

      <h3 class="section">2. Reasons for anything behind schedule or at risk</h3>
      <ul class="checklist">${explanations}</ul>

      <h3 class="section">3. Successes and achievements</h3>
      <ul class="checklist">${successes.map((n) => `<li>${tick(true)} <strong>${esc(n.interventionId)}</strong> ${esc(n.text)} <span class="muted small">${fmtDate(n.date)}</span></li>`).join('') || '<li class="muted small">None recorded yet.</li>'}</ul>
      <div class="inline-form"><select id="success-iv">${ivOptions}</select><input type="text" id="success-text" placeholder="What went well"><button class="quiet small-btn" id="save-success">Add</button></div>

      <h3 class="section">4. Timeline spreadsheet</h3>
      <ul class="checklist">${group('Timeline spreadsheet').map((i) => `<li>${tick(i.ok)} ${esc(i.text)} <button class="quiet small-btn" data-tab="timeline">Open</button></li>`).join('')}</ul>

      <h3 class="section">5. Create the papers</h3>
      <section class="panel">
        ${papers.length ? `<p>Latest paper in Committees and reporting: <strong>${esc(papers[0].name)}</strong>. The cover sheet, Table 1 and the Interventions Fund table are carried over from it.</p>` : '<p class="muted small">No earlier paper found in Committees and reporting, so the cover sheet and Table 1 will be left for you to fill in.</p>'}
        <h4>Termly ESE paper</h4>
        <p class="muted small">Executive summary, delivery at a glance, exceptions, changes to the plan, theory of change and evaluation, successes, targets, the Interventions Fund, priorities for next term, and the delivery roadmap as an appendix. Parts only you can write are marked in brackets. Saved in Committees and reporting as a new file.</p>
        <div class="bar start">
          <button id="create-termly" class="primary">Create the termly paper</button>
          <label class="small"><input type="checkbox" id="save-snap" checked> Save a snapshot as the baseline for next time</label>
        </div>
        <h4 style="margin-top:16px">Annual report</h4>
        <p class="muted small">Adds targets by faculty (with charts), other gaps to monitor, evaluation findings and impact, and expenditure against the plan. The faculty, gap and expenditure figures come from a spreadsheet you fill in once a year: <code>_Tracker data/${esc(annualData.FILE)}</code>.</p>
        <div class="bar start">
          ${state.annualFile ? `<span class="small">Data spreadsheet found, last saved ${new Date(state.annualFile.lastModified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</span>` : '<button id="create-annual-data" class="quiet">Create the data spreadsheet</button>'}
          <button id="create-annual" class="primary">Create the annual report</button>
        </div>
      </section>

      <h3 class="section">Committee dates</h3>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Committee</th><th>Paper deadline</th><th>Meeting</th><th></th></tr></thead>
        <tbody>${list.map((c) => `<tr class="${c.meeting && c.meeting < TODAY ? 'is-done' : ''}"><td><input type="text" value="${esc(c.name || 'ESE Committee')}" data-committee="${esc(c.id)}|name" aria-label="Committee name"></td><td><input type="date" value="${esc(c.deadline || '')}" data-committee="${esc(c.id)}|deadline" aria-label="Paper deadline"></td><td><input type="date" value="${esc(c.meeting || '')}" data-committee="${esc(c.id)}|meeting" aria-label="Meeting date"></td>
          <td><button class="quiet small-btn" data-del-committee="${esc(c.id)}">Remove</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No dates yet.</td></tr>'}</tbody>
      </table></div>
      <div class="inline-form">
        <input type="text" id="c-name" value="ESE Committee" aria-label="Committee">
        <label class="small">Paper deadline <input type="date" id="c-deadline"></label>
        <label class="small">Meeting <input type="date" id="c-meeting"></label>
        <button class="quiet small-btn" id="add-committee">Add</button>
      </div>
      ${list.length ? '<p><button id="save-ics" class="quiet">Add reminders to Outlook</button> <span class="muted small">Saves a calendar file with an all-day entry, shown as free, on each paper deadline and two weeks before it, to request strand lead updates. Open it to add them to Outlook.</span></p>' : ''}`;
  }

  function recordContact(strand, key) {
    state.tracker.strandContacts = state.tracker.strandContacts || {};
    state.tracker.strandContacts[strand] = { ...(state.tracker.strandContacts[strand] || {}), [key]: TODAY };
  }

  async function previousPaper() {
    const latest = state.papers[0];
    if (!latest) return { previous: null, prevName: null };
    try {
      return { previous: await papers.readPreviousPaper(await (await latest.handle.getFile()).arrayBuffer()), prevName: `the last paper (${latest.name.replace(/\.docx$/i, '')})` };
    } catch { return { previous: null, prevName: null }; }
  }

  // Never overwrites: a draft that already exists (and may have been edited)
  // is kept, and the new one is numbered.
  async function saveCommitteeFile(name, blob) {
    const { dir } = await folder.committeePapers(state.conn);
    if (!dir) return folder.saveReport(state.conn, name, blob);
    let candidate = name;
    for (let i = 2; ; i++) {
      try { await dir.getFileHandle(candidate); } catch { break; }
      candidate = name.replace(/\.docx$/i, ` (${i}).docx`);
    }
    await folder.writeInDir(dir, candidate, blob);
    return `Committees and reporting/${candidate}`;
  }

  async function createTermly() {
    try {
      const cyc = reporting.cycle(state.tracker, TODAY);
      const list = reporting.committees(state.tracker);
      const committee = cyc.next ? { ...cyc.next, nextMeeting: (list[list.indexOf(cyc.next) + 1] || {}).meeting } : null;
      const { previous, prevName } = await previousPaper();
      const blob = await papers.termlyPaper({ tracker: state.tracker, today: TODAY, prevSnapshot: state.lastSnapshot, committee, previous, prevName });
      const when = new Date(((committee && committee.meeting) || TODAY) + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
      const path = await saveCommitteeFile(`ESE ${when} - APP update (draft from the tool).docx`, blob);
      let snapText = '';
      if (document.getElementById('save-snap').checked) {
        const snap = reports.snapshot(state.tracker, TODAY);
        await folder.saveSnapshot(state.conn.projects, snap);
        state.lastSnapshot = snap;
        snapText = ' A snapshot was saved as the baseline for next time.';
      }
      flash('ok', `Saved to ${path}.${snapText}`);
    } catch (e) {
      flash('error', `Couldn't create the paper: ${e.message}`);
    }
  }

  async function createAnnualData() {
    try {
      const path = await folder.writeDataFile(state.conn.projects, annualData.FILE, await annualData.template());
      state.annualFile = await folder.dataFileInfo(state.conn.projects, annualData.FILE);
      flash('ok', `Created ${path}. Open it in Excel, fill it in, save it, then create the annual report.`);
    } catch (e) {
      flash('error', `Couldn't create the spreadsheet: ${e.message}`);
    }
  }

  async function createAnnual() {
    try {
      const info = await folder.dataFileInfo(state.conn.projects, annualData.FILE);
      const annual = info ? await annualData.read(await info.file.arrayBuffer()) : null;
      const yearSnapshot = await folder.snapshotNear(state.conn.projects, model.addDays(TODAY, -365));
      const { previous, prevName } = await previousPaper();
      const cyc = reporting.cycle(state.tracker, TODAY);
      const blob = await papers.annualReport({ tracker: state.tracker, today: TODAY, yearSnapshot, previous, prevName, annual, committee: cyc.next });
      const path = await saveCommitteeFile(`APP annual report ${TODAY.slice(0, 4)} (draft from the tool).docx`, blob);
      flash('ok', `Saved to ${path}.${annual ? '' : ' The data spreadsheet wasn\'t found, so the faculty, gaps and expenditure sections are left for you to fill in.'}`);
    } catch (e) {
      flash('error', `Couldn't create the annual report: ${e.message}`);
    }
  }

  // Download the open deliverables and actions owned by you as calendar entries.
  function saveMyIcs(ivId) {
    const ivs = ivId === 'all' ? state.tracker.interventions.concat(state.tracker.fundProjects || []) : [findIv(ivId)];
    const { text, count } = reporting.myItemsIcs(state.tracker, ivs, state.yourName);
    if (!count) { flash('info', `Nothing open with a due date is owned by ${state.yourName || 'you'}${ivId === 'all' ? '' : ' in this intervention'}.`); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'text/calendar' }));
    a.download = ivId === 'all' ? `My APP deliverables and actions - ${TODAY}.ics` : `APP${ivId} my deliverables and actions.ics`;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
    flash('ok', `Saved ${count} calendar entr${count === 1 ? 'y' : 'ies'}. Open the file to add them to Outlook.`);
  }

  function saveIcs() {
    const blob = new Blob([reporting.ics(state.tracker)], { type: 'text/calendar' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'APP committee reminders.ics';
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- automatic spreadsheet update ----------

  function renderSheetUpdate() {
    const tl = state.timeline;
    if (!tl || !tl.plan) return '';
    const { changes, analysis } = tl.plan;
    if (!changes.length) return '<section class="panel"><h3>Update the spreadsheet</h3><p>The statuses and the Gantt bars for interventions with template dates already match the tool.</p></section>';
    return `<section class="panel" id="sheet-update"><h3>Update the spreadsheet automatically</h3>
      <p class="muted small">These changes can be made for you: statuses, and Gantt bars for interventions whose project template has dates. Bars that finish before the new dates start (such as BAU, or evaluation of the existing activity) are kept. A copy of the current spreadsheet goes into <code>_Tracker data/backups</code> first, and the new file is checked before it replaces the old one. Close the spreadsheet in Excel before updating.</p>
      <ul class="tl">${changes.map((c) => `<li><label><input type="checkbox" data-sheet-change="${esc(c.id)}" checked> <strong>${esc(c.id)} ${esc(c.name)}</strong></label>
        <ul class="small">
          ${c.status ? `<li>Status: "${esc(c.status.from)}" to "${esc(c.status.to)}"</li>` : ''}
          ${c.bars ? `<li>Gantt now: ${esc(xlsxWrite.describe(c.bars.from, analysis))}</li><li>Gantt after: <strong>${esc(xlsxWrite.describe(c.bars.to, analysis))}</strong></li>` : ''}
          ${c.notes.map((n) => `<li class="hot">${esc(n)}</li>`).join('')}
        </ul></li>`).join('')}</ul>
      <button id="apply-sheet" class="primary">Update the spreadsheet</button>
    </section>`;
  }

  async function applySheet() {
    const f = state.timelineFiles[0];
    try {
      const data = await (await f.handle.getFile()).arrayBuffer();
      const parsed = await trackerImport.parseTracker(data);
      const ids = new Set(Array.from(document.querySelectorAll('[data-sheet-change]:checked')).map((x) => x.dataset.sheetChange));
      const selected = xlsxWrite.plan(parsed, state.tracker).changes.filter((c) => ids.has(c.id));
      if (!selected.length) { flash('info', 'Nothing selected.'); return; }
      const { bytes, problems } = await xlsxWrite.apply(data, parsed, selected);
      if (problems.length) { flash('error', `The spreadsheet wasn't changed, because the check after updating found problems: ${problems.join(' ')}`); return; }
      const backup = await folder.backupFile(state.conn.projects, f.handle);
      await folder.writeHandle(f.handle, bytes);
      // Keep the tool's copy of the Gantt in step with the spreadsheet.
      const fresh = await trackerImport.parseTracker(await (await f.handle.getFile()).arrayBuffer());
      for (const p of fresh.interventions) { const iv = findIv(p.id); if (iv && ids.has(p.id)) iv.plannedStages = p.plannedStages; }
      await folder.saveTracker(state.conn.projects, state.tracker);
      await checkTimeline(true);
      flash('ok', `Updated ${selected.length} row${selected.length === 1 ? '' : 's'} in ${f.path}. The previous version is in ${backup}.`);
    } catch (e) {
      flash('error', `The spreadsheet wasn't updated: ${e.message}${/lock|busy|in use|modif/i.test(e.message) ? ' Close it in Excel and try again.' : ''}`);
    }
  }

  // ---------- how it works ----------

  function box(x, y, w, h, title, sub, cls = '') {
    return `<g class="${cls}"><rect x="${x}" y="${y}" width="${w}" height="${h}" rx="8" class="dg-box"/>
      <text x="${x + w / 2}" y="${y + (sub ? 24 : h / 2 + 5)}" text-anchor="middle" class="dg-title">${title}</text>
      ${sub ? `<text x="${x + w / 2}" y="${y + 42}" text-anchor="middle" class="dg-sub">${sub}</text>` : ''}</g>`;
  }

  function arrow(x1, y1, x2, y2, label, lx, ly, cls = '') {
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="dg-line ${cls}" marker-end="url(#${cls === 'dg-accent' ? 'dg-arrow-accent' : 'dg-arrow'})"/>
      ${label ? `<text x="${lx}" y="${ly}" text-anchor="middle" class="dg-label">${label}</text>` : ''}`;
  }

  function flowFigure() {
    return `<figure class="diagram">
      <svg viewBox="0 0 1000 590" role="img" aria-label="Project templates, the timeline spreadsheet, meeting notes and strand lead responses all feed the APP reporting tool, which keeps tracker.json as the master copy. The tool writes statuses and Gantt bars back to the spreadsheet, and produces strand summaries, draft committee papers, snapshots and Outlook reminders. Summaries go to strand leads, whose replies come back in. GitHub and Vercel only supply the page's code; no data leaves the MDX boundary.">
        <defs><marker id="dg-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="currentColor"/></marker>
          <marker id="dg-arrow-accent" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" class="dg-accent-fill"/></marker></defs>
        <rect x="10" y="74" width="980" height="506" rx="14" class="dg-boundary"/>
        <text x="28" y="100" class="dg-boundary-label">Inside the MDX boundary: your laptop, OneDrive and SharePoint</text>

        ${box(420, 6, 160, 44, 'GitHub and Vercel', '', 'dg-outside')}
        ${arrow(500, 50, 500, 168, 'page code only, no data', 590, 124)}

        ${box(30, 124, 200, 56, 'Project templates', 'Word, one per intervention')}
        ${box(30, 224, 200, 56, 'Timeline spreadsheet', 'Excel statuses and Gantt')}
        ${box(30, 324, 200, 56, 'Meeting notes', 'typed, or Copilot from Teams')}
        ${box(30, 424, 200, 56, 'Strand lead responses', 'replies to their summary')}

        <rect x="380" y="170" width="240" height="270" rx="12" class="dg-hub"/>
        <text x="500" y="200" text-anchor="middle" class="dg-title">APP reporting tool</text>
        <text x="500" y="218" text-anchor="middle" class="dg-sub">runs in Chrome on your laptop</text>
        ${box(410, 300, 180, 64, 'tracker.json', 'the master copy', 'dg-store')}
        <text x="500" y="392" text-anchor="middle" class="dg-sub">statuses, actions, notes,</text>
        <text x="500" y="408" text-anchor="middle" class="dg-sub">template details, dates</text>

        ${arrow(230, 152, 380, 236, 'read each time', 318, 166)}
        ${arrow(230, 244, 380, 268, 'import and check', 300, 240)}
        ${arrow(380, 290, 230, 264, 'writes status and bars', 290, 300, 'dg-accent')}
        ${arrow(230, 352, 380, 352, 'paste update', 305, 344)}
        ${arrow(230, 452, 380, 412, 'record response', 318, 464)}

        ${box(770, 124, 200, 56, 'Outlook reminders', '2 weeks before, and the deadline')}
        ${box(770, 224, 200, 56, 'Draft committee paper', 'from your latest paper')}
        ${box(770, 324, 200, 56, 'Snapshots', 'one per committee paper')}
        ${box(770, 424, 200, 56, 'Strand summaries', 'Word, or email text')}

        ${arrow(620, 210, 770, 152, 'calendar file', 668, 160)}
        ${arrow(620, 256, 770, 252, 'counts, Table 2, notes', 695, 246)}
        ${arrow(620, 330, 770, 346, 'saved at each paper', 695, 326)}
        ${arrow(770, 366, 620, 360, 'what changed since', 695, 382, 'dg-dashed')}
        ${arrow(620, 420, 770, 452, 'before each catch-up', 690, 424)}

        <path d="M870,480 V548 H130 V486" class="dg-line" marker-end="url(#dg-arrow)"/>
        <text x="500" y="540" text-anchor="middle" class="dg-label">sent to strand leads, who check them and reply</text>
      </svg>
      <figcaption>Everything the tool reads and writes stays in your OneDrive folder. The tool keeps one master copy, <code>tracker.json</code>, and every view and document is built from it. The only thing that comes from outside is the page's code. The one write-back to an existing file, the timeline spreadsheet, is the accent arrow; it is backed up and checked each time.</figcaption>
    </figure>`;
  }

  function cycleFigure() {
    const steps = [
      [150, '2 weeks before', 'Send strand leads', 'their summaries'],
      [380, 'Responses back', 'Record responses,', 'reasons and successes'],
      [610, 'Paper deadline', 'Create the paper,', 'edit and submit'],
      [860, 'Committee', 'Snapshot becomes', 'the next baseline'],
    ];
    return `<figure class="diagram">
      <svg viewBox="0 0 1000 200" role="img" aria-label="The reporting cycle: two weeks before the paper deadline, send strand leads their summaries; record their responses, reasons for delay and successes; at the deadline, create the paper, edit it and submit; at the committee, the snapshot becomes the baseline for next time.">
        <rect x="150" y="40" width="460" height="22" rx="6" class="dg-band"/>
        <text x="380" y="56" text-anchor="middle" class="dg-label">Committee reporting and Outlook reminders nudge you</text>
        <line x1="40" y1="100" x2="960" y2="100" class="dg-line"/>
        ${steps.map(([x, when, a, b], i) => `
          <circle cx="${x}" cy="100" r="${i === 2 ? 8 : 6}" class="${i === 2 ? 'dg-dot-accent' : 'dg-dot'}"/>
          <text x="${x}" y="130" text-anchor="middle" class="dg-title">${when}</text>
          <text x="${x}" y="150" text-anchor="middle" class="dg-sub">${a}</text>
          <text x="${x}" y="166" text-anchor="middle" class="dg-sub">${b}</text>`).join('')}
      </svg>
      <figcaption>The run-up to each committee paper. Add the committee dates under Progress, Committee reporting, and the tool counts down to the next deadline and shows what is still needed.</figcaption>
    </figure>`;
  }

  function renderHowTab() {
    return `<h2>How it works</h2>
      ${flowFigure()}
      ${cycleFigure()}
      <div class="how-grid">
        <section class="panel tight"><h3>Agreeing each intervention's plan</h3>
          <ol class="small"><li>Open <strong>Interventions</strong> and choose one. Its page holds everything: status, deliverables and actions, data requirements, notes and its project document.</li><li>Save the plan as a Word file and send it to the team.</li><li>Once agreed, record the plan as agreed. Later date changes then show as behind schedule, with a reason.</li></ol></section>
        <section class="panel tight"><h3>Before a strand lead catch-up</h3>
          <ol class="small"><li>Open <strong>Progress</strong>, then <strong>Strand lead summaries</strong>, and choose the strand.</li><li>Save or copy the summary to send ahead of the meeting.</li></ol></section>
        <section class="panel tight"><h3>After the meeting</h3>
          <ol class="small"><li>Paste a structured update on <strong>Updates</strong>, or edit the intervention's page directly.</li><li>Changes to project documents go on the <strong>Theory of Change audit</strong> checklist.</li><li>Once a document's dates change, update the Gantt from <strong>Progress</strong>, <strong>Timeline spreadsheet</strong>.</li></ol></section>
        <section class="panel tight"><h3>Each committee cycle</h3>
          <ol class="small"><li>Two weeks before the deadline, send strand leads their summaries.</li><li>Follow the checklist under <strong>Progress</strong>, <strong>Committee reporting</strong>.</li><li>Create the draft paper, edit it, then submit.</li></ol></section>
      </div>`;
  }

  // ---------- timeline spreadsheet ----------

  const KIND = { status: ['Status', 'warn'], dates: ['Dates', 'map'], meeting: ['From a meeting', 'map'], note: ['Note', ''], row: ['Row', 'risk'] };

  function renderTimelineTab() {
    const files = state.timelineFiles || [];
    const tl = state.timeline;
    let results = '';
    if (tl) {
      let list = tl.result.results;
      if (state.strand !== 'all') list = list.filter((r) => r.iv.strand === Number(state.strand));
      results = `<h3 class="section">Everything that may need changing</h3><p>${tl.result.results.length} intervention${tl.result.results.length === 1 ? '' : 's'} with likely changes, checked against <strong>${esc(tl.file)}</strong>. Items not covered by the automatic update above need changing by hand.
          <button id="save-timeline-list" class="quiet">Save as a Word checklist</button></p>
        ${list.map((r) => `<section class="panel tight" data-id="${esc(r.iv.id)}"><h3><span class="id">${esc(r.iv.id)}</span> ${esc(r.iv.name)}</h3>
          <ul class="tl">${r.items.map((it) => `<li><span class="chip ${KIND[it.kind][1]}">${KIND[it.kind][0]}</span> ${esc(it.text)}</li>`).join('')}</ul></section>`).join('') || '<p class="muted">No changes suggested for this strand.</p>'}
        ${tl.result.extra.length ? `<p class="small">In the spreadsheet but not the tool: ${tl.result.extra.join(', ')}</p>` : ''}`;
    }
    return `<div class="bar">${state.tracker ? strandTabs() : ''}</div>
      <h2>Timeline spreadsheet</h2>
      <p class="muted">Checks the APP timeline and status spreadsheet against the tool: live statuses, the dates in each project template, deliverables that fall outside the timeline, and timing changes raised in meetings. Update the spreadsheet by hand from this list.</p>
      ${files.length ? `<p>Found <strong>${esc(files[0].path)}</strong>, last saved ${new Date(files[0].lastModified).toLocaleString('en-GB', { dateStyle: 'medium', timeStyle: 'short' })}.${files.length > 1 ? ` <span class="muted small">Also found: ${files.slice(1).map((f) => esc(f.path)).join(', ')}</span>` : ''}</p>
        ${state.tracker ? '<button id="check-timeline" class="primary">Check for changes needed</button>' : ''}`
        : '<p class="hot">No spreadsheet with "timeline" in its name was found in APP Projects or APP Framework.</p>'}
      ${renderSheetUpdate()}
      ${results}
      <hr>
      ${renderImportTab()}`;
  }

  async function checkTimeline(quiet) {
    try {
      const f = state.timelineFiles[0];
      const parsed = await trackerImport.parseTracker(await (await f.handle.getFile()).arrayBuffer());
      state.timeline = { file: f.path, result: timelineCheck.checkTimeline(state.tracker, parsed), plan: xlsxWrite.plan(parsed, state.tracker) };
      if (quiet !== true) { state.message = null; render(); }
    } catch (e) {
      flash('error', `Couldn't check the spreadsheet: ${e.message}`);
    }
  }

  async function saveTimelineList() {
    try {
      const d = docx.create();
      d.title('APP timeline and status: changes to make');
      d.note(`Generated on ${fmtDate(TODAY)} from ${state.timeline.file}.`);
      for (const r of state.timeline.result.results) {
        d.h2(`${r.iv.id} ${r.iv.name}`);
        for (const it of r.items) d.bullet([{ text: `${KIND[it.kind][0]}: `, bold: true }, it.text]);
      }
      const path = await folder.saveReport(state.conn, `Timeline changes - ${TODAY}.docx`, await d.toBlob());
      flash('ok', `Saved to ${path}.`);
    } catch (e) {
      flash('error', `Couldn't save: ${e.message}`);
    }
  }

  async function importFound() {
    const f = state.timelineFiles[0];
    const file = await f.handle.getFile();
    await onImportFile(new File([await file.arrayBuffer()], f.name));
  }

  function renderImportTab() {
    const p = state.pendingImport;
    let preview = '';
    if (p) {
      const byStrand = p.parsed.strands.map((s) => {
        const list = p.parsed.interventions.filter((iv) => iv.strand === s.number);
        return `<tr><th scope="row">Strand ${s.number}: ${esc(s.name)}</th><td class="num">${list.length}</td></tr>`;
      }).join('');
      const c = countsFor(p.tracker.interventions);
      const ch = p.changes;
      const changeList = state.tracker ? `<h3>Changes to the current tracker</h3><ul>
          <li>${ch.added.length} added${ch.added.length ? `: ${ch.added.join(', ')}` : ''}</li>
          <li>${ch.updated.length} updated${ch.updated.length ? `: ${esc(ch.updated.join('; '))}` : ''}</li>
          <li>${ch.missing.length} in the tracker but not the spreadsheet${ch.missing.length ? `: ${ch.missing.join(', ')}` : ''}</li>
          ${ch.statusDiffers.length ? `<li>Status differs, and the tool's status is kept: ${esc(ch.statusDiffers.join('; '))}</li>` : ''}
        </ul>` : '';
      preview = `<section class="panel" id="import-preview">
        <h3>${esc(p.fileName)}</h3>
        <p>${p.parsed.interventions.length} interventions across ${p.parsed.strands.length} strands.
          ${model.COMMITTEE_CATEGORIES.map((k) => `${esc(k)}: <strong>${c[k]}</strong>`).join(' · ')}</p>
        <div class="table-wrap"><table class="grid narrow"><tbody>${byStrand}</tbody></table></div>
        ${changeList}
        ${p.parsed.warnings.length ? `<details><summary>${p.parsed.warnings.length} note${p.parsed.warnings.length === 1 ? '' : 's'} on the file</summary><ul>${p.parsed.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></details>` : ''}
        <button id="save-import" class="primary">${state.tracker ? 'Update the tracker' : 'Save as the tracker'}</button>
        ${state.tracker ? '<p class="muted small">The current tracker is copied to a backups folder first.</p>' : ''}
      </section>`;
    }
    return `<h2>Import the tracker</h2>
      <p class="muted">Choose the <strong>APP timeline and status</strong> spreadsheet. The tool reads the "${trackerImport.SHEET}" sheet and saves it as <code>${folder.DATA}/${folder.TRACKER}</code> inside ${esc(folder.PROJECTS)}.
      After the first import, the tool's copy is the master and holds live status. Importing again updates names, descriptions, targets and timeline dates, and keeps the statuses recorded here.</p>
      ${state.timelineFiles && state.timelineFiles.length ? `<button id="import-found" class="quiet">Import from ${esc(state.timelineFiles[0].name)}</button> <span class="muted small">or</span>` : ''}
      <label class="file"><input type="file" id="xlsx" accept=".xlsx"> <span>Choose a spreadsheet</span></label>
      ${preview}`;
  }

  function render() {
    const main = $('#main');
    const msg = state.message ? `<div class="msg ${state.message.kind}" role="status">${esc(state.message.text)}</div>` : '';

    if (!('showDirectoryPicker' in window)) {
      main.innerHTML = '<div class="msg error">This browser can\'t open local folders. Please use Chrome or Edge on your laptop.</div>';
      return;
    }

    $('#hello').textContent = state.yourName ? `Hi ${state.yourName}, welcome to the APP tracker` : 'APP tracking and reporting';
    $('#folder-status').innerHTML = state.conn
      ? `Connected to <strong>${esc(state.conn.root.name || 'folder')}</strong> <button id="change-folder" class="quiet">Change</button>`
      : '';

    if (!state.conn) {
      $('#tabs').innerHTML = '';
      main.innerHTML = `${msg}<section class="panel intro">
        <h2>Connect your APP folder</h2>
        <p>Choose the <strong>APP Framework</strong> folder in OneDrive - Middlesex University. The tool works with the ${esc(folder.PROJECTS)} folder inside it.
        Everything is read and saved on this laptop. Nothing is sent anywhere.</p>
        ${state.remembered ? `<button id="reconnect" class="primary">Reconnect to ${esc(state.remembered.name)}</button> <button id="connect" class="quiet">Choose a different folder</button>` : '<button id="connect" class="primary">Choose folder</button>'}
      </section>`;
      return;
    }

    const tabs = [['progress', 'Progress'], ['meeting', 'Updates'], ['interventions', 'Interventions'], ['fund', 'Fund projects'], ['audit', 'Theory of Change audit']];
    $('#tabs').innerHTML = tabs.map(([k, l]) => `<button role="tab" aria-selected="${state.tab === k}" data-tab="${k}">${l}</button>`).join('');
    const views = { how: renderHowTab, progress: renderProgressTab, interventions: renderInterventionsTab, fund: renderFundTab, reporting: renderReportingTab, audit: renderAuditTab, timeline: renderTimelineTab, meeting: renderMeetingTab, how: renderHowTab };
    const body = (views[state.tab] || renderProgressTab)();
    main.innerHTML = nudgeBanner() + msg + body;
  }

  // ---------- events ----------

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'connect' || t.id === 'change-folder') connect();
    else if (t.id === 'reconnect') reconnect();
    else if (t.id === 'save-import') saveImport();
    else if (t.id === 'run-audit') runAudit();
    else if (t.id === 'save-summary') saveSummary();
    else if (t.id === 'copy-summary') copySummary();
    else if (t.id === 'check-timeline') checkTimeline();
    else if (t.id === 'save-timeline-list') saveTimelineList();
    else if (t.id === 'import-found') importFound();
    else if (t.id === 'apply-sheet') applySheet();
    else if (t.id === 'create-termly') createTermly();
    else if (t.id === 'create-annual') createAnnual();
    else if (t.id === 'create-annual-data') createAnnualData();
    else if (t.id === 'save-ics') saveIcs();
    else if (t.id === 'add-committee') {
      const deadline = $('#c-deadline').value, meeting = $('#c-meeting').value;
      if (!deadline && !meeting) { flash('error', 'Add a paper deadline or a meeting date.'); return; }
      state.tracker.settings = state.tracker.settings || {};
      state.tracker.settings.committees = (state.tracker.settings.committees || []).concat([{ id: model.newId('c'), name: $('#c-name').value.trim() || 'ESE Committee', deadline: deadline || null, meeting: meeting || null }]);
      persist('Committee date added.');
    }
    else if (t.dataset.delCommittee) {
      state.tracker.settings.committees = state.tracker.settings.committees.filter((c) => c.id !== t.dataset.delCommittee);
      persist();
    }
    else if (t.dataset.goStrand) { state.tab = 'progress'; state.sub = 'strands'; setStrand(t.dataset.goStrand); }
    else if (t.dataset.received) { recordContact(t.dataset.received, 'responseReceived'); persist(`Strand ${t.dataset.received} response recorded as received.`); }
    else if (t.dataset.response) {
      state.meetingText = responseTemplate(t.dataset.response);
      state.pasteOpen = true;
      recordContact(t.dataset.response, 'responseReceived');
      state.tab = 'meeting';
      persist('Fill in the response under each intervention, then preview and save.');
    }
    else if (t.dataset.saveReason) {
      const input = document.querySelector(`[data-reason-for="${CSS.escape(t.dataset.saveReason)}"]`);
      if (!input.value.trim()) return;
      state.tracker.notes = state.tracker.notes || [];
      state.tracker.notes.push({ id: model.newId('n'), interventionId: t.dataset.saveReason, type: 'Reason for delay', text: input.value.trim(), date: TODAY });
      persist('Reason saved.');
    }
    else if (t.id === 'save-success') {
      const text = $('#success-text').value.trim();
      if (!text) return;
      state.tracker.notes = state.tracker.notes || [];
      state.tracker.notes.push({ id: model.newId('n'), interventionId: $('#success-iv').value, type: 'Success', text, date: TODAY });
      persist('Success saved.');
    }
    else if (t.id === 'preview-update') previewUpdate();
    else if (t.id === 'open-paste') { state.pasteOpen = !state.pasteOpen; render(); if (state.pasteOpen) $('#meeting-text').focus(); }
    else if (t.id === 'save-update') saveUpdate();
    else if (t.dataset.add) addEntry(t.dataset.add);
    else if (t.id === 'save-plans') savePlans();
    else if (t.dataset.adddata) addData(t.dataset.adddata);
    else if (t.dataset.deldata) {
      const [ivId, xId] = t.dataset.deldata.split('|');
      const iv = findIv(ivId);
      if (!window.confirm('Delete this data requirement?')) return;
      iv.dataNeeds = (iv.dataNeeds || []).filter((x) => x.id !== xId);
      persist('Data requirement removed.');
    }
    else if (t.dataset.agree) {
      const iv = findIv(t.dataset.agree);
      const input = document.querySelector(`[data-agreewith="${CSS.escape(iv.id)}"]`);
      plans.agreePlan(iv, input ? input.value.trim() : '', TODAY);
      state.tracker.notes = state.tracker.notes || [];
      state.tracker.notes.push({ id: model.newId('n'), interventionId: iv.id, type: 'Decision', text: `Delivery and data plan agreed${iv.plan.agreedWith ? ` with ${iv.plan.agreedWith}` : ''}`, date: TODAY });
      persist(`${iv.id} plan recorded as agreed. Later date changes will show as slippage.`);
    }
    else if (t.dataset.tab) {
      // Committee reporting and the timeline spreadsheet now sit under Progress.
      const k = t.dataset.tab;
      if (k === 'reporting' || k === 'timeline') { state.tab = 'progress'; state.sub = k; }
      else { state.tab = k; if (k === 'interventions' || k === 'fund') state.ivPage = null; }
      state.message = null; render(); window.scrollTo(0, 0);
    }
    else if (t.id === 'help') { state.tab = 'how'; state.message = null; render(); }
    else if (t.dataset.sub) { state.sub = t.dataset.sub; state.message = null; render(); }
    else if (t.dataset.cat) {
      const next = { cat: t.dataset.cat, strand: t.dataset.catStrand || null, round: t.dataset.catRound || null };
      state.cat = state.cat && state.cat.cat === next.cat && state.cat.strand === next.strand && state.cat.round === next.round ? null : next;
      render();
    }
    else if (t.dataset.catClear) { state.cat = null; render(); }
    else if (t.dataset.iv) { state.tab = isFund(findIv(t.dataset.iv)) ? 'fund' : 'interventions'; state.ivPage = t.dataset.iv; state.message = null; render(); window.scrollTo(0, 0); }
    else if (t.dataset.ivBack) { state.ivPage = null; state.message = null; render(); }
    else if (t.dataset.ddel) {
      const [ivId, dId] = t.dataset.ddel.split('|');
      const iv = findIv(ivId);
      const item = (iv.deliverables || []).find((x) => x.id === dId);
      if (!window.confirm(`Delete "${item.title}"?`)) return;
      iv.deliverables = iv.deliverables.filter((x) => x.id !== dId);
      persist('Deleted.');
    }
    else if (t.dataset.addnote) addNote(t.dataset.addnote);
    else if (t.dataset.edit) { state.editing = t.dataset.edit; render(); }
    else if (t.dataset.editDone) { state.editing = null; render(); }
    else if (t.dataset.myics) saveMyIcs(t.dataset.myics);
    else if (t.id === 'pick-fund') connectFund({ pick: true });
    else if (t.id === 'reconnect-fund') connectFund();
    else if (t.id === 'read-fund') readFund();
    else if (t.id === 'add-fund') {
      const f = $('#fund-add');
      const name = f.querySelector('[name=name]').value.trim();
      if (!name) { flash('error', 'Add the project name first.'); return; }
      const round = Number(f.querySelector('[name=round]').value);
      state.tracker.fundProjects = state.tracker.fundProjects || [];
      const known = fund.rounds(state.tracker).find((r) => r.round === round);
      const p = { id: fund.nextId(state.tracker.fundProjects, round), round, roundLabel: known ? known.label : `Round ${round}`, name, lead: f.querySelector('[name=lead]').value.trim(),
        status: 'On track', description: '', deliverables: [], dataNeeds: [], addedOn: TODAY };
      state.tracker.fundProjects.push(p);
      persist(`Added ${p.id} ${p.name}.`);
    }
    else if (t.dataset.copy) { const [which, id] = t.dataset.copy.split('|'); copyTables(findIv(id), which); }
    else if (t.dataset.savePlan) savePlans(t.dataset.savePlan);
    else if (t.dataset.opendoc) openDocCopy(t.dataset.opendoc);
    else if (t.id === 'save-docs-url') {
      const v = $('#docs-url').value.trim();
      if (!/^https:\/\//.test(v)) { flash('error', 'Paste the full web address, starting https://'); return; }
      // A folder copied from SharePoint's address bar carries its real path in ?id=.
      let base = v.split('?')[0];
      try { const u = new URL(v); const id = u.searchParams.get('id'); if (id) base = u.origin + id.split('/').map(encodeURIComponent).join('/'); } catch { /* keep as typed */ }
      state.tracker.settings = { ...(state.tracker.settings || {}), [t.dataset.urlKey || 'docsUrl']: base };
      persist('Project documents now link to SharePoint.');
    }
    else if (t.dataset.strand) setStrand(t.dataset.strand);
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'xlsx' && e.target.files[0]) onImportFile(e.target.files[0]);
    if (e.target.id === 'nonbau') { state.nonBauOnly = e.target.checked; render(); }
    if (e.target.id === 'showdone') { state.showDone = e.target.checked; render(); }
    if (e.target.id === 'your-name') {
      state.yourName = e.target.value.trim();
      state.tracker.settings = { ...(state.tracker.settings || {}), yourName: state.yourName };
      persist();
    }
    if (e.target.id === 'update-file' && e.target.files[0]) loadUpdateFile(e.target.files[0]);
    const d = e.target.dataset || {};
    if (d.statusFor) {
      const iv = findIv(d.statusFor);
      const from = iv.status;
      iv.status = e.target.value;
      state.tracker.notes = state.tracker.notes || [];
      state.tracker.notes.push({ id: model.newId('n'), interventionId: iv.id, type: 'Status change', text: `${from || 'No status'} to ${iv.status}`, date: TODAY });
      persist(`${iv.id} status set to ${iv.status}.`);
    }
    if (d.deliv) {
      const [ivId, dId] = d.deliv.split('|');
      const item = (findIv(ivId).deliverables || []).find((x) => x.id === dId);
      item.status = e.target.value;
      if (item.status === 'Done') item.doneOn = TODAY;
      persist();
    }
    if (d.due) {
      const [ivId, dId] = d.due.split('|');
      const iv = findIv(ivId);
      const item = (iv.deliverables || []).find((x) => x.id === dId);
      const to = e.target.value || null;
      // Before agreement, dates are still being drafted. After, ask why it moved.
      let reason = '';
      if (item.agreedDue && to !== item.due) {
        reason = (window.prompt(`Why has "${item.title}" moved? This is kept with the deliverable and added to the notes.`) || '').trim();
      }
      if (plans.moveDue(item, to, reason, TODAY)) {
        // A deliverable first dated after the plan was agreed takes that date as agreed.
        if (!item.agreedDue && to && iv.plan && iv.plan.agreedOn && item.kind !== 'action') item.agreedDue = to;
        if (item.agreedDue && to && to > item.agreedDue) {
          state.tracker.notes = state.tracker.notes || [];
          state.tracker.notes.push({ id: model.newId('n'), interventionId: ivId, type: 'Reason for delay', text: `${item.title} moved to ${fmtDate(to)}${reason ? `: ${reason}` : ''}`, date: TODAY });
        }
        persist();
      }
    }
    if (d.committee) {
      const [cId, field] = d.committee.split('|');
      const c = (state.tracker.settings.committees || []).find((x) => x.id === cId);
      const v = e.target.value.trim();
      if (field !== 'name' && !v && !(field === 'deadline' ? c.meeting : c.deadline)) { flash('error', 'Keep a paper deadline or a meeting date.'); return; }
      c[field] = field === 'name' ? (v || 'ESE Committee') : (v || null);
      persist('Committee date updated.');
    }
    if (d.dedit) {
      const [ivId, dId, field] = d.dedit.split('|');
      const item = (findIv(ivId).deliverables || []).find((x) => x.id === dId);
      const v = e.target.value.trim();
      if (field === 'title' && !v) { render(); return; }
      item[field] = v;
      if (field === 'kind' && v === 'deliverable' && !item.agreedDue && item.due && findIv(ivId).plan && findIv(ivId).plan.agreedOn) item.agreedDue = item.due;
      persist();
    }
    if (d.xedit) {
      const [ivId, xId, field] = d.xedit.split('|');
      const x = (findIv(ivId).dataNeeds || []).find((y) => y.id === xId);
      const v = e.target.value.trim();
      if (field === 'what' && !v) { render(); return; }
      x[field] = field === 'due' ? (v || null) : v;
      persist();
    }
    if (d.datastatus) {
      const [ivId, xId] = d.datastatus.split('|');
      const x = (findIv(ivId).dataNeeds || []).find((y) => y.id === xId);
      x.status = e.target.value;
      if (x.status === 'Received') x.receivedOn = TODAY;
      persist();
    }
    if (d.tu) {
      const u = state.tracker.templateUpdates.find((x) => x.id === d.tu);
      u.done = e.target.checked;
      u.doneOn = u.done ? TODAY : null;
      persist();
    }
  });

  document.addEventListener('input', (e) => {
    if (e.target.id === 'meeting-text') state.meetingText = e.target.value;
  });

  // Add a note, action, deliverable or template change from a card's form.
  function addEntry(ivId) {
    const form = document.querySelector(`[data-form="${CSS.escape(ivId)}"]`);
    const get = (n) => form.querySelector(`[name="${n}"]`).value.trim();
    const type = get('type');
    const text = get('text');
    if (!text) { flash('error', 'Add some text first.'); return; }
    const iv = findIv(ivId);
    if (type === 'action' || type === 'deliverable') {
      iv.deliverables = iv.deliverables || [];
      const due = get('due') || null;
      iv.deliverables.push({ id: model.newId('d'), kind: type, title: text, owner: get('owner'), due, agreedDue: iv.plan && iv.plan.agreedOn && type === 'deliverable' ? due : null, status: 'Not started', date: TODAY, addedOn: TODAY });
    } else if (type === 'template') {
      state.tracker.templateUpdates = state.tracker.templateUpdates || [];
      state.tracker.templateUpdates.push({ id: model.newId('t'), interventionId: ivId, section: get('section'), text, raisedOn: TODAY, done: false });
    } else {
      state.tracker.notes = state.tracker.notes || [];
      state.tracker.notes.push({ id: model.newId('n'), interventionId: ivId, type, text, date: TODAY });
    }
    persist(`Added to ${ivId}.`);
  }

  (async function start() {
    if ('showDirectoryPicker' in window) {
      const h = await folder.remembered();
      if (h) {
        if (await folder.hasPermission(h, false)) {
          try { state.conn = await folder.reconnect(h); await afterConnect(); return; } catch { /* fall through */ }
        }
        state.remembered = h;
      }
    }
    render();
  })();
})();
