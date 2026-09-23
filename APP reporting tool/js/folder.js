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

  APP.folder = { remembered, choose, reconnect, hasPermission, loadTracker, saveTracker, PROJECTS, DATA, TRACKER };
})(typeof window !== 'undefined' ? window : globalThis);
