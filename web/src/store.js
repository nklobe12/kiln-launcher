// ---- settings ----
const settings = (() => {
  const defaults = {
    apiKey: '',
    apiBase: '',
    theme: 'system',
    allowBeta: true,
    allowAlpha: false,
    autoDeps: true,
    gameId: MINECRAFT,
    memoryMb: 0,
  };
  let value = { ...defaults, ...storage.get('settings', {}) };
  return {
    get: () => value,
    set(patch) {
      value = { ...value, ...patch };
      storage.set('settings', value);
      bus.emit('settings', value);
    },
  };
})();

function applyTheme() {
  const t = settings.get().theme;
  if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
  else delete document.documentElement.dataset.theme;
}

// ---- profiles ----
// A profile is one Minecraft instance: version + loader + installed content.
// In the app it lives in <game folder>/kiln/<id>/ with a kiln.json next to the
// game files, and is mirrored into the launcher's profile list so Play works.
const PROFILE_ROOT = 'kiln';
const AUTO_MODDED_MB = 4096;
const RESERVED_DIRS = new Set(['_tmp', '_import', '_installers', '_exports']);

function newProfile({ name, mc, loader = { type: 'vanilla', version: '' }, icon = '', modpack = null }) {
  return {
    id: '',
    name,
    mc,
    loader,
    versionId: '',
    status: 'new',
    icon,
    modpack,
    content: [],
    memoryMb: 0,
    javaArgs: '',
    created: Date.now(),
    lastPlayed: 0,
  };
}

function profileDir(p) {
  return `${PROFILE_ROOT}/${p.id}`;
}

function contentPath(p, item) {
  const folder = item.folder || 'mods';
  return `${profileDir(p)}/${folder}/${item.fileName}${item.enabled === false ? '.disabled' : ''}`;
}

function loaderLabel(p) {
  if (!p.loader || p.loader.type === 'vanilla') return 'Vanilla';
  return `${LOADER_NAMES[p.loader.type] || p.loader.type} ${p.loader.version || ''}`.trim();
}

const Profiles = (() => {
  let list = null;

  async function load() {
    if (Native.available) {
      const out = [];
      let dirs = [];
      try { dirs = await FS.list(PROFILE_ROOT); } catch (e) { dirs = []; }
      for (const d of dirs) {
        if (!d.dir || RESERVED_DIRS.has(d.name)) continue;
        const p = await FS.readJSON(`${PROFILE_ROOT}/${d.name}/kiln.json`);
        if (p && p.name) {
          p.id = d.name;
          out.push(p);
        }
      }
      list = out;
    } else {
      list = storage.get('profiles', []);
    }
    list.sort((a, b) => (b.lastPlayed || b.created || 0) - (a.lastPlayed || a.created || 0));
    return list;
  }

  async function persist(p) {
    if (Native.available) {
      await FS.writeJSON(`${profileDir(p)}/kiln.json`, p);
    } else {
      storage.set('profiles', list);
    }
  }

  function launcherProfile(p) {
    const s = settings.get();
    // Automatic: modded profiles ask for 4 GB. The app only raises Java's memory
    // to what the phone can spare and never below its own setting.
    const modded = p.loader && p.loader.type && p.loader.type !== 'vanilla';
    const mem = p.memoryMb || s.memoryMb || (modded ? AUTO_MODDED_MB : 0);
    const args = [p.javaArgs || '', mem ? `-Xmx${mem}M` : ''].filter(Boolean).join(' ').trim();
    const out = { name: p.name, lastVersionId: p.versionId || p.mc, type: 'custom' };
    if (args) out.javaArgs = args;
    if (p.icon && /^https:/.test(p.icon)) out.icon = p.icon;
    return out;
  }

  return {
    async all(refresh = false) {
      if (!list || refresh) await load();
      return list;
    },
    get(id) {
      return (list || []).find((p) => p.id === id) || null;
    },
    uniqueName(name, exceptId) {
      const names = new Set((list || []).filter((p) => p.id !== exceptId).map((p) => p.name.toLowerCase()));
      let n = name.trim() || 'New profile';
      let i = 2;
      const base = n;
      while (names.has(n.toLowerCase())) n = `${base} (${i++})`;
      return n;
    },
    async create(p) {
      await this.all();
      p.name = this.uniqueName(p.name);
      const ids = new Set(list.map((x) => x.id));
      let id = slugify(p.name);
      let i = 2;
      while (ids.has(id) || RESERVED_DIRS.has(id)) id = `${slugify(p.name)}-${i++}`;
      p.id = id;
      list.unshift(p);
      await persist(p);
      if (Native.available) {
        for (const folder of ['mods', 'resourcepacks', 'shaderpacks']) await FS.mkdir(`${profileDir(p)}/${folder}`);
      }
      bus.emit('profiles');
      return p;
    },
    async save(p, { syncLauncher = true } = {}) {
      const i = list.findIndex((x) => x.id === p.id);
      if (i >= 0) list[i] = p;
      await persist(p);
      if (Native.available && syncLauncher && p.versionId) {
        await Native.call('profiles.save', { key: p.name, profile: launcherProfile(p), instanceDir: profileDir(p) });
      }
      bus.emit('profiles');
      return p;
    },
    async rename(p, name) {
      const old = p.name;
      p.name = this.uniqueName(name, p.id);
      if (Native.available && old !== p.name) {
        try { await Native.call('profiles.delete', { key: old }); } catch (e) { /* not registered yet */ }
      }
      return this.save(p);
    },
    async remove(p) {
      list = list.filter((x) => x.id !== p.id);
      if (Native.available) {
        try { await Native.call('profiles.delete', { key: p.name }); } catch (e) { /* ignore */ }
        await FS.remove(profileDir(p));
      } else {
        storage.set('profiles', list);
      }
      bus.emit('profiles');
    },
    launcherProfile,
  };
})();

// ---- background tasks (downloads, installs) ----
const Tasks = (() => {
  const active = new Map();
  let history = storage.get('history', []);

  function emit() { bus.emit('tasks'); }

  return {
    add({ label, detail = '', kind = 'download', profileId = null }) {
      const t = { id: uid(), label, detail, kind, profileId, status: 'running', received: 0, total: 0, steps: 0, done: 0, started: Date.now(), error: '' };
      active.set(t.id, t);
      emit();
      return t;
    },
    update(t, patch) {
      Object.assign(t, patch);
      emit();
    },
    finish(t, error) {
      t.status = error ? 'failed' : 'done';
      t.error = error ? (error.message || String(error)) : '';
      t.finished = Date.now();
      active.delete(t.id);
      history.unshift({ ...t });
      history = history.slice(0, 40);
      storage.set('history', history);
      emit();
    },
    active: () => [...active.values()],
    history: () => history,
    clearHistory() {
      history = [];
      storage.set('history', history);
      emit();
    },
    busyFor: (profileId) => [...active.values()].some((t) => t.profileId === profileId),
  };
})();

// Map native download progress events onto tasks
const downloadWatchers = new Map();
bus.on('native:download.progress', (e) => {
  const fn = downloadWatchers.get(e.taskId);
  if (fn) fn(e);
});

async function nativeDownload(url, path, { sha1, onProgress } = {}) {
  const taskId = uid();
  if (onProgress) downloadWatchers.set(taskId, onProgress);
  try {
    return await Native.call('download', { url, path, sha1: sha1 || '', taskId });
  } finally {
    downloadWatchers.delete(taskId);
  }
}
