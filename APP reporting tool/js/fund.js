// APP Interventions Fund projects: found from the project documents in each
// round's folder, and tracked in the same way as the main interventions.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});

  const ROUND_RE = /^round\s*(\d+)/i;
  // "Project planning documents", "Round 2 Project documents - Theories of Change"
  const DOCS_RE = /project.*(planning|documents)|theor(y|ies) of change/i;
  // Blank templates and examples, not project documents.
  const SKIP_RE = /template|example|^~\$/i;

  const docName = (file) => file.replace(/\.docx$/i, '').replace(/\s+/g, ' ').trim();

  // Every project document, by round. Reads the planning folder of each round,
  // and its subfolders.
  async function listDocs(fundDir) {
    const found = [];
    for await (const [rname, rdir] of fundDir.entries()) {
      const m = ROUND_RE.exec(rname);
      if (rdir.kind !== 'directory' || !m) continue;
      for await (const [dname, ddir] of rdir.entries()) {
        if (ddir.kind !== 'directory' || !DOCS_RE.test(dname)) continue;
        const walk = async (dir, path, depth) => {
          for await (const [name, h] of dir.entries()) {
            if (h.kind === 'directory') { if (depth < 2) await walk(h, path.concat(name), depth + 1); }
            else if (/\.docx$/i.test(name) && !SKIP_RE.test(name)) found.push({ round: Number(m[1]), roundLabel: rname, name, path: path.concat(name).join('/'), handle: h });
          }
        };
        await walk(ddir, [rname, dname], 0);
      }
    }
    return found;
  }

  function nextId(list, round) {
    const nums = list.filter((p) => p.round === round).map((p) => Number(String(p.id).split('.')[1]) || 0);
    return `F${round}.${(nums.length ? Math.max(...nums) : 0) + 1}`;
  }

  // Bring the tracker's Fund projects up to date with the documents. New
  // documents become new projects; a project keeps its ID once given one.
  async function sync(tracker, fundDir, nowIso) {
    tracker.fundProjects = tracker.fundProjects || [];
    const list = tracker.fundProjects;
    const docs = (await listDocs(fundDir)).sort((a, b) => a.round - b.round || a.name.localeCompare(b.name));
    let added = 0, read = 0;
    const errors = [];
    for (const doc of docs) {
      let p = list.find((x) => x.template && x.template.file === doc.path)
        || list.find((x) => x.round === doc.round && !x.template && x.name.toLowerCase() === docName(doc.name).toLowerCase());
      let t = null;
      try {
        t = await APP.templates.readTemplate(await (await doc.handle.getFile()).arrayBuffer());
        read++;
      } catch (e) { errors.push(`${doc.path}: ${e.message}`); }
      if (!p) {
        p = { id: nextId(list, doc.round), round: doc.round, roundLabel: doc.roundLabel, name: (t && t.name) || docName(doc.name),
          status: (t && t.status && APP.model.statusFromTracker(t.status)) || 'On track', description: '', deliverables: [], dataNeeds: [], addedOn: nowIso.slice(0, 10) };
        list.push(p);
        added++;
      }
      p.roundLabel = doc.roundLabel;
      if (t) {
        p.template = { ...t, file: doc.path, checkedAt: nowIso };
        if (!p.description && t.details && t.details.activityDetails) p.description = t.details.activityDetails;
        if (t.lead && !p.lead) p.lead = t.lead;
      }
    }
    list.sort((a, b) => a.round - b.round || a.id.localeCompare(b.id, undefined, { numeric: true }));
    return { docs: docs.length, added, read, errors };
  }

  function rounds(tracker) {
    const by = new Map();
    for (const p of tracker.fundProjects || []) if (!by.has(p.round)) by.set(p.round, p.roundLabel || `Round ${p.round}`);
    return [...by.entries()].sort((a, b) => a[0] - b[0]).map(([round, label]) => ({ round, label }));
  }

  APP.fund = { listDocs, sync, rounds, nextId };
})(typeof window !== 'undefined' ? window : globalThis);
