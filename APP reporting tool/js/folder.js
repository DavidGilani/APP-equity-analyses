// Access to the OneDrive-synced folder, via Chrome's File System Access API.
// The chosen folder is remembered in this browser, so later visits need one click.
(function (root) {
  const APP = (root.APPTool = root.APPTool || {});
  const DB = 'app-reporting-tool', STORE = 'handles', KEY = 'root';
  const PROJECTS = 'APP Projects';
  const DATA = '_Tracker data';
  const TRACKER = 'tracker.json';

  function idb(mode, fn) {
    return new Promise((resolve, reject) => {
      const open = indexedDB.open(DB, 1);
      open.onupgradeneeded = () => open.result.createObjectStore(STORE);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const tx = open.result.transaction(STORE, mode);
        const req = fn(tx.objectStore(STORE));
        tx.oncomplete = () => resolve(req && req.result);
        tx.onerror = () => reject(tx.error);
      };
    });
  }

  async function remembered() {
    try { return (await idb('readonly', (s) => s.get(KEY))) || null; } catch { return null; }
  }

  async function remember(handle) {
    try { await idb('readwrite', (s) => s.put(handle, KEY)); } catch { /* not essential */ }
  }

  async function hasPermission(handle, ask) {
    const opts = { mode: 'readwrite' };
    if ((await handle.queryPermission(opts)) === 'granted') return true;
    return ask ? (await handle.requestPermission(opts)) === 'granted' : false;
  }

  async function child(dir, name) {
    try { return await dir.getDirectoryHandle(name); } catch { return null; }
  }

  // Accept either APP Framework (the parent) or APP Projects itself.
  async function resolve(rootHandle) {
    if (rootHandle.name === PROJECTS) return { root: rootHandle, projects: rootHandle };
    const projects = await child(rootHandle, PROJECTS);
    if (projects) return { root: rootHandle, projects };
    // A folder with strand subfolders is treated as APP Projects under another name.
    for await (const [name, h] of rootHandle.entries()) {
      if (h.kind === 'directory' && /^strand\s*\d/i.test(name)) return { root: rootHandle, projects: rootHandle };
    }
    throw new Error(`"${rootHandle.name}" doesn't contain an "${PROJECTS}" folder or any strand folders. Choose APP Framework or APP Projects.`);
  }

  async function choose() {
    const h = await root.showDirectoryPicker({ id: 'app-framework', mode: 'readwrite' });
    const r = await resolve(h);
    await remember(h);
    return r;
  }

  async function reconnect(handle) {
    if (!(await hasPermission(handle, true))) throw new Error('Permission to the folder was not granted.');
    return resolve(handle);
  }

  async function dataDir(projects, create) {
    try { return await projects.getDirectoryHandle(DATA, { create }); } catch { return null; }
  }

  async function readJson(dir, name) {
    try {
      const f = await (await dir.getFileHandle(name)).getFile();
      return JSON.parse(await f.text());
    } catch (e) {
      if (e.name === 'NotFoundError') return null;
      throw e;
    }
  }

  async function writeText(dir, name, text) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }

  const stamp = (d = new Date()) => d.toISOString().slice(0, 16).replace(/[-:]/g, '').replace('T', '-');

  async function loadTracker(projects) {
    const dir = await dataDir(projects, false);
    return dir ? readJson(dir, TRACKER) : null;
  }

  // Save the tracker. With backup set, the previous copy is kept in backups/ first.
  async function saveTracker(projects, tracker, { backup = false } = {}) {
    const dir = await dataDir(projects, true);
    if (backup) {
      const prev = await readJson(dir, TRACKER);
      if (prev) {
        const b = await dir.getDirectoryHandle('backups', { create: true });
        await writeText(b, `tracker-${stamp()}.json`, JSON.stringify(prev, null, 2));
      }
    }
    tracker.savedAt = new Date().toISOString();
    await writeText(dir, TRACKER, JSON.stringify(tracker, null, 2));
  }

  // Find the APP timeline and status spreadsheet in APP Projects or APP Framework.
  // Where there are several, the most recently saved one is used.
  async function findTimelineFile(conn) {
    const found = [];
    const dirs = [[conn.projects, conn.projects.name]];
    if (conn.root !== conn.projects) dirs.push([conn.root, conn.root.name]);
    for (const [dir, label] of dirs) {
      for await (const [name, h] of dir.entries()) {
        if (h.kind === 'file' && /\.xlsx$/i.test(name) && /timeline/i.test(name) && !name.startsWith('~$')) {
          const file = await h.getFile();
          found.push({ name, path: `${label}/${name}`, handle: h, lastModified: file.lastModified });
        }
      }
    }
    found.sort((a, b) => b.lastModified - a.lastModified);
    return found;
  }

  async function subdir(dir, parts) {
    for (const p of parts) dir = await dir.getDirectoryHandle(p, { create: true });
    return dir;
  }

  // Committee papers go to APP Framework/Committees and reporting when it's there;
  // everything else goes to APP Projects/_Tracker data/Reports.
  async function saveReport(conn, name, blob, { committee = false } = {}) {
    let dir, path;
    const committees = committee && conn.root !== conn.projects ? await child(conn.root, 'Committees and reporting') : null;
    if (committees) { dir = committees; path = `${conn.root.name}/Committees and reporting/${name}`; }
    else { dir = await subdir(conn.projects, [DATA, 'Reports']); path = `${PROJECTS}/${DATA}/Reports/${name}`; }
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
    return path;
  }

  async function latestSnapshot(projects) {
    const data = await dataDir(projects, false);
    const dir = data ? await child(data, 'snapshots') : null;
    if (!dir) return null;
    const names = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && /^snapshot-.*\.json$/.test(name)) names.push(name);
    names.sort();
    return names.length ? readJson(dir, names[names.length - 1]) : null;
  }

  async function saveSnapshot(projects, snap) {
    const dir = await subdir(projects, [DATA, 'snapshots']);
    const name = `snapshot-${snap.date}.json`;
    await writeText(dir, name, JSON.stringify(snap, null, 2));
    return `${PROJECTS}/${DATA}/snapshots/${name}`;
  }

  // Copy a file's current contents into _Tracker data/backups before it's replaced.
  async function backupFile(projects, handle) {
    const file = await handle.getFile();
    const dir = await subdir(projects, [DATA, 'backups']);
    const name = file.name.replace(/(\.[^.]+)$/, ` - before update ${stamp()}$1`);
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(await file.arrayBuffer());
    await w.close();
    return `${PROJECTS}/${DATA}/backups/${name}`;
  }

  async function writeHandle(handle, bytes) {
    const w = await handle.createWritable();
    await w.write(bytes);
    await w.close();
  }

  // Committee papers in APP Framework/Committees and reporting, newest first.
  // Files the tool generated itself are left out.
  async function committeePapers(conn) {
    if (conn.root === conn.projects) return { dir: null, papers: [] };
    const dir = await child(conn.root, 'Committees and reporting');
    if (!dir) return { dir: null, papers: [] };
    const papers = [];
    for await (const [name, h] of dir.entries()) {
      if (h.kind !== 'file' || !/\.docx$/i.test(name) || name.startsWith('~$') || /generated sections|from the tool/i.test(name)) continue;
      const f = await h.getFile();
      papers.push({ name, handle: h, lastModified: f.lastModified });
    }
    papers.sort((a, b) => b.lastModified - a.lastModified);
    return { dir, papers };
  }

  async function writeInDir(dir, name, blob) {
    const fh = await dir.getFileHandle(name, { create: true });
    const w = await fh.createWritable();
    await w.write(blob);
    await w.close();
  }

  // Files kept in _Tracker data, such as the annual report data spreadsheet.
  async function dataFileInfo(projects, name) {
    const dir = await dataDir(projects, false);
    if (!dir) return null;
    try {
      const file = await (await dir.getFileHandle(name)).getFile();
      return { file, lastModified: file.lastModified };
    } catch { return null; }
  }

  async function writeDataFile(projects, name, bytes) {
    const dir = await dataDir(projects, true);
    await writeText(dir, name, bytes);
    return `${PROJECTS}/${DATA}/${name}`;
  }

  // The snapshot closest to a date, for comparing across a year.
  async function snapshotNear(projects, isoDate) {
    const data = await dataDir(projects, false);
    const dir = data ? await child(data, 'snapshots') : null;
    if (!dir) return null;
    const names = [];
    for await (const [name, h] of dir.entries()) if (h.kind === 'file' && /^snapshot-(\d{4}-\d{2}-\d{2})\.json$/.test(name)) names.push(name);
    if (!names.length) return null;
    const dist = (n) => Math.abs(Date.parse(n.slice(9, 19)) - Date.parse(isoDate));
    names.sort((a, b) => dist(a) - dist(b));
    return readJson(dir, names[0]);
  }

  APP.folder = { dataFileInfo, writeDataFile, snapshotNear, backupFile, writeHandle, committeePapers, writeInDir, remembered, choose, reconnect, hasPermission, loadTracker, saveTracker, findTimelineFile, saveReport, latestSnapshot, saveSnapshot, PROJECTS, DATA, TRACKER };
})(typeof window !== 'undefined' ? window : globalThis);
