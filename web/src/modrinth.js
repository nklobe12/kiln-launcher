// Modrinth API v2 (docs.modrinth.com). No key needed. Projects and versions are
// adapted into the same shapes Kiln uses for CurseForge, so the install engine,
// lists and profile pages work for both sources.
const MR_TYPES = { modpack: 4471, mod: 6, resourcepack: 12, shader: 6552 };
const MR_TYPE_OF_CLASS = { 4471: 'modpack', 6: 'mod', 12: 'resourcepack', 6552: 'shader' };
const MR_LOADERS = ['fabric', 'quilt', 'forge', 'neoforge'];
const MR_SORTS = [
  { id: 'relevance', label: 'Relevance' },
  { id: 'downloads', label: 'Downloads' },
  { id: 'follows', label: 'Follows' },
  { id: 'newest', label: 'Newest' },
  { id: 'updated', label: 'Last updated' },
];
const MR_RELEASE = { release: 1, beta: 2, alpha: 3 };

const MR = (() => {
  const base = 'https://api.modrinth.com/v2';
  const cache = new Map();

  async function request(path, { method = 'GET', body = null, params = null, ttl = 300000 } = {}) {
    let url = base + path;
    if (params) {
      const qs = Object.entries(params)
        .filter(([, v]) => v !== undefined && v !== null && v !== '')
        .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(typeof v === 'string' ? v : JSON.stringify(v))}`)
        .join('&');
      if (qs) url += '?' + qs;
    }
    const key = method + ' ' + url + ' ' + (body ? JSON.stringify(body) : '');
    const hit = cache.get(key);
    if (hit && Date.now() - hit.t < ttl) return hit.v;
    let res;
    try {
      res = await httpRequest(url, {
        method,
        headers: {
          Accept: 'application/json',
          ...(Native.available ? { 'User-Agent': 'nklobe12/kiln-launcher/1.0 (Kiln mod manager)' } : {}),
          ...(body ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body ? JSON.stringify(body) : null,
      });
    } catch (e) {
      log('error', 'Modrinth request failed', method, path, e);
      throw new CF.ApiError("Couldn't reach Modrinth. Check your connection and try again.", 0);
    }
    if (res.status === 404) throw new CF.ApiError('Not found on Modrinth.', 404);
    if (res.status === 429) throw new CF.ApiError('Modrinth is busy. Wait a minute and try again.', 429);
    if (res.status < 200 || res.status >= 300) throw new CF.ApiError(`Modrinth returned ${res.status}.`, res.status);
    let json;
    try { json = JSON.parse(res.text); } catch (e) { throw new CF.ApiError('Modrinth sent a response Kiln could not read.', res.status); }
    cache.set(key, { t: Date.now(), v: json });
    if (cache.size > 400) cache.delete(cache.keys().next().value);
    return json;
  }

  return {
    async search({ query, type, version, loader, category, index = 'relevance', offset = 0, limit = 30 }) {
      const facets = [[`project_type:${type}`]];
      if (version) facets.push([`versions:${version}`]);
      if (loader) facets.push([`categories:${loader}`]);
      if (category) facets.push([`categories:${category}`]);
      const r = await request('/search', { params: { query: query || undefined, facets, index, offset, limit } });
      return { data: (r.hits || []).map(toMod), total: r.total_hits || 0 };
    },
    async project(id) {
      return toMod(await request(`/project/${encodeURIComponent(id)}`));
    },
    async projects(ids) {
      const out = [];
      for (const part of chunk([...new Set(ids)].filter(Boolean), 100)) {
        const r = await request('/projects', { params: { ids: part } });
        out.push(...r.map(toMod));
      }
      return out;
    },
    async members(id) {
      try { return await request(`/project/${encodeURIComponent(id)}/members`, { ttl: 3600000 }); } catch (e) { return []; }
    },
    async versions(id, { gameVersion, loaders } = {}) {
      const r = await request(`/project/${encodeURIComponent(id)}/version`, {
        params: { game_versions: gameVersion ? [gameVersion] : undefined, loaders: loaders && loaders.length ? loaders : undefined },
      });
      return r.map(toFile);
    },
    async version(id) {
      return toFile(await request(`/version/${encodeURIComponent(id)}`, { ttl: 3600000 }));
    },
    async versionsByHash(hashes) {
      if (!hashes.length) return {};
      const r = await request('/version_files', { method: 'POST', body: { hashes, algorithm: 'sha1' } });
      const out = {};
      for (const [h, v] of Object.entries(r || {})) out[h] = toFile(v);
      return out;
    },
    async latestByHash(hashes, { loaders, gameVersions } = {}) {
      if (!hashes.length) return {};
      const body = { hashes, algorithm: 'sha1', game_versions: gameVersions };
      if (loaders && loaders.length) body.loaders = loaders;
      const r = await request('/version_files/update', { method: 'POST', body, ttl: 60000 });
      const out = {};
      for (const [h, v] of Object.entries(r || {})) out[h] = toFile(v);
      return out;
    },
    async categories(type) {
      const r = await request('/tag/category', { ttl: 86400000 });
      return r.filter((c) => c.project_type === type && c.header !== 'resolutions' && c.header !== 'performance impact').map((c) => c.name).sort();
    },
    async gameVersions() {
      const r = await request('/tag/game_version', { ttl: 86400000 });
      return r.filter((v) => v.version_type === 'release').map((v) => v.version);
    },
  };
})();

function titleCase(s) {
  return String(s || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

// Modrinth project or search hit -> Kiln project shape
function toMod(p) {
  if (!p) return null;
  const type = p.project_type || 'mod';
  const cats = p.display_categories || p.categories || [];
  const loaders = (p.loaders || cats).filter((c) => MR_LOADERS.includes(c));
  const gallery = (p.gallery || []).map((g) => (typeof g === 'string' ? { url: g, thumbnailUrl: g, title: '' } : { url: g.url, thumbnailUrl: g.url, title: g.title || '' }));
  return {
    source: 'modrinth',
    id: p.project_id || p.id,
    slug: p.slug,
    name: p.title,
    summary: p.description || '',
    body: p.body || '',
    classId: MR_TYPES[type] || 6,
    mrType: type,
    logo: { thumbnailUrl: p.icon_url || '', url: p.icon_url || '' },
    authors: p.author ? [{ name: p.author, url: `https://modrinth.com/user/${p.author}` }] : [],
    downloadCount: p.downloads || 0,
    followers: p.follows != null ? p.follows : p.followers || 0,
    dateCreated: p.date_created || p.published,
    dateModified: p.date_modified || p.updated,
    dateReleased: p.date_modified || p.updated,
    links: {
      websiteUrl: `https://modrinth.com/${type}/${p.slug || p.project_id || p.id}`,
      sourceUrl: p.source_url || '',
      issuesUrl: p.issues_url || '',
      wikiUrl: p.wiki_url || '',
    },
    gameVersions: (p.game_versions || p.versions || []).filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v)),
    loaders,
    categories: cats.filter((c) => !MR_LOADERS.includes(c)).map((c) => ({ name: titleCase(c) })),
    screenshots: gallery,
    latestFilesIndexes: [],
    latestFiles: [],
  };
}

