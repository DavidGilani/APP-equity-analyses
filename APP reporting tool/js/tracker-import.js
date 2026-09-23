// Turns the "APP timeline and status" workbook into tracker records.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});
  const SHEET = 'APP Timeline';

  const TARGET_HEADINGS = [
    ['continuationBtec', /continuation\s*btec/i],
    ['completionFsm', /completion\s*fsm/i],
    ['completionBtec', /completion\s*btec/i],
    ['attainmentAbmo', /attainment\s*abmo/i],
    ['attainmentFsm', /attainment\s*fsm/i],
    ['attainmentImd', /attainment\s*imd/i],
    ['attainmentBtec', /attainment\s*btec/i],
    ['progressionFif', /progression\s*first/i],
    ['progressionBtec', /progression\s*btec/i],
  ];

  function iso(ms) {
    return new Date(ms).toISOString().slice(0, 10);
  }

  function normTarget(v) {
    const s = String(v || '').trim().toLowerCase();
    if (s === 'y' || s === 'yes') return 'Y';
    if (s === 'n' || s === 'no') return 'N';
    if (s.startsWith('partial')) return 'Partial';
    return s ? String(v).trim() : null;
  }

  async function parseTracker(data) {
    const sheet = await APP.xlsx.readSheet(data, SHEET);
    const { model } = APP;
    const warnings = [];
    const clean = (v) => (v == null ? '' : String(v).replace(/\s+/g, ' ').trim());

    // Locate columns from the heading row.
    let descCol = null, statusCol = null, ganttStart = null;
    const targetCols = {};
    for (let c = 0; c <= sheet.maxCol; c++) {
      const h = clean(sheet.get(0, c));
      if (!h) continue;
      if (/^project details/i.test(h)) descCol = c;
      else if (/^project status/i.test(h)) statusCol = c;
      else if (/^\d{4} Q[1-4]$/.test(h) && ganttStart === null) ganttStart = c;
      else for (const [key, re] of TARGET_HEADINGS) if (re.test(h)) targetCols[key] = c;
    }
    if (descCol === null || statusCol === null) {
      throw new Error('Could not find the "Project details" and "Project status" headings in row 1.');
    }
    for (const [key] of TARGET_HEADINGS) {
      if (targetCols[key] === undefined) warnings.push(`Target column not found: ${key}`);
    }

    // Week dates. The first Gantt column's quarter label and day number fix the
    // first week; every column after it is one week later.
    let weekStart = null;
    if (ganttStart !== null) {
      const [, y, q] = /^(\d{4}) Q([1-4])$/.exec(clean(sheet.get(0, ganttStart)));
      const day = Number(sheet.get(2, ganttStart));
      if (!day) warnings.push('Could not read the first Gantt week date; the timeline has been skipped.');
      else {
        const base = Date.UTC(Number(y), (Number(q) - 1) * 3, day);
        weekStart = (col) => base + (col - ganttStart) * 7 * 86400000;
        // Cross-check against the day numbers at each quarter boundary.
        for (let c = ganttStart; c <= sheet.maxCol; c++) {
          const label = clean(sheet.get(0, c));
          const d = Number(sheet.get(2, c));
          if (/^\d{4} Q[1-4]$/.test(label) && d && new Date(weekStart(c)).getUTCDate() !== d) {
            warnings.push(`Week dates drift at column ${APP.xlsx.indexToCol(c)} (${label}); check the Gantt header row.`);
            break;
          }
        }
      }
    } else {
      warnings.push('No Gantt columns found (expected headings like "2025 Q3").');
    }

    // Stage labels per row: merged ranges, plus any single unmerged label cells.
    const covered = new Set();
    const byRow = {};
    for (const m of sheet.merges) {
      if (ganttStart === null || m.s.col < ganttStart) continue;
      for (let c = m.s.col; c <= m.e.col; c++) covered.add(m.s.row + ',' + c);
      (byRow[m.s.row] = byRow[m.s.row] || []).push({ s: m.s.col, e: m.e.col });
    }

    function stagesForRow(r) {
      if (!weekStart) return [];
      const spans = (byRow[r] || []).slice();
      for (let c = ganttStart; c <= sheet.maxCol; c++) {
        if (!covered.has(r + ',' + c) && sheet.get(r, c) != null) spans.push({ s: c, e: c });
      }
      spans.sort((a, b) => a.s - b.s);
      const out = [];
      for (const sp of spans) {
        const label = clean(sheet.get(r, sp.s));
        if (!label) continue;
        const st = model.stageFromGantt(label);
        if (!st) { warnings.push(`Row ${r + 1}: unrecognised stage label "${label}"`); continue; }
        const start = iso(weekStart(sp.s));
        const end = iso(weekStart(sp.e) + 6 * 86400000);
        const prev = out[out.length - 1];
        if (prev && prev.stage === st.stage && prev.activity === st.activity && model.addDays(prev.end, 1) === start) {
          prev.end = end;
        } else {
          out.push({ stage: st.stage, activity: st.activity, start, end });
        }
      }
      return out;
    }

    const interventions = [];
    const strands = [];
    let strand = null;
    for (let r = 1; r <= sheet.maxRow; r++) {
      const a = clean(sheet.get(r, 0));
      if (!a) continue;
      const sm = /^Strand\s*(\d+)\s*[:\-]\s*(.+)$/i.exec(a);
      if (sm) {
        strand = Number(sm[1]);
        strands.push({ number: strand, name: sm[2].trim() });
        continue;
      }
      const im = /^(\d+)\.(\d+)\s*[:.]?\s*(.+)$/.exec(a);
      if (!im) continue;
      const id = `${im[1]}.${im[2]}`;
      if (strand !== null && Number(im[1]) !== strand) {
        warnings.push(`${id} sits under Strand ${strand}; using ${im[1]} from its number.`);
      }
      const rawStatus = clean(sheet.get(r, statusCol));
      const status = model.statusFromTracker(rawStatus);
      if (!status) warnings.push(`${id}: unrecognised status "${rawStatus}"`);
      const targets = {};
      for (const [key] of TARGET_HEADINGS) {
        if (targetCols[key] !== undefined) targets[key] = normTarget(sheet.get(r, targetCols[key]));
      }
      interventions.push({
        id,
        row: r,
        strand: Number(im[1]),
        name: im[3].trim(),
        description: clean(sheet.get(r, descCol)),
        status: status || rawStatus || null,
        targets,
        plannedStages: stagesForRow(r),
      });
    }
    if (!interventions.length) throw new Error('No intervention rows found (expected rows like "6.3 Name").');
    // Layout details the spreadsheet writer needs.
    const quarterStarts = [];
    if (ganttStart !== null) for (let c = ganttStart; c <= sheet.maxCol; c++) if (/^\d{4} Q[1-4]$/.test(clean(sheet.get(0, c)))) quarterStarts.push(c);
    const lastCol = quarterStarts.length ? quarterStarts[quarterStarts.length - 1] + 12 : sheet.maxCol;
    const layout = { ganttStart, lastCol, statusCol, quarterStarts, base: weekStart ? weekStart(ganttStart) : null };
    return { strands, interventions, warnings, layout, sheet };
  }

  // Build a new tracker, or fold a re-import into an existing one.
  // The spreadsheet supplies names, descriptions, targets and Gantt dates.
  // Once the tracker exists it owns live status, so an existing status is kept.
  function mergeImport(existing, parsed, fileName, nowIso) {
    const changes = { added: [], updated: [], statusDiffers: [], missing: [] };
    const tracker = existing
      ? JSON.parse(JSON.stringify(existing))
      : { schemaVersion: 1, strands: [], interventions: [], notes: [] };
    tracker.strands = parsed.strands;
    tracker.importedFrom = { file: fileName, importedAt: nowIso };

    const byId = new Map(tracker.interventions.map((iv) => [iv.id, iv]));
    const seen = new Set();
    for (const p of parsed.interventions) {
      seen.add(p.id);
      const cur = byId.get(p.id);
      if (!cur) {
        const { row, ...rest } = p;
        tracker.interventions.push({ ...rest, template: null, deliverables: [] });
        changes.added.push(p.id);
        continue;
      }
      const fields = ['strand', 'name', 'description', 'targets', 'plannedStages'];
      const changed = fields.filter((f) => JSON.stringify(cur[f]) !== JSON.stringify(p[f]));
      for (const f of fields) cur[f] = p[f];
      if (changed.length) changes.updated.push(`${p.id} (${changed.join(', ')})`);
      if (cur.status !== p.status) changes.statusDiffers.push(`${p.id}: tool says "${cur.status}", spreadsheet says "${p.status}"`);
    }
    for (const iv of tracker.interventions) if (!seen.has(iv.id)) changes.missing.push(iv.id);

    const key = (id) => id.split('.').map(Number);
    tracker.interventions.sort((a, b) => { const x = key(a.id), y = key(b.id); return x[0] - y[0] || x[1] - y[1]; });
    return { tracker, changes };
  }

  APP.trackerImport = { parseTracker, mergeImport, SHEET };
})(typeof window !== 'undefined' ? window : globalThis);
