// Reads completed APP project templates (.docx) and audits which interventions have one.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});
  const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';

  const els = (node, name) => Array.from(node.getElementsByTagNameNS(W, name));
  const text = (node) => els(node, 't').map((t) => t.textContent).join('');
  const labelKey = (s) => s.replace(/[:#]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();

  // Row label + position within the row -> field path.
  const CONTROL_FIELDS = {
    'app strand|0': 'strand',
    'project status stage|0': 'stage',
    'project status stage|1': 'priority',
    'intervention timeframes completed|0': 'complete.timeframes',
    'theory of change completed|0': 'complete.theoryOfChange',
    'evaluation details completed|0': 'complete.evaluation',
    'last updated|0': 'lastUpdated',
    'project status|0': 'status',
    'planning|0': 'timeframes.planning.start',
    'planning|1': 'timeframes.planning.end',
    'implementation|0': 'timeframes.implementation.start',
    'implementation|1': 'timeframes.implementation.end',
    'evaluation|0': 'timeframes.evaluation.start',
    'evaluation|1': 'timeframes.evaluation.end',
    'estimated project report publication date|0': 'timeframes.reportPublication',
  };

  const PLACEHOLDERS = [/^insert intervention/i, /^choose an item/i, /^click or tap/i];

  // Free-text sections, keyed by their row label.
  const CONTENT_FIELDS = {
    'activity details': ['details', 'activityDetails'],
    'cross intervention details': ['details', 'crossIntervention'],
    'problem statement': ['theoryOfChange', 'problemStatement'],
    'inputs': ['theoryOfChange', 'inputs'],
    'activities': ['theoryOfChange', 'activities'],
    'outcomes': ['theoryOfChange', 'outcomes'],
    'impact': ['theoryOfChange', 'impact'],
    'causal pathways': ['theoryOfChange', 'causalPathways'],
    'moderating factors / assumptions': ['theoryOfChange', 'moderatingFactors'],
    'targeting': ['theoryOfChange', 'targeting'],
    'research questions': ['evaluation', 'researchQuestions'],
    'outcome measures': ['evaluation', 'outcomeMeasures'],
    'evaluation methods': ['evaluation', 'evaluationMethods'],
    'analysis strategy': ['evaluation', 'analysisStrategy'],
    'evaluation reporting': ['evaluation', 'evaluationReporting'],
  };

  // The opening words of each guidance prompt in the blank template. A paragraph
  // that starts with one of these is guidance, not content someone has written.
  const GUIDANCE = [
    'insert top-level activity details', 'note if this intervention is related',
    'what is the current background', 'what human, financial, and organisational',
    'what will happen and what will be delivered', 'include any outputs here',
    'what are the short, intermediate and long-term', 'what is the long-term goal which relates',
    'what are the key steps that must happen', 'what are the moderating factors',
    'what opportunities are there to target', 'what are the main research questions',
    'examples of potential indicators', 'identify whether the research approach',
    'also indicate here if any process evaluation', 'detail what methods will be used',
    'who will be leading on the creation', 'is there any reason why details',
  ];

  const norm = (s) => s.toLowerCase().replace(/\s+/g, ' ').trim();

  function writtenContent(tc) {
    const paras = els(tc, 'p').map((p) => text(p).trim()).filter(Boolean);
    const kept = paras.filter((p) => {
      const n = norm(p);
      if (/^https?:\/\/\S+$/.test(n)) return false;
      return !GUIDANCE.some((g) => n.startsWith(g) || (n.length < g.length && g.startsWith(n)));
    });
    const joined = kept.join(' ').trim();
    // Very short leftovers ("TBC", "-", "n/a") don't count as written content.
    return joined.replace(/^(tbc|tbd|n\/a|-+|\.+)$/i, '').length >= 12 ? joined : '';
  }

  function setPath(obj, path, value) {
    const parts = path.split('.');
    let o = obj;
    for (const p of parts.slice(0, -1)) o = o[p] = o[p] || {};
    o[parts[parts.length - 1]] = value;
  }

  function parseDateText(s) {
    s = (s || '').trim();
    let m = /^(\d{1,2})[\/.\-](\d{1,2})[\/.\-](\d{4})$/.exec(s); // UK day/month/year
    if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
    m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s);
    if (m) return m[0];
    const t = Date.parse(s + ' UTC');
    return isNaN(t) ? null : new Date(t).toISOString().slice(0, 10);
  }

  function controlValue(sdt) {
    const pr = els(sdt, 'sdtPr')[0];
    if (!pr || els(pr, 'showingPlcHdr').length) return null;
    const content = els(sdt, 'sdtContent')[0];
    const shown = content ? text(content).trim() : '';
    const date = els(pr, 'date')[0];
    if (date) {
      const full = date.getAttributeNS(W, 'fullDate');
      return full ? full.slice(0, 10) : parseDateText(shown);
    }
    if (!shown || PLACEHOLDERS.some((re) => re.test(shown))) return null;
    return shown;
  }

  function isFieldControl(sdt) {
    const pr = els(sdt, 'sdtPr')[0];
    return pr && (els(pr, 'dropDownList').length || els(pr, 'comboBox').length || els(pr, 'date').length);
  }

  async function readTemplate(data) {
    const zip = await root.JSZip.loadAsync(data);
    const file = zip.file('word/document.xml');
    if (!file) throw new Error('Not a Word document');
    const doc = new DOMParser().parseFromString(await file.async('string'), 'application/xml');
    const out = { complete: {}, timeframes: {}, details: {}, theoryOfChange: {}, evaluation: {} };
    let recognised = 0;

    for (const tr of els(doc, 'tr')) {
      const cells = els(tr, 'tc');
      if (!cells.length) continue;
      const label = labelKey(text(cells[0]));

      const controls = els(tr, 'sdt').filter(isFieldControl);
      controls.forEach((sdt, i) => {
        const path = CONTROL_FIELDS[`${label}|${i}`];
        if (!path) return;
        recognised++;
        setPath(out, path, controlValue(sdt));
      });

      // Plain text cells: the value sits in the cell after its label.
      cells.forEach((tc, i) => {
        const key = labelKey(text(tc));
        const next = cells[i + 1] ? text(cells[i + 1]).trim() : '';
        const val = next && !PLACEHOLDERS.some((re) => re.test(next)) && !/:$/.test(next) ? next : null;
        if (key === 'intervention name') out.name = val;
        if (key === 'intervention') out.number = val; // "Intervention #:"
        if (key === 'intervention lead') out.lead = val;
        if (key === 'app strand owner') out.strandOwner = val;
      });

      // Free-text sections: record whether each has written content, with a short excerpt.
      const field = CONTENT_FIELDS[label];
      if (field && cells[1]) {
        const content = writtenContent(cells[1]);
        out[field[0]][field[1]] = content ? (content.length > 240 ? content.slice(0, 237) + '...' : content) : null;
        recognised++;
      }
    }
    if (!recognised) throw new Error('No template fields found. Is this an APP project template?');
    return out;
  }

  // Summary of how finished a template is.
  function completeness(t) {
    const flags = [t.complete.timeframes, t.complete.theoryOfChange, t.complete.evaluation];
    const done = flags.filter((f) => f === 'Completed').length;
    return { done, of: 3, complete: done === 3 };
  }

  const FILE_RE = /^APP\s*(\d+)\.(\d+)/i;

  // Find template files in the strand subfolders of APP Projects.
  async function listTemplateFiles(projectsDir, maxDepth = 3) {
    const found = [];
    async function walk(dir, path, depth) {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'directory') {
          if (depth === 0 && !/^strand\s*\d/i.test(name)) continue;
          if (depth < maxDepth) await walk(h, path.concat(name), depth + 1);
        } else if (depth > 0 && /\.docx$/i.test(name) && !name.startsWith('~$')) {
          const m = FILE_RE.exec(name);
          if (m) found.push({ id: `${Number(m[1])}.${Number(m[2])}`, name, path: path.concat(name).join('/'), handle: h });
        }
      }
    }
    await walk(projectsDir, [], 0);
    return found;
  }

  // Match templates to tracker rows. Where one intervention has several files,
  // the most recently saved one is used and the others are listed.
  async function auditTemplates(projectsDir, tracker, nowIso) {
    const files = await listTemplateFiles(projectsDir);
    const byId = new Map();
    for (const f of files) {
      const file = await f.handle.getFile();
      f.lastModified = file.lastModified;
      f.file = file;
      (byId.get(f.id) || byId.set(f.id, []).get(f.id)).push(f);
    }
    const ids = new Set(tracker.interventions.map((iv) => iv.id));
    const results = [];
    for (const iv of tracker.interventions) {
      const list = (byId.get(iv.id) || []).sort((a, b) => b.lastModified - a.lastModified);
      const r = { id: iv.id, file: null, others: list.slice(1).map((f) => f.path), template: null, error: null };
      if (list.length) {
        r.file = list[0].path;
        try {
          const t = await readTemplate(await list[0].file.arrayBuffer());
          r.template = { ...t, file: list[0].path, checkedAt: nowIso };
        } catch (e) {
          r.error = e.message;
        }
      }
      results.push(r);
    }
    const unmatched = files.filter((f) => !ids.has(f.id)).map((f) => f.path);
    return { results, unmatched, fileCount: files.length };
  }

  // Strands whose interventions are architectural and don't need a full theory of change.
  const TOC_EXEMPT_STRANDS = [7];

  const SECTION_LABELS = {
    theoryOfChange: {
      problemStatement: 'Problem statement', inputs: 'Inputs', activities: 'Activities', outcomes: 'Outcomes',
      impact: 'Impact', causalPathways: 'Causal pathways', moderatingFactors: 'Moderating factors and assumptions', targeting: 'Targeting',
    },
    evaluation: {
      researchQuestions: 'Research questions', outcomeMeasures: 'Outcome measures', evaluationMethods: 'Evaluation methods',
      analysisStrategy: 'Analysis strategy', evaluationReporting: 'Evaluation reporting',
    },
  };

  // How far a project template is from a complete theory of change.
  // State is one of: exempt, bau, missing, partial, complete.
  function assess(iv) {
    if (TOC_EXEMPT_STRANDS.includes(iv.strand)) return { state: 'exempt' };
    if (iv.status === 'BAU') return { state: 'bau' };
    const t = iv.template;
    if (!t) return { state: 'missing' };
    const gaps = { timeframes: [], theoryOfChange: [], evaluation: [], details: [] };
    const tf = t.timeframes || {};
    for (const [k, l] of [['planning', 'Planning'], ['implementation', 'Implementation'], ['evaluation', 'Evaluation']]) {
      if (!tf[k] || !tf[k].start || !tf[k].end) gaps.timeframes.push(`${l} dates`);
    }
    // Templates read before section checking existed only have the completion flags.
    const recheck = !t.theoryOfChange;
    if (!recheck) {
      for (const sec of ['theoryOfChange', 'evaluation']) {
        for (const [k, l] of Object.entries(SECTION_LABELS[sec])) if (!t[sec][k]) gaps[sec].push(l);
      }
      if (!t.lead) gaps.details.push('Intervention lead');
      if (!t.stage) gaps.details.push('Project status stage');
    } else {
      if (t.complete.theoryOfChange !== 'Completed') gaps.theoryOfChange.push('Marked as not complete');
      if (t.complete.evaluation !== 'Completed') gaps.evaluation.push('Marked as not complete');
    }
    const core = gaps.timeframes.length + gaps.theoryOfChange.length + gaps.evaluation.length;
    // Sections that are ticked as completed in the template but still have gaps.
    const mismatch = [];
    if (t.complete.timeframes === 'Completed' && gaps.timeframes.length) mismatch.push('timeframes');
    if (t.complete.theoryOfChange === 'Completed' && gaps.theoryOfChange.length && !recheck) mismatch.push('theory of change');
    if (t.complete.evaluation === 'Completed' && gaps.evaluation.length && !recheck) mismatch.push('evaluation');
    const total = 3 + Object.keys(SECTION_LABELS.theoryOfChange).length + Object.keys(SECTION_LABELS.evaluation).length;
    return { state: core ? 'partial' : 'complete', gaps, mismatch, recheck, filled: total - core, total };
  }

  APP.templates = { readTemplate, completeness, listTemplateFiles, auditTemplates, parseDateText, assess, TOC_EXEMPT_STRANDS, SECTION_LABELS };
})(typeof window !== 'undefined' ? window : globalThis);