// Modrinth version -> Kiln file shape
function toFile(v) {
  if (!v) return null;
  const f = (v.files || []).find((x) => x.primary) || (v.files || [])[0] || {};
  return {
    source: 'modrinth',
    id: v.id,
    modId: v.project_id,
    displayName: v.name || v.version_number,
    versionNumber: v.version_number,
    fileName: f.filename,
    releaseType: MR_RELEASE[v.version_type] || 1,
    fileDate: v.date_published,
    fileLength: f.size || 0,
    downloadUrl: f.url || null,
    hashes: f.hashes && f.hashes.sha1 ? [{ algo: 1, value: f.hashes.sha1 }] : [],
    sha512: f.hashes ? f.hashes.sha512 : null,
    gameVersions: [...(v.game_versions || []), ...(v.loaders || []).map(titleCase).map((l) => (l === 'Neoforge' ? 'NeoForge' : l))],
    dependencies: v.dependencies || [],
    changelog: v.changelog || '',
    isAvailable: true,
  };
}

const isModrinth = (x) => !!x && x.source === 'modrinth';
const projectHref = (mod, context) => `${isModrinth(mod) ? '#/mr/' : '#/project/'}${encodeURIComponent(mod.id)}${context ? '?for=' + encodeURIComponent(context) : ''}`;
const contentHref = (c, context) => `${c.source === 'modrinth' ? '#/mr/' : '#/project/'}${encodeURIComponent(c.projectId)}${context ? '?for=' + encodeURIComponent(context) : ''}`;

