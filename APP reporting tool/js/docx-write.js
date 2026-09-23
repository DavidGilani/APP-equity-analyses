// Builds simple Word documents (.docx) in the browser: headings, paragraphs,
// bullets and tables. Enough for summaries that people then edit in Word.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});

  const x = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // runs: a string, or a list of strings and { text, bold, italic, muted }
  function runsXml(runs) {
    const list = Array.isArray(runs) ? runs : [runs];
    return list.map((r) => {
      const o = typeof r === 'string' ? { text: r } : r;
      const pr = (o.bold ? '<w:b/>' : '') + (o.italic ? '<w:i/>' : '') + (o.muted ? '<w:color w:val="666666"/>' : '');
      return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(o.text)}</w:t></w:r>`;
    }).join('');
  }

  function para(runs, style, extraPr = '') {
    const pPr = (style ? `<w:pStyle w:val="${style}"/>` : '') + extraPr;
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runsXml(runs)}</w:p>`;
  }

  function create() {
    const body = [];
    const doc = {
      title: (t) => { body.push(para(t, 'Title')); return doc; },
      h1: (t) => { body.push(para(t, 'Heading1')); return doc; },
      h2: (t) => { body.push(para(t, 'Heading2')); return doc; },
      p: (runs) => { body.push(para(runs)); return doc; },
      note: (t) => { body.push(para({ text: t, italic: true, muted: true })); return doc; },
      bullet: (runs) => { body.push(para(runs, 'ListBullet', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')); return doc; },
      // header: list of strings; rows: list of lists of runs
      table: (header, rows, widths) => {
        const n = header.length;
        const w = widths || header.map(() => Math.floor(9000 / n));
        const cell = (runs, i, isHead) => `<w:tc><w:tcPr><w:tcW w:w="${w[i]}" w:type="dxa"/>${isHead ? '<w:shd w:val="clear" w:color="auto" w:fill="E8EAF4"/>' : ''}</w:tcPr>${
          (Array.isArray(runs) && runs.length && Array.isArray(runs[0]) ? runs : [runs]).map((r) => para(isHead ? { text: r, bold: true } : r, 'TableText')).join('')}</w:tc>`;
        const tr = (cells, isHead) => `<w:tr>${isHead ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => cell(c, i, isHead)).join('')}</w:tr>`;
        body.push(`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0"/></w:tblPr>
          <w:tblGrid>${w.map((v) => `<w:gridCol w:w="${v}"/>`).join('')}</w:tblGrid>
          ${tr(header, true)}${rows.map((r) => tr(r, false)).join('')}</w:tbl>`);
        body.push(para(''));
        return doc;
      },
      toBlob: () => build(body),
    };
    return doc;
  }

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const DOC_RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

  const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';

  const STYLES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles ${W}>
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:cs="Arial"/><w:sz w:val="22"/><w:szCs w:val="22"/><w:lang w:val="en-GB"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="264" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="240"/></w:pPr><w:rPr><w:b/><w:sz w:val="36"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:b/><w:color w:val="2F3F8F"/><w:sz w:val="28"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="240" w:after="80"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:b/><w:sz w:val="24"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="ListBullet"><w:name w:val="List Bullet"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="60"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="TableText"><w:name w:val="Table Text"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:after="40"/></w:pPr><w:rPr><w:sz w:val="20"/></w:rPr></w:style>
<w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders>
<w:top w:val="single" w:sz="4" w:color="BFBFBF"/><w:left w:val="single" w:sz="4" w:color="BFBFBF"/><w:bottom w:val="single" w:sz="4" w:color="BFBFBF"/><w:right w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideH w:val="single" w:sz="4" w:color="BFBFBF"/><w:insideV w:val="single" w:sz="4" w:color="BFBFBF"/>
</w:tblBorders><w:tblCellMar><w:top w:w="60" w:type="dxa"/><w:left w:w="100" w:type="dxa"/><w:bottom w:w="60" w:type="dxa"/><w:right w:w="100" w:type="dxa"/></w:tblCellMar></w:tblPr></w:style>
</w:styles>`;

  const NUMBERING = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering ${W}>
<w:abstractNum w:abstractNumId="0"><w:multiLevelType w:val="singleLevel"/><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="bullet"/><w:lvlText w:val="•"/><w:lvlJc w:val="left"/><w:pPr><w:ind w:left="360" w:hanging="360"/></w:pPr></w:lvl></w:abstractNum>
<w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
</w:numbering>`;

  async function build(body) {
    const zip = new root.JSZip();
    // No separate folder entries in the package; Word doesn't expect them.
    const add = (name, data) => zip.file(name, data, { createFolders: false });
    add('[Content_Types].xml', CONTENT_TYPES);
    add('_rels/.rels', RELS);
    add('word/_rels/document.xml.rels', DOC_RELS);
    add('word/styles.xml', STYLES);
    add('word/numbering.xml', NUMBERING);
    add('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W}><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  APP.docx = { create };
})(typeof window !== 'undefined' ? window : globalThis);
