// Page logic: folder connection, strand view, template audit and tracker import.
(function () {
  const { model, folder, templates, trackerImport, meetingUpdate } = window.APPTool;
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
    tab: 'strand',
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
    if (!state.tracker) state.tab = 'import';
    state.message = null;
    render();
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
      state.tab = 'strand';
      flash('ok', `Saved to ${folder.PROJECTS}/${folder.DATA}/${folder.TRACKER}.`);
    } catch (e) {
      flash('error', `Couldn't save: ${e.message}`);
    }
  }

  // ---------- audit ----------

  async function runAudit() {
    flash('info', 'Checking templates…');
    try {
      const audit = await templates.auditTemplates(state.conn.projects, state.tracker, new Date().toISOString());
      state.audit = audit;
      // The template owns these fields; the tracker keeps a copy for the strand view.
      for (const r of audit.results) {
        const iv = state.tracker.interventions.find((x) => x.id === r.id);
        if (iv && !r.error) iv.template = r.template;
      }
      state.tracker.templatesCheckedAt = new Date().toISOString();
      await folder.saveTracker(state.conn.projects, state.tracker);
      flash('ok', `Checked ${audit.fileCount} template file${audit.fileCount === 1 ? '' : 's'} and updated the tracker.`);
    } catch (e) {
      flash('error', `The audit didn't finish: ${e.message}`);
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

  function renderUpdatesTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    let items = (state.tracker.templateUpdates || []).filter((u) => state.showDone || !u.done);
    if (state.strand !== 'all') items = items.filter((u) => (findIv(u.interventionId) || {}).strand === Number(state.strand));
    const byIv = new Map();
    for (const u of items) (byIv.get(u.interventionId) || byIv.set(u.interventionId, []).get(u.interventionId)).push(u);
    const ids = [...byIv.keys()].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    const groups = ids.map((id) => {
      const iv = findIv(id);
      const file = iv.template && iv.template.file;
      return `<section class="panel tight" data-id="${esc(id)}">
        <h3><span class="id">${esc(id)}</span> ${esc(iv.name)}</h3>
        <p class="small ${file ? 'muted' : 'hot'}">${file ? esc(file) : 'No project template yet. Create one first.'}</p>
        <ul class="tu">${byIv.get(id).sort((a, b) => model.TEMPLATE_SECTIONS.indexOf(a.section) - model.TEMPLATE_SECTIONS.indexOf(b.section)).map((u) => `<li class="${u.done ? 'is-done' : ''}">
          <label><input type="checkbox" data-tu="${esc(u.id)}" ${u.done ? 'checked' : ''}> <strong>${esc(u.section)}:</strong> ${esc(u.text)}</label>
          <span class="muted small">raised ${fmtDate(u.raisedOn)}${u.done && u.doneOn ? `, done ${fmtDate(u.doneOn)}` : ''}</span></li>`).join('')}</ul>
      </section>`;
    });
    return `<div class="bar">${strandTabs()}<label class="small"><input type="checkbox" id="showdone" ${state.showDone ? 'checked' : ''}> Show done</label></div>
      <h2>Project template changes</h2>
      <p class="muted">Changes raised in meetings that need making in the project templates. Tick each one once the template is updated, then run the template audit to refresh the tool's copy.</p>
      ${groups.join('') || '<p class="muted">Nothing outstanding.</p>'}`;
  }

  function renderStrandTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    const title = state.strand === 'all' ? 'All strands' : `Strand ${state.strand}: ${esc(strandName(state.strand))}`;
    return `<div class="bar">${strandTabs()}<span class="muted small">Checked against ${fmtDate(TODAY)}</span></div>
      <h2>${title}</h2>
      ${state.strand === 'all' ? renderOverview() : renderStrand(state.strand)}`;
  }

  function renderAuditTab() {
    if (!state.tracker) return '<p>Import the tracker first.</p>';
    const checked = state.tracker.templatesCheckedAt;
    let list = state.tracker.interventions;
    if (state.strand !== 'all') list = list.filter((iv) => iv.strand === Number(state.strand));
    if (state.nonBauOnly) list = list.filter((iv) => iv.status !== 'BAU');
    const extra = state.audit ? new Map(state.audit.results.map((r) => [r.id, r])) : new Map();

    const rows = list.map((iv) => {
      const r = extra.get(iv.id) || {};
      const t = iv.template;
      let state_ = '<span class="pill risk">Missing</span>';
      if (r.error) state_ = `<span class="pill risk" title="${esc(r.error)}">Unreadable</span>`;
      else if (t) state_ = templates.completeness(t).complete ? '<span class="pill ok">Complete</span>' : '<span class="pill warn">Incomplete</span>';
      else if (!checked) state_ = '<span class="muted">Not checked</span>';
      const flag = (v) => `<span class="chip ${v === 'Completed' ? 'ok' : v === 'In progress' ? 'warn' : ''}">${esc(v || 'Not set')}</span>`;
      return `<tr data-id="${esc(iv.id)}">
        <td>${esc(iv.id)}</td>
        <td>${esc(iv.name)}${t && t.file ? `<div class="muted small">${esc(t.file)}</div>` : ''}${r.others && r.others.length ? `<div class="small hot">Also found: ${r.others.map(esc).join(', ')}</div>` : ''}</td>
        <td>${state_}</td>
        <td>${t ? flag(t.complete.timeframes) : ''}</td>
        <td>${t ? flag(t.complete.theoryOfChange) : ''}</td>
        <td>${t ? flag(t.complete.evaluation) : ''}</td>
        <td>${t ? esc(t.status || '') : ''}</td>
        <td>${t ? fmtDate(t.lastUpdated) : ''}</td>
      </tr>`;
    });

    const missing = list.filter((iv) => !iv.template).length;
    const unmatched = state.audit && state.audit.unmatched.length
      ? `<p class="small">Template files that don't match a tracker row: ${state.audit.unmatched.map(esc).join(', ')}</p>` : '';

    return `<div class="bar">${strandTabs()}
        <label class="small"><input type="checkbox" id="nonbau" ${state.nonBauOnly ? 'checked' : ''}> Non-BAU only</label>
        <button id="run-audit" class="primary">${checked ? 'Check again' : 'Check templates'}</button></div>
      <h2>Template audit</h2>
      <p class="muted">Looks in each strand folder inside ${esc(folder.PROJECTS)} for Word files named like <code>APP6.3 - Name.docx</code>, and reads the completion flags and dates from each one.
        ${checked ? `Last checked ${fmtDate(checked.slice(0, 10))}. ${missing} of ${list.length} shown have no readable template.` : ''}</p>
      <div class="table-wrap"><table class="grid">
        <thead><tr><th>#</th><th>Intervention</th><th>Template</th><th>Timeframes</th><th>Theory of change</th><th>Evaluation</th><th>Template status</th><th>Last updated</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table></div>${unmatched}`;
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
      <label class="file"><input type="file" id="xlsx" accept=".xlsx"> <span>Choose spreadsheet</span></label>
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

    const tabs = [['strand', 'Strands'], ['meeting', 'Meeting update'], ['updates', 'Template changes'], ['audit', 'Template audit'], ['import', 'Import tracker']];
    $('#tabs').innerHTML = tabs.map(([k, l]) => `<button role="tab" aria-selected="${state.tab === k}" data-tab="${k}">${l}</button>`).join('');
    const views = { audit: renderAuditTab, import: renderImportTab, meeting: renderMeetingTab, updates: renderUpdatesTab };
    const body = (views[state.tab] || renderStrandTab)();
    main.innerHTML = msg + body;
  }

  // ---------- events ----------

  document.addEventListener('click', (e) => {
    const t = e.target.closest('button');
    if (!t) return;
    if (t.id === 'connect' || t.id === 'change-folder') connect();
    else if (t.id === 'reconnect') reconnect();
    else if (t.id === 'save-import') saveImport();
    else if (t.id === 'run-audit') runAudit();
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
