// Builds simple Word documents (.docx) in the browser: headings, paragraphs,
// bullets, tables and pictures. Enough for papers that people then edit in Word.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});

  const x = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

  // runs: a string, or a list of strings and { text, bold, italic, muted, color }
  function runsXml(runs) {
    const list = Array.isArray(runs) ? runs : [runs];
    return list.map((r) => {
      const o = typeof r === 'string' ? { text: r } : r;
      const color = o.color || (o.muted ? '666666' : null);
      const pr = (o.bold ? '<w:b/>' : '') + (o.italic ? '<w:i/>' : '') + (color ? `<w:color w:val="${color}"/>` : '');
      return `<w:r>${pr ? `<w:rPr>${pr}</w:rPr>` : ''}<w:t xml:space="preserve">${x(o.text)}</w:t></w:r>`;
    }).join('');
  }

  function para(runs, style, extraPr = '') {
    const pPr = (style ? `<w:pStyle w:val="${style}"/>` : '') + extraPr;
    return `<w:p>${pPr ? `<w:pPr>${pPr}</w:pPr>` : ''}${runsXml(runs)}</w:p>`;
  }

  function create() {
    const body = [];
    const media = []; // { name, bytes }
    const doc = {
      title: (t) => { body.push(para(t, 'Title')); return doc; },
      h1: (t) => { body.push(para(t, 'Heading1')); return doc; },
      h2: (t) => { body.push(para(t, 'Heading2')); return doc; },
      p: (runs) => { body.push(para(runs)); return doc; },
      note: (t) => { body.push(para({ text: t, italic: true, muted: true })); return doc; },
      bullet: (runs) => { body.push(para(runs, 'ListBullet', '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>')); return doc; },
      // header: list of strings, or null for no heading row; rows: list of lists of cells.
      // A cell is runs, a list of paragraphs (each a list of runs), or { content, fill }.
      table: (header, rows, widths) => {
        const n = header ? header.length : rows[0].length;
        const w = widths || Array.from({ length: n }, () => Math.floor(9000 / n));
        const cell = (value, i, isHead) => {
          const c = value && typeof value === 'object' && !Array.isArray(value) && 'content' in value ? value : { content: value };
          const fill = isHead ? 'E8EAF4' : c.fill;
          const runs = c.content;
          return `<w:tc><w:tcPr><w:tcW w:w="${w[i]}" w:type="dxa"/>${fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : ''}</w:tcPr>${
            (Array.isArray(runs) && runs.length && Array.isArray(runs[0]) ? runs : [runs]).map((r) => para(isHead ? { text: r, bold: true } : r, 'TableText')).join('')}</w:tc>`;
        };
        const tr = (cells, isHead) => `<w:tr>${isHead ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${cells.map((c, i) => cell(c, i, isHead)).join('')}</w:tr>`;
        body.push(`<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/><w:tblW w:w="0" w:type="auto"/><w:tblLook w:val="04A0"/></w:tblPr>
          <w:tblGrid>${w.map((v) => `<w:gridCol w:w="${v}"/>`).join('')}</w:tblGrid>
          ${header ? tr(header, true) : ''}${rows.map((r) => tr(r, false)).join('')}</w:tbl>`);
        body.push(para(''));
        return doc;
      },
      // A PNG picture, scaled to widthInches with its aspect ratio kept.
      image: (bytes, pxW, pxH, alt, widthInches = 6.2) => {
        const id = media.length + 1;
        media.push({ name: `image${id}.png`, bytes });
        const cx = Math.round(widthInches * 914400), cy = Math.round(cx * pxH / pxW);
        body.push(`<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="${cx}" cy="${cy}"/>
          <wp:docPr id="${id}" name="Picture ${id}" descr="${x(alt)}"/><wp:cNvGraphicFramePr><a:graphicFrameLocks xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" noChangeAspect="1"/></wp:cNvGraphicFramePr>
          <a:graphic xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture">
          <pic:pic xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:nvPicPr><pic:cNvPr id="${id}" name="image${id}.png" descr="${x(alt)}"/><pic:cNvPicPr/></pic:nvPicPr>
          <pic:blipFill><a:blip r:embed="rIdImg${id}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill>
          <pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${cx}" cy="${cy}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic>
          </a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`);
        return doc;
      },
      pageBreak: () => { body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>'); return doc; },
      toBlob: () => build(body, media),
    };
    return doc;
  }

  const CONTENT_TYPES = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Default Extension="png" ContentType="image/png"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

  const RELS = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

  const docRels = (media) => `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
${media.map((m, i) => `<Relationship Id="rIdImg${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/${m.name}"/>`).join('\n')}
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

  async function build(body, media = []) {
    const zip = new root.JSZip();
    // No separate folder entries in the package; Word doesn't expect them.
    const add = (name, data) => zip.file(name, data, { createFolders: false });
    add('[Content_Types].xml', CONTENT_TYPES);
    add('_rels/.rels', RELS);
    add('word/_rels/document.xml.rels', docRels(media));
    for (const m of media) add(`word/media/${m.name}`, m.bytes);
    add('word/styles.xml', STYLES);
    add('word/numbering.xml', NUMBERING);
    add('word/document.xml', `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document ${W} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`);
    return zip.generateAsync({ type: 'blob', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
  }

  APP.docx = { create };
})(typeof window !== 'undefined' ? window : globalThis);
