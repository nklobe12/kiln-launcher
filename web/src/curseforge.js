// CurseForge public API (docs.curseforge.com). Requests go through the native
// app when present (no CORS limits); in a browser they use fetch.
const MINECRAFT = 432;
const LOADERS = {
  0: 'Any', 1: 'Forge', 2: 'Cauldron', 3: 'LiteLoader', 4: 'Fabric', 5: 'Quilt', 6: 'NeoForge',
};
const LOADER_KEYS = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const LOADER_NAMES = { vanilla: 'Vanilla', forge: 'Forge', fabric: 'Fabric', quilt: 'Quilt', neoforge: 'NeoForge' };
const RELEASE = { 1: 'Release', 2: 'Beta', 3: 'Alpha' };
const REL = { EMBEDDED: 1, OPTIONAL: 2, REQUIRED: 3, TOOL: 4, INCOMPATIBLE: 5, INCLUDE: 6 };
const SORTS = [
  { id: 2, label: 'Popularity' },
  { id: 1, label: 'Featured' },
  { id: 3, label: 'Last updated' },
  { id: 11, label: 'Newest' },
  { id: 6, label: 'Total downloads' },
  { id: 4, label: 'Name' },
];
// Minecraft classes Kiln knows how to install, with their folder in a profile
const MC_CLASSES = [
  { id: 4471, slug: 'modpacks', name: 'Modpacks', folder: null },
  { id: 6, slug: 'mc-mods', name: 'Mods', folder: 'mods' },
  { id: 12, slug: 'texture-packs', name: 'Resource Packs', folder: 'resourcepacks' },
  { id: 6552, slug: 'shaders', name: 'Shaders', folder: 'shaderpacks' },
  { id: 6945, slug: 'data-packs', name: 'Data Packs', folder: 'datapacks' },
  { id: 17, slug: 'worlds', name: 'Worlds', folder: 'saves' },
];
const classById = (id) => MC_CLASSES.find((c) => c.id === id);
const classBySlug = (slug) => MC_CLASSES.find((c) => c.slug === slug);

const CF = (() => {
  const cache = new Map();
  let bundledKey = '';

  function apiKey() {
    return (settings.get().apiKey || '').trim() || bundledKey;
  }
  function base() {
    return (settings.get().apiBase || 'https://api.curseforge.com').replace(/\/+$/, '');
  }

  async function loadBundledKey() {
    const info = await Native.info();
    if (info && info.curseforgeApiKey) bundledKey = info.curseforgeApiKey;
    if (!bundledKey && !Native.available && location.protocol !== 'file:') {
      try {
        const res = await fetch('kiln-config.json', { cache: 'no-store' });
        if (res.ok) bundledKey = ((await res.json()).curseforgeApiKey || '').trim();
      } catch (e) { /* opened as a file, or not hosted with a config */ }
    }
  }

  class ApiError extends Error {
    constructor(message, status) {
      super(message);
      this.status = status;
    }
  }

  async function request(path, { method = 'GET', body, ttl = 300000, params } = {}) {
    const key = apiKey();
    if (!key) throw new ApiError('Add your CurseForge API key in Settings to load mods.', 401);
    let url = base() + path;
    if (params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
        .join('&');
      if (qs) url += (url.includes('?') ? '&' : '?') + qs;
    }
    const cacheKey = method + ' ' + url + ' ' + (body ? JSON.stringify(body) : '');
    const hit = cache.get(cacheKey);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    let res;
    try {
      res = await httpRequest(url, {
        method,
        headers: { 'x-api-key': key, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
        body: body ? JSON.stringify(body) : null,
      });
    } catch (e) {
      log('error', 'CurseForge request failed', method, path, e);
      throw new ApiError(Native.available
        ? `Couldn't reach CurseForge. Check your connection and try again.`
        : `Couldn't reach CurseForge from this browser. Open Kiln in the app, or set a proxy URL in Settings.`, 0);
    }
    if (res.status === 403 || res.status === 401) throw new ApiError('CurseForge rejected the API key. Check it in Settings.', res.status);
    if (res.status === 404) throw new ApiError('Not found on CurseForge.', 404);
    if (res.status < 200 || res.status >= 300) throw new ApiError(`CurseForge returned ${res.status}.`, res.status);
    let json;
    try { json = JSON.parse(res.text); } catch (e) { throw new ApiError('CurseForge sent a response Kiln could not read.', res.status); }
    cache.set(cacheKey, { t: Date.now(), v: json });
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return json;
  }

  return {
    ApiError,
    loadBundledKey,
    hasKey: () => !!apiKey(),
    usingBundledKey: () => !(settings.get().apiKey || '').trim() && !!bundledKey,
    clearCache: () => cache.clear(),
    async games() {
      const r = await request('/v1/games', { params: { pageSize: 50 }, ttl: 86400000 });
      return r.data || [];
    },
    async categories(gameId, classId) {
      const r = await request('/v1/categories', { params: { gameId, classId }, ttl: 86400000 });
      return (r.data || []).filter((c) => !c.isClass);
    },
    async classes(gameId) {
      const r = await request('/v1/categories', { params: { gameId, classesOnly: true }, ttl: 86400000 });
      return r.data || [];
    },
    async search(params) {
      const r = await request('/v1/mods/search', { params: { pageSize: 30, sortOrder: 'desc', ...params } });
      return { data: r.data || [], pagination: r.pagination || { index: 0, resultCount: 0, totalCount: 0 } };
    },
    async mod(id) {
      return (await request(`/v1/mods/${id}`)).data;
    },
    async mods(ids) {
      const out = [];
      for (const part of chunk([...new Set(ids)], 100)) {
        const r = await request('/v1/mods', { method: 'POST', body: { modIds: part, filterPcOnly: true } });
        out.push(...(r.data || []));
      }
      return out;
    },
    async description(id) {
      return (await request(`/v1/mods/${id}/description`, { ttl: 3600000 })).data || '';
    },
    async files(id, params = {}) {
      const r = await request(`/v1/mods/${id}/files`, { params: { pageSize: 50, ...params } });
      return { data: r.data || [], pagination: r.pagination || {} };
    },
    async file(modId, fileId) {
      return (await request(`/v1/mods/${modId}/files/${fileId}`, { ttl: 3600000 })).data;
    },
    async filesByIds(ids) {
      const out = [];
      for (const part of chunk([...new Set(ids)], 100)) {
        const r = await request('/v1/mods/files', { method: 'POST', body: { fileIds: part } });
        out.push(...(r.data || []));
      }
      return out;
    },
    async changelog(modId, fileId) {
      return (await request(`/v1/mods/${modId}/files/${fileId}/changelog`, { ttl: 3600000 })).data || '';
    },
    async minecraftVersions() {
      const r = await request('/v1/minecraft/version', { ttl: 86400000 });
      return r.data || [];
    },
    async modloaders(version) {
      const r = await request('/v1/minecraft/modloader', { params: { version, includeAll: false }, ttl: 3600000 });
      return r.data || [];
    },
  };
})();

// ---- file selection helpers ----

function fileLoaders(file) {
  const gv = (file.gameVersions || []).map((v) => v.toLowerCase());
  return Object.keys(LOADER_KEYS).filter((k) => gv.includes(k));
}

function fileMcVersions(file) {
  return (file.gameVersions || []).filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v)).sort((a, b) => cmpVersion(b, a));
}

