// Minimal .xlsx reader: cell values and merged ranges for one sheet.
// Reads the workbook's XML directly with JSZip, so no spreadsheet library is needed.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});

  function colToIndex(letters) {
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1; // A = 0
  }

  function parseRef(ref) {
    const m = /^([A-Z]+)(\d+)$/.exec(ref);
    return { col: colToIndex(m[1]), row: parseInt(m[2], 10) - 1 };
  }

  function indexToCol(i) {
    let s = '';
    for (i += 1; i > 0; i = Math.floor((i - 1) / 26)) s = String.fromCharCode(65 + ((i - 1) % 26)) + s;
    return s;
  }

  function xml(text) {
    return new DOMParser().parseFromString(text, 'application/xml');
  }

  function textOf(el) {
    // Concatenate every <t> under el (handles rich-text runs).
    let out = '';
    const ts = el.getElementsByTagName('t');
    for (let i = 0; i < ts.length; i++) out += ts[i].textContent;
    return out;
  }

  async function sheetNames(zip) {
    const wb = xml(await zip.file('xl/workbook.xml').async('string'));
    return Array.from(wb.getElementsByTagName('sheet')).map((s) => s.getAttribute('name'));
  }

  async function readSheet(data, wantedName) {
    const zip = await root.JSZip.loadAsync(data);
    const wb = xml(await zip.file('xl/workbook.xml').async('string'));
    const rels = xml(await zip.file('xl/_rels/workbook.xml.rels').async('string'));

    const sheets = Array.from(wb.getElementsByTagName('sheet'));
    const sheet = sheets.find((s) => s.getAttribute('name') === wantedName);
    if (!sheet) {
      throw new Error(`No sheet called "${wantedName}". Sheets found: ${sheets.map((s) => s.getAttribute('name')).join(', ')}`);
    }
    const rid = sheet.getAttribute('r:id');
    const rel = Array.from(rels.getElementsByTagName('Relationship')).find((r) => r.getAttribute('Id') === rid);
    let target = rel.getAttribute('Target').replace(/^\//, '');
    if (!target.startsWith('xl/')) target = 'xl/' + target;

    const shared = [];
    const sstFile = zip.file('xl/sharedStrings.xml');
    if (sstFile) {
      const sst = xml(await sstFile.async('string'));
      for (const si of Array.from(sst.getElementsByTagName('si'))) shared.push(textOf(si));
    }

    const ws = xml(await zip.file(target).async('string'));
    const cells = {}; // "row,col" -> value
    const styles = {}; // "row,col" -> style index
    let maxRow = 0, maxCol = 0;
    for (const c of Array.from(ws.getElementsByTagName('c'))) {
      const { row, col } = parseRef(c.getAttribute('r'));
      const t = c.getAttribute('t');
      if (c.getAttribute('s') !== null) styles[row + ',' + col] = c.getAttribute('s');
      const v = c.getElementsByTagName('v')[0];
      let value = null;
      if (t === 's' && v) value = shared[parseInt(v.textContent, 10)];
      else if (t === 'inlineStr') value = textOf(c);
      else if (t === 'str' || t === 'e') value = v ? v.textContent : null;
      else if (t === 'b') value = v ? v.textContent === '1' : null;
      else if (v) value = Number(v.textContent);
      if (value === null || value === '') continue;
      cells[row + ',' + col] = value;
      if (row > maxRow) maxRow = row;
      if (col > maxCol) maxCol = col;
    }

    const merges = Array.from(ws.getElementsByTagName('mergeCell')).map((m) => {
      const [a, b] = m.getAttribute('ref').split(':');
      const s = parseRef(a), e = parseRef(b || a);
      return { s, e };
    });

    return {
      get: (row, col) => cells[row + ',' + col],
      style: (row, col) => styles[row + ',' + col],
      path: target,
      merges,
      maxRow,
      maxCol,
    };
  }

  APP.xlsx = { readSheet, sheetNames, colToIndex, indexToCol };
})(typeof window !== 'undefined' ? window : globalThis);
