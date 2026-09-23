// Makes a new draft of the ESE committee paper from the latest one: updates the
// status counts in the delivery plan section and the numbers in Table 2, and adds
// strand notes where they've been written in the tool. Everything else is kept as
// it was, including Tables 1 and 3, so the draft is ready for editing.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
  const els = (n, name) => Array.from(n.getElementsByTagNameNS(W, name));
  const textOf = (n) => els(n, 't').map((t) => t.textContent).join('');

  const COUNT_PATTERNS = [
    ['BAU', /(\d+)(\s+interventions?\s+(?:now\s+)?(?:classified|categorised|categorized)\s+as\s+business\s+as\s+usual)/i],
    ['To be mapped', /(\d+)(\s+interventions?\s+that\s+(?:are|is)\s+at\s+risk\s+because\s+they\s+still\s+require\s+further\s+mapping)/i],
    ['On track', /(\d+)(\s+interventions?\s+that\s+(?:are|is)\s+on\s+track)/i],
    ['Behind schedule / at risk', /(\d+)(\s+interventions?\s+that\s+(?:are|is)\s+behind\s+schedule)/i],
  ];

  // Replace characters [start, end) of a paragraph's text, keeping run formatting
  // where the change sits inside one run.
  function replaceInParagraph(p, start, end, value) {
    const ts = els(p, 't');
    let pos = 0;
    for (const t of ts) {
      const len = t.textContent.length;
      if (start >= pos && end <= pos + len) {
        t.textContent = t.textContent.slice(0, start - pos) + value + t.textContent.slice(end - pos);
        return;
      }
      pos += len;
    }
    // The number is split across runs: rewrite the text into the first run.
    const full = ts.map((t) => t.textContent).join('');
    ts.forEach((t, i) => { t.textContent = i === 0 ? full.slice(0, start) + value + full.slice(end) : ''; });
  }

  // Set a table cell to plain text, keeping the first paragraph's formatting.
  function setCell(doc, tc, lines) {
    const paras = els(tc, 'p');
    const first = paras[0];
    for (const p of paras.slice(1)) p.parentNode.removeChild(p);
    const runs = els(first, 'r');
    const rPr = runs[0] && els(runs[0], 'rPr')[0];
    for (const r of runs) r.parentNode.removeChild(r);
    lines.forEach((line, i) => {
      const r = doc.createElementNS(W, 'w:r');
      if (rPr) r.appendChild(rPr.cloneNode(true));
      if (i > 0) r.appendChild(doc.createElementNS(W, 'w:br'));
      const t = doc.createElementNS(W, 'w:t');
      t.setAttribute('xml:space', 'preserve');
      t.textContent = line;
      r.appendChild(t);
      first.appendChild(r);
    });
  }

  function directCells(tr) {
    return Array.from(tr.childNodes).flatMap((n) => {
      if (n.localName === 'tc') return [n];
      if (n.localName === 'sdt') return els(n, 'tc');
      return [];
    });
  }

  async function fillPaper(data, { counts, byStrand, strandNotes }) {
    const zip = await root.JSZip.loadAsync(data);
    const xml = await zip.file('word/document.xml').async('string');
    const doc = new DOMParser().parseFromString(xml, 'application/xml');
    const report = { updated: [], notFound: [] };

    // 1. Status counts in the text.
    const found = new Set();
    for (const p of els(doc, 'p')) {
      for (const [key, re] of COUNT_PATTERNS) {
        const text = textOf(p);
        const m = re.exec(text);
        if (!m) continue;
        found.add(key);
        if (String(counts[key]) !== m[1]) {
          replaceInParagraph(p, m.index, m.index + m[1].length, String(counts[key]));
          report.updated.push(`Status count "${key}": ${m[1]} to ${counts[key]}`);
        } else {
          report.updated.push(`Status count "${key}": still ${counts[key]}`);
        }
      }
    }
    for (const [key] of COUNT_PATTERNS) if (!found.has(key)) report.notFound.push(`The sentence with the "${key}" count`);

    // 2. Table 2: the table whose heading row mentions strands, BAU and on track.
    const tables = els(doc, 'tbl');
    const table2 = tables.find((tbl) => {
      const first = els(tbl, 'tr')[0];
      const t = first ? textOf(first).toLowerCase() : '';
      return t.includes('bau') && t.includes('on track');
    });
    if (!table2) {
      report.notFound.push('Table 2 (a table with BAU and On track columns)');
    } else {
      const rows = els(table2, 'tr');
      const head = directCells(rows[0]).map((c) => textOf(c).toLowerCase());
      const colFor = (test) => head.findIndex(test);
      const cols = {
        'BAU': colFor((h) => /\bbau\b/.test(h)),
        'On track': colFor((h) => /on\s*track/.test(h)),
        'To be mapped': colFor((h) => /mapp/.test(h)),
        'Behind schedule / at risk': colFor((h) => /behind|at risk/.test(h) && !/mapp/.test(h)),
      };
      const notesCol = colFor((h) => /note|risk|comment/.test(h) && !/behind|bau|on track|mapp/.test(h));
      const totals = { 'BAU': 0, 'On track': 0, 'To be mapped': 0, 'Behind schedule / at risk': 0 };
      let strandRows = 0;
      for (const tr of rows.slice(1)) {
        const cells = directCells(tr);
        const label = textOf(cells[0] || tr);
        const m = /strand\s*(\d)/i.exec(label);
        if (m) {
          const c = byStrand[Number(m[1])];
          if (!c) continue;
          strandRows++;
          for (const [k, i] of Object.entries(cols)) if (i >= 0 && cells[i]) { setCell(doc, cells[i], [String(c[k])]); totals[k] += c[k]; }
          const note = strandNotes && strandNotes[m[1]];
          if (notesCol >= 0 && cells[notesCol] && note && note.trim()) {
            setCell(doc, cells[notesCol], note.trim().split(/\n+/));
            report.updated.push(`Table 2 notes for Strand ${m[1]}`);
          }
        } else if (/total/i.test(label)) {
          for (const [k, i] of Object.entries(cols)) if (i >= 0 && cells[i]) setCell(doc, cells[i], [String(counts[k])]);
          report.updated.push('Table 2 totals row');
        }
      }
      if (strandRows) report.updated.push(`Table 2 status counts for ${strandRows} strands`);
      else report.notFound.push('Strand rows in Table 2 (first column starting "Strand 1" and so on)');
      for (const [k, i] of Object.entries(cols)) if (i < 0) report.notFound.push(`Table 2 column for "${k}"`);
      if (notesCol < 0) report.notFound.push('Table 2 notes column');
    }

    let out = new XMLSerializer().serializeToString(doc);
    if (!out.startsWith('<?xml')) out = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\r\n' + out;
    zip.file('word/document.xml', out);
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    return { blob, report };
  }

  // "ESE July 2026 - APP update v2.docx" -> "ESE November 2026 - APP update v1 (draft from the tool).docx"
  function nextName(latestName, meetingIso) {
    const month = meetingIso ? new Date(meetingIso + 'T00:00:00Z').toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : null;
    const m = /^(.*?)(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{4})(.*?)(?:\s*v\d+)?(\.docx)$/i.exec(latestName);
    if (m && month) return `${m[1]}${month}${m[4].replace(/\s+$/, '')} v1 (draft from the tool)${m[5]}`;
    return latestName.replace(/\.docx$/i, ` (draft from the tool ${new Date().toISOString().slice(0, 10)}).docx`);
  }

  APP.paperFill = { fillPaper, nextName };
})(typeof window !== 'undefined' ? window : globalThis);