function fileFits(file, profile, classId) {
  if (!profile) return true;
  const mcOk = fileMcVersions(file).includes(profile.mc);
  if (classId !== 6) return mcOk;
  const loaders = fileLoaders(file);
  if (!profile.loader || profile.loader.type === 'vanilla') return mcOk && loaders.length === 0;
  if (loaders.length === 0) return mcOk; // some mods do not tag a loader
  const type = profile.loader.type;
  // Quilt runs most Fabric mods
  return mcOk && (loaders.includes(type) || (type === 'quilt' && loaders.includes('fabric')));
}

function allowedReleaseTypes() {
  const s = settings.get();
  return [1, s.allowBeta ? 2 : 0, s.allowAlpha ? 3 : 0].filter(Boolean);
}

function pickBest(files, profile, classId) {
  const allowed = allowedReleaseTypes();
  const fits = files.filter((f) => f.isAvailable !== false && fileFits(f, profile, classId));
  const sorted = (list) => list.slice().sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));
  for (const rt of allowed) {
    const ofType = sorted(fits.filter((f) => f.releaseType === rt));
    if (ofType.length) return ofType[0];
  }
  return null;
}

// Best file for a project in a profile (game version + loader + release channel)
async function bestFileFor(mod, profile) {
  const classId = mod.classId;
  const params = { gameVersion: profile && profile.mc };
  if (profile && classId === 6 && profile.loader && LOADER_KEYS[profile.loader.type]) params.modLoaderType = LOADER_KEYS[profile.loader.type];
  let files = [];
  try {
    files = (await CF.files(mod.id, params)).data;
  } catch (e) {
    log('warn', 'files lookup failed for', mod.name, e);
  }
  let best = pickBest(files, profile, classId);
  if (!best && params.modLoaderType === 5) {
    // Quilt can load Fabric mods
    try {
      files = (await CF.files(mod.id, { ...params, modLoaderType: 4 })).data;
      best = pickBest(files, profile, classId);
    } catch (e) { /* ignore */ }
  }
  if (!best && (mod.latestFiles || []).length) best = pickBest(mod.latestFiles, profile, classId);
  return best;
}

function fileDownloadUrl(file) {
  return file && file.downloadUrl ? file.downloadUrl : null;
}

function fileSha1(file) {
  const h = (file.hashes || []).find((x) => x.algo === 1);
  return h ? h.value : null;
}

function projectWebUrl(mod) {
  return (mod && mod.links && mod.links.websiteUrl) || `https://www.curseforge.com/projects/${mod && mod.id}`;
}

function modLogo(mod) {
  return (mod && mod.logo && (mod.logo.thumbnailUrl || mod.logo.url)) || '';
}

function modAuthor(mod) {
  return (mod && mod.authors && mod.authors[0] && mod.authors[0].name) || 'Unknown';
}

// Versions a project supports, newest first (from its file index)
function projectVersions(mod) {
  if (mod && mod.source === 'modrinth') return [...new Set(mod.gameVersions || [])].sort((a, b) => cmpVersion(b, a));
  const set = new Set();
  (mod.latestFilesIndexes || []).forEach((i) => i.gameVersion && /^\d+\.\d+(\.\d+)?$/.test(i.gameVersion) && set.add(i.gameVersion));
  return [...set].sort((a, b) => cmpVersion(b, a));
}

function projectLoaders(mod) {
  if (mod && mod.source === 'modrinth') return (mod.loaders || []).map((l) => LOADER_NAMES[l] || l);
  const set = new Set();
  (mod.latestFilesIndexes || []).forEach((i) => i.modLoader && LOADERS[i.modLoader] && set.add(LOADERS[i.modLoader]));
  return [...set];
}
