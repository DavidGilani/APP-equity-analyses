// Updates the APP timeline and status spreadsheet: the status column, and the
// Gantt bars for interventions whose project template has dates.
//
// It edits only the cells and merged ranges of the rows it changes, and copies
// every style from cells already in the sheet, so the formatting stays as it was.
// The new file is re-read and checked before it's handed back to be saved.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const DAY = 86400000;
  const SHEET = 'APP Timeline';

  const STAGE_LABEL = {
    Planning: (a) => `Planning ${a} activity`,
    Implementation: (a) => `Implementation of ${a} activity`,
    Evaluation: (a) => `Evaluation of ${a} activity`,
  };

  const iso = (ms) => new Date(ms).toISOString().slice(0, 10);

  // ---------- reading the sheet's conventions ----------

  function analyse(parsed) {
    const { sheet, layout } = parsed;
    const { ganttStart, lastCol, quarterStarts } = layout;
    const quarterOf = (c) => { let q = 0; for (let i = 0; i < quarterStarts.length; i++) if (c >= quarterStarts[i]) q = i; return q; };
    const posInQuarter = (c) => c - quarterStarts[quarterOf(c)];

    // Rows that are the last intervention in their strand carry a bottom border.
    const rows = parsed.interventions.map((p) => p.row).sort((a, b) => a - b);
    const lastInStrand = new Set();
    for (const r of rows) {
      const next = r + 1;
      const nextIsIntervention = rows.includes(next);
      if (!nextIsIntervention) lastInStrand.add(r);
    }

    const merged = new Set();
    for (const m of sheet.merges) for (let r = m.s.row; r <= m.e.row; r++) for (let c = m.s.col; c <= m.e.col; c++) merged.add(r + ',' + c);

    // Bar styles: label + position (first, mid, last) + whether it's a strand's last row.
    const counts = {};
    const bump = (key, s) => { if (s == null) return; (counts[key] = counts[key] || {})[s] = (counts[key][s] || 0) + 1; };
    for (const m of sheet.merges) {
      if (m.s.col < ganttStart || !rows.includes(m.s.row)) continue;
      const label = String(sheet.get(m.s.row, m.s.col) || '').trim();
      const st = APP.model.stageFromGantt(label);
      if (!st) continue;
      const tail = lastInStrand.has(m.s.row) ? 'end' : 'body';
      for (let c = m.s.col; c <= m.e.col; c++) {
        const pos = c === m.s.col ? 'first' : c === m.e.col ? 'last' : 'mid';
        const s = sheet.style(m.s.row, c);
        for (const k of [`${label}|${pos}|${tail}`, `${label}|${pos}`, `${st.stage}|${pos}|${tail}`, `${st.stage}|${pos}`]) bump(k, s);
      }
    }
    const top = (key) => { const c = counts[key]; if (!c) return null; return Object.entries(c).sort((a, b) => b[1] - a[1])[0][0]; };
    function barStyle(label, pos, row) {
      const st = APP.model.stageFromGantt(label).stage;
      const tail = lastInStrand.has(row) ? 'end' : 'body';
      return top(`${label}|${pos}|${tail}`) || top(`${label}|${pos}`) || top(`${st}|${pos}|${tail}`) || top(`${st}|${pos}`)
        || top(`${label}|mid`) || top(`${st}|mid`);
    }

    // Blank cell styles change by quarter and by row type, so a cleared cell copies
    // the style of a blank cell in the same column, from the nearest row of the same
    // type (a strand's last row has a bottom border).
    const isBlank = (r, c) => !merged.has(r + ',' + c) && sheet.get(r, c) == null && sheet.style(r, c) != null;
    function blankStyle(r, c) {
      const byDistance = (list) => list.filter((rr) => rr !== r).sort((a, b) => Math.abs(a - r) - Math.abs(b - r));
      for (const rr of byDistance(rows.filter((x) => lastInStrand.has(x) === lastInStrand.has(r)))) if (isBlank(rr, c)) return sheet.style(rr, c);
      const pos = posInQuarter(c);
      const sameRow = [];
      for (let cc = ganttStart; cc <= lastCol; cc++) if (isBlank(r, cc) && posInQuarter(cc) === pos) sameRow.push(cc);
      sameRow.sort((x, y) => Math.abs(x - c) - Math.abs(y - c));
      if (sameRow.length) return sheet.style(r, sameRow[0]);
      for (const rr of byDistance(rows)) if (isBlank(rr, c)) return sheet.style(rr, c);
      return null;
    }

    const colOf = (d) => ganttStart + Math.floor((Date.parse(d) - layout.base) / (7 * DAY));
    const weekOf = (c) => iso(layout.base + (c - ganttStart) * 7 * DAY);
    return { barStyle, blankStyle, colOf, weekOf, quarterStarts, ganttStart, lastCol, lastInStrand };
  }

  // Periods as column ranges, from the parsed Gantt.
  function oldBars(p, a) {
    return p.plannedStages.map((x) => ({ ...x, c1: a.colOf(x.start), c2: a.colOf(x.end) }));
  }

  // ---------- planning the changes ----------

  function plan(parsed, tracker) {
    const a = analyse(parsed);
    const byId = new Map(parsed.interventions.map((p) => [p.id, p]));
    const changes = [];
    for (const iv of tracker.interventions) {
      const p = byId.get(iv.id);
      if (!p) continue;
      const change = { id: iv.id, name: iv.name, row: p.row, status: null, bars: null, notes: [] };

      const want = APP.timelineCheck.sheetStatus(iv.status);
      const has = String(p.status || '').trim();
      if (want && APP.timelineCheck.sheetStatus(APP.model.statusFromTracker(has) || has) !== want) change.status = { from: has, to: want };

      const tf = iv.template && iv.template.timeframes;
      if (tf && iv.status !== 'BAU') {
        const old = oldBars(p, a);
        const activityFor = (stage) => (old.find((x) => x.stage === stage && x.activity && x.activity !== 'existing') || {}).activity
          || (old.find((x) => x.activity && x.activity !== 'existing') || {}).activity || 'new';
        let next = [];
        for (const [key, stage] of [['planning', 'Planning'], ['implementation', 'Implementation'], ['evaluation', 'Evaluation']]) {
          const t = tf[key];
          if (!t || !t.start || !t.end || t.end < t.start) continue;
          let c1 = a.colOf(t.start), c2 = a.colOf(t.end);
          if (c2 < a.ganttStart || c1 > a.lastCol) { change.notes.push(`${stage} (${t.start} to ${t.end}) is outside the spreadsheet's timeline, so it isn't drawn.`); continue; }
          if (c1 < a.ganttStart) { c1 = a.ganttStart; change.notes.push(`${stage} starts before the timeline, so its bar starts at the first week.`); }
          if (c2 > a.lastCol) { c2 = a.lastCol; change.notes.push(`${stage} runs past the end of the timeline, so its bar is cut off at the last week.`); }
          next.push({ stage, activity: activityFor(stage), c1, c2 });
        }
        // Stages that overlap by a week are trimmed so each week has one label.
        next.sort((x, y) => x.c1 - y.c1);
        for (let i = 1; i < next.length; i++) if (next[i].c1 <= next[i - 1].c2) next[i - 1].c2 = next[i].c1 - 1;
        next = next.filter((x) => x.c2 >= x.c1);

        if (next.length) {
          // Earlier bars that finish before the new cycle starts (BAU, evaluation of
          // an existing activity) are kept as they are.
          const cut = next[0].c1;
          const kept = old.filter((x) => x.c2 < cut);
          const replaced = old.filter((x) => x.c2 >= cut);
          // Compare by stage and weeks only, so a row whose dates already match is
          // left alone even if it splits a stage into "enhanced" and "new" parts.
          const byStage = (list) => {
            const out = [];
            for (const x of list.filter((y) => y.stage !== 'BAU' && y.activity !== 'existing').sort((y, z) => y.c1 - z.c1)) {
              const last = out[out.length - 1];
              if (last && last.stage === x.stage && x.c1 <= last.c2 + 1) last.c2 = Math.max(last.c2, x.c2);
              else out.push({ stage: x.stage, c1: x.c1, c2: x.c2 });
            }
            return JSON.stringify(out);
          };
          const same = byStage(replaced) === byStage(next);
          if (!same) change.bars = { kept, from: replaced, to: next };
        }
      }
      if (change.status || change.bars) changes.push(change);
    }
    return { changes, analysis: a };
  }

  // ---------- writing ----------

  function describe(bars, a) {
    return bars.map((b) => `${b.stage} ${APP.reports.fmt(a.weekOf(b.c1))} to ${APP.reports.fmt(APP.model.addDays(a.weekOf(b.c2), 6))}`).join('; ') || 'none';
  }

  async function apply(data, parsed, selected) {
    const { analysis: a } = plan(parsed, { interventions: [] }); // conventions only
    const zip = await root.JSZip.loadAsync(data);
    const path = parsed.sheet.path;
    const text = await zip.file(path).async('string');
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    const col = APP.xlsx.indexToCol;

    const rowEls = new Map(Array.from(doc.getElementsByTagNameNS(NS, 'row')).map((r) => [Number(r.getAttribute('r')) - 1, r]));
    function cellEl(r, c) {
      const rowEl = rowEls.get(r);
      const ref = col(c) + (r + 1);
      const cells = Array.from(rowEl.getElementsByTagNameNS(NS, 'c'));
      let el = cells.find((x) => x.getAttribute('r') === ref);
      if (!el) {
        el = doc.createElementNS(NS, 'c');
        el.setAttribute('r', ref);
        const after = cells.find((x) => APP.xlsx.colToIndex(x.getAttribute('r').replace(/\d+$/, '')) > c);
        rowEl.insertBefore(el, after || null);
      }
      return el;
    }
    function setBlank(r, c, style) {
      const el = cellEl(r, c);
      while (el.firstChild) el.removeChild(el.firstChild);
      el.removeAttribute('t');
      if (style != null) el.setAttribute('s', style); else el.removeAttribute('s');
    }
    function setText(r, c, value, style) {
      const el = cellEl(r, c);
      while (el.firstChild) el.removeChild(el.firstChild);
      el.setAttribute('t', 'inlineStr');
      if (style != null) el.setAttribute('s', style);
      const is = doc.createElementNS(NS, 'is');
      const t = doc.createElementNS(NS, 't');
      t.textContent = value;
      is.appendChild(t);
      el.appendChild(is);
    }

    let mergeRoot = doc.getElementsByTagNameNS(NS, 'mergeCells')[0];
    const mergeEls = mergeRoot ? Array.from(mergeRoot.getElementsByTagNameNS(NS, 'mergeCell')) : [];
    const parseRange = (ref) => {
      const [x, y] = ref.split(':');
      const p = (s) => ({ c: APP.xlsx.colToIndex(s.replace(/\d+$/, '')), r: Number(s.replace(/^[A-Z]+/, '')) - 1 });
      return { s: p(x), e: p(y || x) };
    };

    for (const ch of selected) {
      const r = ch.row;
      if (ch.status) {
        const sc = parsed.layout.statusCol;
        setText(r, sc, ch.status.to, parsed.sheet.style(r, sc));
      }
      if (!ch.bars) continue;
      const keptCols = new Set();
      for (const k of ch.bars.kept) for (let c = k.c1; c <= k.c2; c++) keptCols.add(c);
      // Remove this row's Gantt merges that aren't part of a kept bar, and blank their cells.
      for (const m of mergeEls) {
        const g = parseRange(m.getAttribute('ref'));
        if (g.s.r !== r || g.s.c < a.ganttStart) continue;
        let keep = true;
        for (let c = g.s.c; c <= g.e.c; c++) if (!keptCols.has(c)) keep = false;
        if (keep) continue;
        m.parentNode.removeChild(m);
        for (let c = g.s.c; c <= g.e.c; c++) if (!keptCols.has(c)) setBlank(r, c, a.blankStyle(r, c));
      }
      // Draw the new bars, split at quarter boundaries like the rest of the sheet.
      // A piece shorter than four weeks joins its neighbour, so no label is squeezed
      // into a single narrow cell.
      for (const b of ch.bars.to) {
        const label = STAGE_LABEL[b.stage](b.activity);
        const pieces = [];
        let c0 = b.c1;
        while (c0 <= b.c2) {
          const qEnd = (a.quarterStarts.find((q) => q > c0) ?? (a.lastCol + 1)) - 1;
          const e = Math.min(qEnd, b.c2);
          pieces.push([c0, e]);
          c0 = e + 1;
        }
        for (let i = 0; i < pieces.length && pieces.length > 1; i++) {
          if (pieces[i][1] - pieces[i][0] + 1 >= 4) continue;
          const j = i === 0 ? 1 : i - 1;
          pieces[j] = [Math.min(pieces[i][0], pieces[j][0]), Math.max(pieces[i][1], pieces[j][1])];
          pieces.splice(i, 1);
          i = -1;
        }
        for (const [c, end] of pieces) {
          for (let cc = c; cc <= end; cc++) {
            const pos = cc === c ? 'first' : cc === end ? 'last' : 'mid';
            const style = a.barStyle(label, pos, r);
            if (cc === c) setText(r, cc, label, style);
            else setBlank(r, cc, style);
          }
          if (end > c) {
            if (!mergeRoot) {
              mergeRoot = doc.createElementNS(NS, 'mergeCells');
              const sheetData = doc.getElementsByTagNameNS(NS, 'sheetData')[0];
              sheetData.parentNode.insertBefore(mergeRoot, sheetData.nextSibling);
            }
            const m = doc.createElementNS(NS, 'mergeCell');
            m.setAttribute('ref', `${col(c)}${r + 1}:${col(end)}${r + 1}`);
            mergeRoot.appendChild(m);
          }
        }
      }
    }
    if (mergeRoot) mergeRoot.setAttribute('count', String(mergeRoot.getElementsByTagNameNS(NS, 'mergeCell').length));

    let out = new XMLSerializer().serializeToString(doc);
    if (!out.startsWith('<?xml')) out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
    zip.file(path, out);
    const bytes = await zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE', compressionOptions: { level: 6 } });

    // Check the result by reading it back.
    const check = await APP.trackerImport.parseTracker(bytes.buffer);
    const problems = [];
    const byId = new Map(check.interventions.map((p) => [p.id, p]));
    for (const ch of selected) {
      const p = byId.get(ch.id);
      if (!p) { problems.push(`${ch.id} is missing after the update.`); continue; }
      if (ch.status && APP.timelineCheck.sheetStatus(APP.model.statusFromTracker(p.status)) !== ch.status.to) problems.push(`${ch.id}: status reads "${p.status}".`);
      if (ch.bars) {
        const got = p.plannedStages.filter((x) => x.stage !== 'BAU' && x.activity !== 'existing')
          .map((x) => `${x.stage}:${a.colOf(x.start)}-${a.colOf(x.end)}`).filter((x) => ch.bars.kept.every((k) => `${k.stage}:${k.c1}-${k.c2}` !== x));
        const want = ch.bars.to.map((x) => `${x.stage}:${x.c1}-${x.c2}`);
        if (JSON.stringify(got) !== JSON.stringify(want)) problems.push(`${ch.id}: bars read back as ${got.join(', ') || 'none'}, expected ${want.join(', ')}.`);
      }
    }
    if (check.interventions.length !== parsed.interventions.length) problems.push('The number of interventions changed.');
    return { bytes, problems };
  }

  APP.xlsxWrite = { plan, apply, describe, SHEET };
})(typeof window !== 'undefined' ? window : globalThis);
