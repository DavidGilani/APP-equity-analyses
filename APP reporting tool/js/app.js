// Page logic: folder connection, strand view, template audit and tracker import.
(function () {
  const { model, folder, templates, trackerImport, meetingUpdate, reports, timelineCheck, docx, xlsxWrite, paperFill, reporting } = window.APPTool;
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
    meetingText: '',
    showDone: false,
    yourName: 'David',
    lastSnapshot: null,
    timelineFiles: [],
    timeline: null,
    papers: [],
    fillReport: null,
    tab: 'progress',
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

  const findIv = (id) => state.tracker.interventions.find((x) => x.id === id);

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
    if (!state.tracker) state.tab = 'timeline';
    state.message = null;
    try { state.timelineFiles = await folder.findTimelineFile(state.conn); } catch { state.timelineFiles = []; }
    try { state.papers = (await folder.committeePapers(state.conn)).papers; } catch { state.papers = []; }
    if (state.tracker) {
      state.yourName = (state.tracker.settings && state.tracker.settings.yourName) || state.yourName;
      try { state.lastSnapshot = await folder.latestSnapshot(state.conn.projects); } catch { state.lastSnapshot = null; }
    }
    render();
    if (state.tracker) runAudit({ quiet: true });
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
    const cls = { 'BAU': 'bau', 'On track': 'ok', 'To be mapped': 'map', 'Behind schedule / at risk': 'risk' }[cat] || 'map';
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

  function renderOverview() {
    const rows = state.tracker.strands.map((s) => {
      const list = state.tracker.interventions.filter((iv) => iv.strand === s.number);
      const c = countsFor(list);
      const flagged = list.filter((iv) => ['behind', 'soon'].includes(model.overallFlag(iv, TODAY))).length;
      return `<tr data-strand-row="${s.number}">
        <th scope="row"><button class="link" data-strand="${s.number}">Strand ${s.number}: ${esc(s.name)}</button></th>
        ${model.COMMITTEE_CATEGORIES.map((k) => `<td class="num">${c[k]}</td>`).join('')}
        <td class="num">${list.length}</td>
        <td class="num ${flagged ? 'hot' : ''}">${flagged}</td>
      </tr>`;
    });
    const all = countsFor(state.tracker.interventions);
    return `<div class="table-wrap"><table class="grid">
      <thead><tr><th>Strand</th>${model.COMMITTEE_CATEGORIES.map((k) => `<th class="num">${esc(k)}</th>`).join('')}<th class="num">Total</th><th class="num">Flagged</th></tr></thead>
      <tbody>${rows.join('')}</tbody>
      <tfoot><tr><th>All strands</th>${model.COMMITTEE_CATEGORIES.map((k) => `<td class="num">${all[k]}</td>`).join('')}<td class="num">${state.tracker.interventions.length}</td><td></td></tr></tfoot>
    </table></div>
    <p class="muted small">Status counts use the committee's four categories. "Flagged" counts interventions that are behind their planned stage, due to move stage within 14 days, or have deliverables or actions overdue, blocked or due within 14 days.</p>`;
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

  function deliverablesBlock(iv) {
    const all = iv.deliverables || [];
    const list = all
      .filter((d) => state.showDone || d.status !== 'Done')
      .sort((a, b) => (a.status === 'Done') - (b.status === 'Done') || (a.due || '9999').localeCompare(b.due || '9999'));
    const doneCount = all.filter((d) => d.status === 'Done').length;
    if (!all.length) return '<p class="muted small">None recorded yet.</p>';
    return `<ul class="deliv">${list.map((d) => `<li class="${d.status === 'Done' ? 'is-done' : ''}">
        <span class="chip">${d.kind === 'action' ? 'Action' : 'Deliverable'}</span>
        <span class="deliv-title">${esc(d.title)}</span>
        <span class="muted small">${esc(d.owner || 'No owner')}</span>
        <span class="small ${dueClass(d)}">${d.due ? fmtDate(d.due) : '<span class="muted">No date</span>'}</span>
        <select data-deliv="${esc(iv.id)}|${esc(d.id)}" aria-label="Status">${model.DELIVERABLE_STATUSES.map((s) => `<option ${s === d.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
      </li>`).join('')}</ul>
      ${doneCount && !state.showDone ? `<p class="muted small">${doneCount} done and hidden.</p>` : ''}`;
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

  function addForm(iv) {
    return `<details class="record"><summary>Add a note, action or template change</summary>
      <div class="record-form" data-form="${esc(iv.id)}">
        <label>Type <select name="type">
          ${model.NOTE_TYPES.map((t) => `<option>${t}</option>`).join('')}
          <option value="action">Action</option><option value="deliverable">Deliverable</option><option value="template">Template change</option>
        </select></label>
        <label class="grow">Text <input name="text" type="text" autocomplete="off"></label>
        <label>Owner <input name="owner" type="text" size="10" autocomplete="off"></label>
        <label>Due <input name="due" type="date"></label>
        <label>Template section <select name="section">${model.TEMPLATE_SECTIONS.map((s) => `<option>${s}</option>`).join('')}</select></label>
        <button class="primary" data-add="${esc(iv.id)}">Add</button>
      </div>
      <p class="muted small">Owner and due date apply to actions and deliverables. Template section applies to template changes.</p>
    </details>`;
  }

  function renderStrand(n) {
    const list = state.tracker.interventions.filter((iv) => iv.strand === Number(n));
    const c = countsFor(list);
    const cards = list.map((iv) => {
      const check = model.slipCheck(iv, TODAY);
      const dcheck = model.deliverableCheck(iv, TODAY);
      const flag = model.overallFlag(iv, TODAY);
      const flagText = [check.flag !== 'bau' ? check.text : '', dcheck.text ? `Deliverables and actions: ${dcheck.text}` : ''].filter(Boolean).join('. ');
      return `<article class="card flag-${flag}" data-id="${esc(iv.id)}">
        <header>
          <h3><span class="id">${esc(iv.id)}</span> ${esc(iv.name)}</h3>
          <div class="pills">
            <select class="status-select" data-status-for="${esc(iv.id)}" aria-label="Status">${model.STATUSES.map((s) => `<option ${s === iv.status ? 'selected' : ''}>${s}</option>`).join('')}</select>
            ${flag === 'bau' ? '' : flagPill({ flag, text: flagText })}
          </div>
        </header>
        <p class="desc">${esc(iv.description)}</p>
        <div class="facts">
          <div><h4>Where it should be</h4>${periodsText(iv)}</div>
          <div><h4>Stage check</h4><p>${esc(check.text)}</p>${dcheck.text ? `<p class="${dcheck.flag === 'behind' ? 'hot' : ''}">Deliverables and actions: ${esc(dcheck.text)}</p>` : ''}</div>
          <div><h4>Project template</h4><p>${templateText(iv)}</p></div>
        </div>
        ${templateUpdatesBlock(iv)}
        <div class="facts two">
          <div><h4>Deliverables and actions</h4>${deliverablesBlock(iv)}</div>
          <div><h4>Notes</h4>${notesBlock(iv)}</div>
        </div>
        ${addForm(iv)}
      </article>`;
    });
    return `<div class="counts">${model.COMMITTEE_CATEGORIES.map((k) => `<div><span class="big">${c[k]}</span><span>${esc(k)}</span></div>`).join('')}</div>
      <label class="small"><input type="checkbox" id="showdone" ${state.showDone ? 'checked' : ''}> Show finished deliverables and actions</label>
      ${cards.join('') || '<p class="muted">No interventions in this strand.</p>'}`;
  }

  function renderStrandTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    const title = state.strand === 'all' ? 'All strands' : `Strand ${state.strand}: ${esc(strandName(state.strand))}`;
    return `<div class="bar">${strandTabs()}<span class="muted small">Checked against ${fmtDate(TODAY)}</span></div>
      <h2>${title}</h2>
      ${state.strand === 'all' ? renderOverview() : renderStrand(state.strand)}`;
  }

  // ---------- meeting update ----------

  const EXAMPLE = `Meeting: Strand 6 catch-up with strand lead
Date: 22/09/2026

[6.2]
Update: Still investigating options. No decision yet.
Action: Invite the provider in to go through the details | owner: Strand lead | due: 30/10/2026
Deliverable: Decision on approach | owner: Strand lead | due: 18/12/2026
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
        <p>${p.groups.length} intervention${p.groups.length === 1 ? '' : 's'}: ${count('notes')} notes, ${count('deliverables')} actions and deliverables, ${count('templateUpdates')} template changes.</p>
        ${p.warnings.length ? `<div class="msg error"><strong>Check these before saving:</strong><ul>${p.warnings.map((w) => `<li>${esc(w)}</li>`).join('')}</ul></div>` : ''}
        ${!p.date ? '<p class="hot small">No date given, so today\'s date will be used.</p>' : ''}
        ${p.groups.map((g) => {
          const iv = findIv(g.id);
          return `<div class="preview-group"><h4>${esc(g.id)} ${esc(iv.name)}</h4><ul>
            ${g.status ? `<li><span class="chip warn">Status</span> ${esc(iv.status)} to ${esc(g.status)}</li>` : ''}
            ${g.notes.map((n) => `<li><span class="chip ${n.type === 'Risk' ? 'risk' : ''}">${esc(n.type)}</span> ${esc(n.text)}</li>`).join('')}
            ${g.deliverables.map((d) => `<li><span class="chip">${d.kind === 'action' ? 'Action' : 'Deliverable'}</span> ${esc(d.title)} <span class="muted small">${esc(d.owner || 'No owner')}, ${d.due ? fmtDate(d.due) : 'no date'}</span></li>`).join('')}
            ${g.templateUpdates.map((u) => `<li><span class="chip map">Template: ${esc(u.section)}</span> ${esc(u.text)}</li>`).join('')}
          </ul></div>`;
        }).join('')}
        <button id="save-update" class="primary" ${p.groups.length ? '' : 'disabled'}>Save to the tracker</button>
        <span class="muted small">The current tracker is copied to the backups folder first.</span>
      </section>`;
    }
    return `<h2>Meeting update</h2>
      <p class="muted">Paste a structured update from a meeting, check the preview, then save. Each line goes to the intervention heading above it.</p>
      <details class="panel help"><summary><strong>Format</strong></summary>
        <ul class="small">
          <li><code>Meeting:</code> and <code>Date:</code> at the top.</li>
          <li>An intervention heading in square brackets, like <code>[6.2]</code>.</li>
          <li><code>Update:</code>, <code>Risk:</code>, <code>Decision:</code>, <code>Scope change:</code> or <code>Question:</code> for notes.</li>
          <li><code>Action:</code> or <code>Deliverable:</code>, followed by <code>| owner: Name | due: dd/mm/yyyy</code>.</li>
          <li><code>Template: Section | what needs changing</code>, where the section is ${model.TEMPLATE_SECTIONS.map((s) => `<code>${s}</code>`).join(', ')}.</li>
          <li><code>Status:</code> to change the live status, using ${model.STATUSES.map((s) => `<code>${s}</code>`).join(', ')}.</li>
        </ul>
        <pre class="example">${esc(EXAMPLE)}</pre>
      </details>
      <textarea id="meeting-text" rows="16" spellcheck="true" placeholder="Paste the update here">${esc(state.meetingText)}</textarea>
      <div class="bar"><button id="preview-update" class="primary">Preview</button>
        <label class="file small"><input type="file" id="update-file" accept=".txt,.md"> or open a text file</label></div>
      ${preview}`;
  }

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
      if (first) state.strand = String(first.strand);
      state.tab = 'strand';
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

  function renderProgressTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    return `<div class="bar">${strandTabs()}<span class="muted small">As at ${fmtDate(TODAY)}</span></div>
      ${state.strand === 'all' ? `<h2>All strands</h2>${renderOverview()}<p><button class="quiet" data-tab="reporting">Committee reporting</button></p>` : renderStrandProgress(state.strand)}`;
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

  async function createCommittee() {
    try {
      const keep = document.getElementById('save-snap').checked;
      const { blob, snapshot } = reports.committeeDoc(state.tracker, TODAY, state.lastSnapshot);
      const path = await folder.saveReport(state.conn, `APP update - generated sections - ${TODAY}.docx`, await blob, { committee: true });
      let snapText = '';
      if (keep) {
        await folder.saveSnapshot(state.conn.projects, snapshot);
        state.lastSnapshot = snapshot;
        snapText = ' A snapshot was saved as the baseline for next time.';
      }
      flash('ok', `Saved to ${path}.${snapText}`);
    } catch (e) {
      flash('error', `Couldn't create the committee update: ${e.message}`);
    }
  }

  // ---------- reporting ----------

  function nudgeBanner() {
    if (!state.tracker) return '';
    const cyc = reporting.cycle(state.tracker, TODAY);
    if (!cyc.nudge || state.tab === 'reporting') return '';
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
    const draft = state.tracker.committeeDraft || { strandNotes: {} };
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
    return `<h2>Reporting</h2>
      <section class="panel">
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

      <h3 class="section">4. Table 2 notes by strand</h3>
      <p class="muted small">These go into the notes column of Table 2. Saved as you type.</p>
      <div class="strand-notes">${state.tracker.strands.map((s) => `<label><span>Strand ${s.number}: ${esc(s.name)}</span>
        <textarea rows="3" data-strand-note="${s.number}">${esc((draft.strandNotes || {})[s.number] || '')}</textarea></label>`).join('')}</div>

      <h3 class="section">5. Timeline spreadsheet</h3>
      <ul class="checklist">${group('Timeline spreadsheet').map((i) => `<li>${tick(i.ok)} ${esc(i.text)} <button class="quiet small-btn" data-tab="timeline">Open</button></li>`).join('')}</ul>

      <h3 class="section">6. Generate the paper</h3>
      <section class="panel">
        ${papers.length ? `<p>Latest paper in Committees and reporting: <strong>${esc(papers[0].name)}</strong>, saved ${new Date(papers[0].lastModified).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}.</p>` : '<p class="hot">No committee paper found in APP Framework/Committees and reporting.</p>'}
        <p class="muted small"><strong>Create the draft paper</strong> copies the latest paper and updates its status counts and Table 2, including the notes above. Everything else, including Tables 1 and 3, is kept for you to edit. It's saved as a new file; the original isn't changed.
          <strong>Create generated sections</strong> makes a separate document with the counts, Table 2, theory of change progress, and what changed, successes and reasons since the last snapshot.</p>
        <div class="bar start">
          ${papers.length ? '<button id="create-draft" class="primary">Create the draft paper</button>' : ''}
          <button id="create-committee" class="quiet">Create generated sections</button>
          <label class="small"><input type="checkbox" id="save-snap" checked> Save a snapshot as the baseline for next time</label>
        </div>
        ${state.fillReport ? `<div class="fill-report"><h4>What was updated in ${esc(state.fillReport.name)}</h4>
          <ul class="small">${state.fillReport.updated.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>
          ${state.fillReport.notFound.length ? `<h4>Not found, so update these by hand</h4><ul class="small">${state.fillReport.notFound.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>` : ''}
      </section>

      <h3 class="section">Committee dates</h3>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>Committee</th><th>Paper deadline</th><th>Meeting</th><th></th></tr></thead>
        <tbody>${list.map((c) => `<tr class="${c.meeting && c.meeting < TODAY ? 'is-done' : ''}"><td>${esc(c.name || 'ESE Committee')}</td><td>${fmtDate(c.deadline)}</td><td>${fmtDate(c.meeting)}</td>
          <td><button class="quiet small-btn" data-del-committee="${esc(c.id)}">Remove</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No dates yet.</td></tr>'}</tbody>
      </table></div>
      <div class="inline-form">
        <input type="text" id="c-name" value="ESE Committee" aria-label="Committee">
        <label class="small">Paper deadline <input type="date" id="c-deadline"></label>
        <label class="small">Meeting <input type="date" id="c-meeting"></label>
        <button class="quiet small-btn" id="add-committee">Add</button>
      </div>
      ${list.length ? '<p><button id="save-ics" class="quiet">Add reminders to Outlook</button> <span class="muted small">Saves a calendar file with reminders 4 weeks, 2 weeks and 3 days before each deadline. Open it to add them to Outlook.</span></p>' : ''}`;
  }

  function recordContact(strand, key) {
    state.tracker.strandContacts = state.tracker.strandContacts || {};
    state.tracker.strandContacts[strand] = { ...(state.tracker.strandContacts[strand] || {}), [key]: TODAY };
  }

  async function createDraftPaper() {
    try {
      const latest = state.papers[0];
      const counts = Object.fromEntries(model.COMMITTEE_CATEGORIES.map((k) => [k, 0]));
      const byStrand = {};
      for (const iv of state.tracker.interventions) {
        const k = model.committeeCategory(iv.status);
        byStrand[iv.strand] = byStrand[iv.strand] || Object.fromEntries(model.COMMITTEE_CATEGORIES.map((x) => [x, 0]));
        if (k) { counts[k]++; byStrand[iv.strand][k]++; }
      }
      const { blob, report } = await paperFill.fillPaper(await (await latest.handle.getFile()).arrayBuffer(),
        { counts, byStrand, strandNotes: (state.tracker.committeeDraft || {}).strandNotes });
      const cyc = reporting.cycle(state.tracker, TODAY);
      const name = paperFill.nextName(latest.name, cyc.next && cyc.next.meeting);
      const { dir } = await folder.committeePapers(state.conn);
      await folder.writeInDir(dir, name, blob);
      state.fillReport = { name, ...report };
      if (document.getElementById('save-snap').checked) {
        const snap = reports.snapshot(state.tracker, TODAY);
        await folder.saveSnapshot(state.conn.projects, snap);
        state.lastSnapshot = snap;
      }
      flash('ok', `Saved the draft as Committees and reporting/${name}.`);
    } catch (e) {
      flash('error', `Couldn't create the draft: ${e.message}`);
    }
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

        ${box(770, 124, 200, 56, 'Outlook reminders', '4 weeks, 2 weeks, 3 days')}
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
      [110, '4 weeks before', 'Send each strand', 'lead their summary'],
      [320, '2 weeks before', 'Record responses,', 'reasons and successes'],
      [530, '3 days before', 'Update spreadsheet,', 'create draft paper'],
      [740, 'Paper deadline', 'Edit the narrative', 'and submit'],
      [910, 'Committee', 'Snapshot becomes', 'the next baseline'],
    ];
    return `<figure class="diagram">
      <svg viewBox="0 0 1000 200" role="img" aria-label="The reporting cycle: four weeks before the paper deadline, send strand summaries; two weeks before, record responses, reasons for delay and successes; three days before, update the timeline spreadsheet and create the draft paper; at the deadline, edit and submit; at the committee, the snapshot becomes the baseline for next time. The Reporting tab nudges from 28 days before.">
        <rect x="110" y="40" width="630" height="22" rx="6" class="dg-band"/>
        <text x="425" y="56" text-anchor="middle" class="dg-label">the Reporting tab and Outlook reminders nudge you</text>
        <line x1="40" y1="100" x2="960" y2="100" class="dg-line"/>
        ${steps.map(([x, when, a, b], i) => `
          <circle cx="${x}" cy="100" r="${i === 3 ? 8 : 6}" class="${i === 3 ? 'dg-dot-accent' : 'dg-dot'}"/>
          <text x="${x}" y="130" text-anchor="middle" class="dg-title">${when}</text>
          <text x="${x}" y="150" text-anchor="middle" class="dg-sub">${a}</text>
          <text x="${x}" y="166" text-anchor="middle" class="dg-sub">${b}</text>`).join('')}
      </svg>
      <figcaption>The run-up to each committee paper. Add the committee dates on the Reporting tab, and the tool counts down to the next deadline and shows what is still needed.</figcaption>
    </figure>`;
  }

  function renderHowTab() {
    return `<h2>How it works</h2>
      ${flowFigure()}
      ${cycleFigure()}
      <div class="how-grid">
        <section class="panel tight"><h3>Before a strand lead catch-up</h3>
          <ol class="small"><li>Open <strong>Progress</strong> and choose the strand.</li><li>Check your actions, the team's actions, and anything flagged.</li><li>Save or copy the summary to send ahead of the meeting.</li></ol></section>
        <section class="panel tight"><h3>During and after the meeting</h3>
          <ol class="small"><li>Record changes on <strong>Interventions</strong>, or paste a structured update on <strong>Meeting update</strong>.</li><li>Changes to project plans go on the <strong>Theory of Change audit</strong> checklist.</li><li>Once a template's dates change, <strong>Timeline spreadsheet</strong> updates the Gantt.</li></ol></section>
        <section class="panel tight"><h3>Each committee cycle</h3>
          <ol class="small"><li>Follow the <strong>Reporting</strong> checklist from four weeks out.</li><li>Create the draft paper from your latest paper.</li><li>Edit the narrative and Tables 1 and 3, then submit.</li></ol></section>
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

    const tabs = [['progress', 'Progress'], ['reporting', 'Reporting'], ['strand', 'Interventions'], ['meeting', 'Meeting update'], ['audit', 'Theory of Change audit'], ['timeline', 'Timeline spreadsheet'], ['how', 'How it works']];
    $('#tabs').innerHTML = tabs.map(([k, l]) => `<button role="tab" aria-selected="${state.tab === k}" data-tab="${k}">${l}</button>`).join('');
    const views = { progress: renderProgressTab, reporting: renderReportingTab, audit: renderAuditTab, timeline: renderTimelineTab, meeting: renderMeetingTab, how: renderHowTab };
    const body = (views[state.tab] || renderStrandTab)();
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
    else if (t.id === 'create-committee') createCommittee();
    else if (t.id === 'check-timeline') checkTimeline();
    else if (t.id === 'save-timeline-list') saveTimelineList();
    else if (t.id === 'import-found') importFound();
    else if (t.id === 'apply-sheet') applySheet();
    else if (t.id === 'create-draft') createDraftPaper();
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
    else if (t.dataset.goStrand) { state.tab = 'progress'; setStrand(t.dataset.goStrand); }
    else if (t.dataset.received) { recordContact(t.dataset.received, 'responseReceived'); persist(`Strand ${t.dataset.received} response recorded as received.`); }
    else if (t.dataset.response) {
      state.meetingText = responseTemplate(t.dataset.response);
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
    else if (t.id === 'save-update') saveUpdate();
    else if (t.dataset.add) addEntry(t.dataset.add);
    else if (t.dataset.tab) { state.tab = t.dataset.tab; state.message = null; render(); }
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
    if (e.target.id === 'update-file' && e.target.files[0]) {
      e.target.files[0].text().then((txt) => { state.meetingText = txt; previewUpdate(); });
    }
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
    if (d.tu) {
      const u = state.tracker.templateUpdates.find((x) => x.id === d.tu);
      u.done = e.target.checked;
      u.doneOn = u.done ? TODAY : null;
      persist();
    }
  });

  let noteTimer = null;
  document.addEventListener('input', (e) => {
    if (e.target.id === 'meeting-text') state.meetingText = e.target.value;
    if (e.target.dataset && e.target.dataset.strandNote) {
      state.tracker.committeeDraft = state.tracker.committeeDraft || { strandNotes: {} };
      state.tracker.committeeDraft.strandNotes = { ...(state.tracker.committeeDraft.strandNotes || {}), [e.target.dataset.strandNote]: e.target.value };
      clearTimeout(noteTimer);
      // Save quietly without re-rendering, so typing isn't interrupted.
      noteTimer = setTimeout(() => folder.saveTracker(state.conn.projects, state.tracker).catch((err) => flash('error', `Couldn't save: ${err.message}`)), 800);
    }
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
      iv.deliverables.push({ id: model.newId('d'), kind: type, title: text, owner: get('owner'), due: get('due') || null, status: 'Not started', date: TODAY });
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
