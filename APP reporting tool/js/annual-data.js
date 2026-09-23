// The annual report data spreadsheet (faculty gaps, other gaps to monitor,
// expenditure), and the faculty gap chart drawn for the Word report.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});
  const FILE = 'APP annual report data.xlsx';
  const SHEETS = {
    faculty: { name: 'Faculty gaps', head: ['Target', 'Faculty', 'Gap this year (pp)', 'Gap last year (pp)', 'Students in target group'] },
    watch: { name: 'Gaps to monitor', head: ['Measure', 'Groups compared', 'Gap this year (pp)', 'Gap last year (pp)', 'Notes'] },
    spend: { name: 'Expenditure', head: ['Area', 'Planned (£)', 'Actual (£)', 'Notes'] },
  };
  // Starting rows for the faculty sheet: each APP target, with a University row
  // (the benchmark line on the charts) and one row per faculty.
  const FACULTIES = ['University', 'Arts and Creative Industries', 'Business and Law', 'Health, Social Care and Education', 'Science and Technology'];

  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const col = (i) => APP.xlsx.indexToCol(i);

  function sheetXml(rows, widths) {
    const cell = (v, r, c) => {
      const ref = `${col(c)}${r + 1}`;
      if (v == null || v === '') return '';
      if (typeof v === 'number') return `<c r="${ref}"><v>${v}</v></c>`;
      return `<c r="${ref}" t="inlineStr"${r === 0 ? ' s="1"' : ''}><is><t xml:space="preserve">${esc(v)}</t></is></c>`;
    };
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols>
<sheetData>${rows.map((row, r) => `<row r="${r + 1}">${row.map((v, c) => cell(v, r, c)).join('')}</row>`).join('')}</sheetData></worksheet>`;
  }

  // A new, empty data spreadsheet with the right sheets and headings.
  async function template() {
    const zip = new root.JSZip();
    const targets = APP.model.TARGETS.map(([, l]) => l);
    const sheets = [
      ['Read me', [['APP annual report data'], [''], ['Fill in one row per faculty for each target on "Faculty gaps". The "University" row is the benchmark line on the charts.'],
        ['Check the faculty names match the current structure; add or remove rows as needed.'], ['Gaps are in percentage points; a positive number means the target group has the lower outcome.'],
        ['"Gaps to monitor" is for gaps outside the current targets that may need watching.'], ['"Expenditure" is spending against the plan, by area.'],
        [''], ['Save the file where it is: the tool reads it when it creates the annual report.']], [110]],
      [SHEETS.faculty.name, [SHEETS.faculty.head, ...targets.flatMap((t) => FACULTIES.map((f) => [t, f]))], [34, 34, 18, 18, 22]],
      [SHEETS.watch.name, [SHEETS.watch.head], [34, 40, 18, 18, 50]],
      [SHEETS.spend.name, [SHEETS.spend.head, ['Access and outreach'], ['Financial support'], ['Student success activity'], ['Evaluation']], [34, 16, 16, 50]],
    ];
    zip.file('[Content_Types].xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
${sheets.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>`, { createFolders: false });
    zip.file('_rels/.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`, { createFolders: false });
    zip.file('xl/workbook.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>
${sheets.map(([name], i) => `<sheet name="${esc(name)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>`, { createFolders: false });
    zip.file('xl/_rels/workbook.xml.rels', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${sheets.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}
<Relationship Id="rId${sheets.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`, { createFolders: false });
    zip.file('xl/styles.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Arial"/></font><font><b/><sz val="11"/><name val="Arial"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EAF4"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`, { createFolders: false });
    sheets.forEach(([, rows, widths], i) => zip.file(`xl/worksheets/sheet${i + 1}.xml`, sheetXml(rows, widths), { createFolders: false }));
    return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' });
  }

  const num = (v) => {
    if (v == null || v === '') return null;
    const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/[£,%pp\s]/g, ''));
    return isNaN(n) ? null : Math.round(n * 100) / 100;
  };

  async function readSheetRows(data, name, width) {
    try {
      const s = await APP.xlsx.readSheet(data, name);
      const rows = [];
      for (let r = 1; r <= s.maxRow; r++) rows.push(Array.from({ length: width }, (_, c) => s.get(r, c)));
      return rows;
    } catch { return []; }
  }

  async function read(data) {
    const f = await readSheetRows(data, SHEETS.faculty.name, 5);
    const w = await readSheetRows(data, SHEETS.watch.name, 5);
    const e = await readSheetRows(data, SHEETS.spend.name, 4);
    return {
      facultyGaps: f.filter((r) => r[0] && r[1]).map((r) => ({ target: String(r[0]).trim(), faculty: String(r[1]).trim(), gap: num(r[2]), last: num(r[3]), population: num(r[4]) })).filter((r) => r.gap != null),
      watchList: w.filter((r) => r[0]).map((r) => ({ measure: String(r[0]).trim(), groups: r[1] ? String(r[1]) : '', gap: num(r[2]), last: num(r[3]), note: r[4] ? String(r[4]) : '' })),
      expenditure: e.filter((r) => r[0] && (r[1] != null || r[2] != null)).map((r) => ({ area: String(r[0]).trim(), planned: num(r[1]), actual: num(r[2]), note: r[3] ? String(r[3]) : '' })),
    };
  }

  // Faculty gap chart in the house style: one bar per faculty, the University gap
  // as a black line, and the change since last year on the right. A bar is purple
  // where the gap has widened and green otherwise.
  async function gapChart(rows, benchmark) {
    if (!root.document) return null;
    const S = 2; // drawn at twice the size for a sharp picture in Word
    const rowH = 44, top = 44, labelW = 330, barX = 350, barW = 560, deltaX = 1000, width = 1080;
    const height = top + rows.length * rowH + 16;
    const canvas = root.document.createElement('canvas');
    canvas.width = width * S; canvas.height = height * S;
    const ctx = canvas.getContext('2d');
    ctx.scale(S, S);
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, width, height);
    const values = rows.map((r) => r.gap).concat(benchmark != null ? [benchmark] : []);
    const lo = Math.min(0, ...values), hi = Math.max(0.1, ...values) * 1.08;
    const xOf = (v) => barX + ((v - lo) / (hi - lo)) * barW;
    const zero = xOf(0);
    const TEAL = '#5F9C99', PURPLE = '#8E4AB0', TEAL_TEXT = '#2F7F7A', PURPLE_TEXT = '#7B3FA0';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#555555'; ctx.font = '13px Arial'; ctx.textAlign = 'left';
    ctx.fillText(benchmark != null ? 'Gap in percentage points. Black line: University gap' : 'Gap in percentage points', barX, 22);
    ctx.fillText('Since last year', deltaX - 8, 22);
    rows.forEach((r, i) => {
      const y = top + i * rowH;
      if (i % 2 === 1) { ctx.fillStyle = '#EFEFEF'; ctx.fillRect(0, y, width, rowH); }
      const widened = r.last != null && r.gap > r.last;
      ctx.fillStyle = '#222222'; ctx.font = '15px Arial'; ctx.textAlign = 'left';
      ctx.fillText(r.faculty.length > 38 ? r.faculty.slice(0, 36) + '…' : r.faculty, 16, y + rowH / 2);
      const x1 = Math.min(zero, xOf(r.gap)), x2 = Math.max(zero, xOf(r.gap));
      ctx.fillStyle = widened ? PURPLE : TEAL;
      ctx.fillRect(x1, y + 9, Math.max(2, x2 - x1), rowH - 18);
      ctx.strokeStyle = 'rgba(0,0,0,0.35)'; ctx.lineWidth = 1; ctx.strokeRect(x1 + 0.5, y + 9.5, Math.max(2, x2 - x1) - 1, rowH - 19);
      ctx.fillStyle = '#555555'; ctx.font = '14px Arial';
      ctx.textAlign = r.gap < 0 ? 'right' : 'left';
      // Keep the value label clear of the University line when they'd overlap.
      const bx = benchmark != null ? xOf(benchmark) : null;
      let lx = r.gap < 0 ? x1 - 6 : x2 + 6;
      if (bx != null && r.gap >= 0 && Math.abs(bx - x2) < 16) lx = Math.max(x2, bx) + 8;
      if (bx != null && r.gap < 0 && Math.abs(bx - x1) < 16) lx = Math.min(x1, bx) - 8;
      ctx.fillText(`${r.gap}`, lx, y + rowH / 2);
      if (benchmark != null) {
        ctx.fillStyle = '#000000';
        ctx.fillRect(xOf(benchmark) - 1.5, y + 4, 3, rowH - 8);
      }
      if (r.last != null) {
        const ch = Math.round((r.gap - r.last) * 10) / 10;
        ctx.fillStyle = ch > 0 ? PURPLE_TEXT : TEAL_TEXT; ctx.font = '16px Arial'; ctx.textAlign = 'left';
        ctx.fillText(`${ch > 0 ? '▲' : ch < 0 ? '▼' : '='}${Math.abs(ch).toFixed(1)}`, deltaX, y + rowH / 2);
      }
    });
    if (lo < 0) { ctx.fillStyle = '#999999'; ctx.fillRect(zero - 0.5, top, 1, rows.length * rowH); }
    const blob = await new Promise((res) => canvas.toBlob(res, 'image/png'));
    return { bytes: new Uint8Array(await blob.arrayBuffer()), width: canvas.width, height: canvas.height };
  }

  APP.annualData = { FILE, template, read, gapChart };
})(typeof window !== 'undefined' ? window : globalThis);