function mrLoaderFilter(profile, classId) {
  if (classId !== 6 || !profile || !profile.loader || profile.loader.type === 'vanilla') return undefined;
  return profile.loader.type === 'quilt' ? ['quilt', 'fabric'] : [profile.loader.type];
}

async function mrBestFile(mod, profile) {
  let files = [];
  try {
    files = await MR.versions(mod.id, { gameVersion: profile && profile.mc, loaders: mrLoaderFilter(profile, mod.classId) });
  } catch (e) {
    log('warn', 'Modrinth versions lookup failed for', mod.name, e);
  }
  return pickBest(files, profile, mod.classId);
}

// Minimal Markdown -> HTML for Modrinth descriptions (inline HTML passes
// through and everything is cleaned by sanitizeHtml afterwards).
function markdownToHtml(md) {
  const esc = (s) => s.replace(/&(?![a-z#0-9]+;)/gi, '&amp;');
  const inline = (s) => esc(s)
    .replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<img alt="$1" src="$2">')
    .replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, '<a href="$2">$1</a>')
    .replace(/<(https?:\/\/[^>\s]+)>/g, '<a href="$1">$1</a>')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/__([^_]+)__/g, '<strong>$1</strong>')
    .replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>')
    .replace(/~~([^~]+)~~/g, '<s>$1</s>');
  const lines = String(md || '').replace(/\r\n?/g, '\n').split('\n');
  const out = [];
  let para = [];
  let list = null;
  const flushPara = () => { if (para.length) { out.push('<p>' + inline(para.join(' ')) + '</p>'); para = []; } };
  const flushList = () => { if (list) { out.push(`<${list.tag}>` + list.items.map((i) => `<li>${inline(i)}</li>`).join('') + `</${list.tag}>`); list = null; } };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (/^```/.test(line)) {
      flushPara(); flushList();
      const code = [];
      while (++i < lines.length && !/^```/.test(lines[i])) code.push(lines[i]);
      out.push('<pre><code>' + code.join('\n').replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</code></pre>');
      continue;
    }
    let m;
    if ((m = /^(#{1,6})\s+(.*)$/.exec(line))) { flushPara(); flushList(); out.push(`<h${m[1].length}>${inline(m[2])}</h${m[1].length}>`); continue; }
    if (/^\s*([-*_])\s*\1\s*\1[\s\1]*$/.test(line)) { flushPara(); flushList(); out.push('<hr>'); continue; }
    if ((m = /^>\s?(.*)$/.exec(line))) { flushPara(); flushList(); out.push(`<blockquote>${inline(m[1])}</blockquote>`); continue; }
    if ((m = /^\s*[-*+]\s+(.*)$/.exec(line))) { flushPara(); if (!list || list.tag !== 'ul') { flushList(); list = { tag: 'ul', items: [] }; } list.items.push(m[1]); continue; }
    if ((m = /^\s*\d+[.)]\s+(.*)$/.exec(line))) { flushPara(); if (!list || list.tag !== 'ol') { flushList(); list = { tag: 'ol', items: [] }; } list.items.push(m[1]); continue; }
    if (!line.trim()) { flushPara(); flushList(); continue; }
    if (/^\s*</.test(line) && !para.length) { flushList(); out.push(line); continue; }
    flushList();
    para.push(line.trim());
  }
  flushPara(); flushList();
  return out.join('\n');
}
