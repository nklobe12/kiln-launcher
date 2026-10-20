// Sample Modrinth-shaped data for UI tests. Every project here is invented.
import crypto from 'node:crypto';
import { storeZip } from './fixtures.mjs';

const sha1 = (b) => crypto.createHash('sha1').update(b).digest('hex');
const sha512 = (b) => crypto.createHash('sha512').update(b).digest('hex');
const CDN = 'https://cdn.modrinth.com/data';

function icon(letter, color) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="96" height="96"><circle cx="48" cy="48" r="46" fill="${color}"/><text x="48" y="62" font-family="Arial" font-weight="700" font-size="40" text-anchor="middle" fill="#fff">${letter}</text></svg>`;
}

// [id, slug, title, type, author, downloads, follows, description, gameVersions, loaders, categories, versions]
// versions: [versionId, versionNumber, mc, loaders, type, daysAgo, deps]
const PROJECTS = [
  ['AAAA0001', 'lumina', 'Lumina', 'mod', 'glowworks', 4100000, 9200, 'Smooth lighting and faster chunk rendering for low-power devices.', ['1.21.1', '1.20.1'], ['fabric', 'quilt'], ['optimization'],
    [['LUM00002', '2.2.0', '1.21.1', ['fabric', 'quilt'], 'release', 4, [['AAAA0002', null, 'required']]],
     ['LUM00001', '2.1.0', '1.20.1', ['fabric', 'quilt'], 'release', 60, [['AAAA0002', null, 'required']]]]],
  ['AAAA0002', 'core-lib', 'Core Lib', 'mod', 'glowworks', 6800000, 3100, 'Shared library used by Lumina and other Glowworks mods.', ['1.21.1', '1.20.1'], ['fabric', 'quilt', 'neoforge'], ['library'],
    [['COR00002', '1.5.0', '1.21.1', ['fabric', 'quilt', 'neoforge'], 'release', 10, []],
     ['COR00001', '1.4.0', '1.20.1', ['fabric', 'neoforge'], 'release', 80, []]]],
  ['AAAA0003', 'tidy-inventory', 'Tidy Inventory', 'mod', 'sortbird', 2300000, 5100, 'One-tap chest sorting with touch-friendly buttons.', ['1.21.1'], ['fabric', 'neoforge'], ['storage', 'utility'],
    [['TID00003', '3.1.0', '1.21.1', ['fabric'], 'release', 3, []],
     ['TID00002', '3.0.0', '1.21.1', ['fabric'], 'release', 30, []],
     ['TID00001', '3.0.0-neo', '1.21.1', ['neoforge'], 'release', 31, []]]],
  ['AAAA0004', 'pastel-32x', 'Pastel 32x', 'resourcepack', 'sortbird', 900000, 2400, 'Soft pastel textures at 32x that stay readable on small screens.', ['1.21.1', '1.20.1'], ['minecraft'], ['32x', 'cartoon'],
    [['PAS00001', '1.0.0', '1.21.1', ['minecraft'], 'release', 15, []]]],
  ['AAAA0005', 'mist-shaders', 'Mist Shaders', 'shader', 'glowworks', 1200000, 4000, 'Fog, soft shadows and water that phones can render.', ['1.21.1'], ['iris'], ['atmosphere'],
    [['MIS00001', '0.9.0', '1.21.1', ['iris'], 'beta', 12, []]]],
  ['AAAA0006', 'moss-hollow', 'Moss Hollow', 'modpack', 'glowworks', 750000, 1800, 'A quiet forest survival pack built around Lumina and Tidy Inventory.', ['1.21.1'], ['fabric'], ['adventure', 'lightweight'],
    [['MOS00001', '1.2.0', '1.21.1', ['fabric'], 'release', 6, []]]],
  ['AAAA0007', 'stone-age', 'Stone Age', 'modpack', 'sortbird', 410000, 900, 'Start with flint tools and work up to copper machines.', ['1.21.1'], ['neoforge'], ['technology'],
    [['STO00001', '1.0.0', '1.21.1', ['neoforge'], 'release', 20, []]]],
];
const COLORS = ['#3fa47f', '#7a6fd1', '#d68a3c', '#c75f8e', '#4a8fc2', '#5b8c3a', '#a0623d'];

export function buildModrinth() {
  const blobs = new Map();
  const projects = new Map();
  const versions = new Map();
  const t0 = Date.parse('2026-10-15T12:00:00Z');

  PROJECTS.forEach(([id, slug, title, type, author, downloads, follows, description, gameVersions, loaders, categories, vers], i) => {
    const iconUrl = `${CDN}/${id}/icon.png`;
    blobs.set(iconUrl, { type: 'image/svg+xml', body: Buffer.from(icon(title[0], COLORS[i % COLORS.length])) });
    const gallery = [1, 2].map((n) => {
      const url = `${CDN}/${id}/images/${n}.png`;
      blobs.set(url, { type: 'image/svg+xml', body: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="360"><rect width="640" height="360" fill="${COLORS[(i + n) % COLORS.length]}"/><text x="24" y="48" font-family="Arial" font-size="26" fill="#fff">${title} ${n}</text></svg>`) });
      return { url, featured: n === 1, title: `${title} screenshot ${n}`, description: '', created: '2026-09-01T00:00:00Z', ordering: n };
    });
    const versionIds = [];
    for (const [vid, number, mc, vloaders, vtype, daysAgo, deps] of vers) {
      const ext = type === 'mod' ? 'jar' : type === 'modpack' ? 'mrpack' : 'zip';
      const filename = `${slug}-${number}.${ext}`;
      const url = `${CDN}/${id}/versions/${vid}/${filename}`;
      const v = {
        id: vid, project_id: id, author_id: 'user' + i, featured: false, name: `${title} ${number}`, version_number: number,
        changelog: `### ${number}\n- Faster loading on phones\n- Fixed a rare crash`, date_published: new Date(t0 - daysAgo * 86400000).toISOString(),
        downloads: Math.round(downloads / 10), version_type: vtype, status: 'listed', game_versions: [mc], loaders: vloaders,
        dependencies: deps.map(([project_id, version_id, dependency_type]) => ({ project_id, version_id, file_name: null, dependency_type })),
        files: [{ url, filename, primary: true, size: 0, hashes: {} }],
        _url: url, _type: type,
      };
      versions.set(vid, v);
      versionIds.push(vid);
    }
    projects.set(id, {
      id, slug, project_type: type, team: 'team' + i, title, description,
      body: `## About ${title}\n\n${description}\n\n![screenshot](${gallery[0].url})\n\n### Features\n- Works on **phones and tablets**\n- Made for ${gameVersions.join(', ')}\n\n[Read the wiki](https://example.org/${slug}/wiki)\n\n<script>alert(1)</script>`,
      published: new Date(t0 - (300 + i * 20) * 86400000).toISOString(), updated: new Date(t0 - (i + 2) * 86400000).toISOString(),
      status: 'approved', license: { id: 'MIT' }, client_side: 'required', server_side: 'optional',
      downloads, followers: follows, categories, additional_categories: [], game_versions: gameVersions, loaders, versions: versionIds,
      icon_url: iconUrl, issues_url: `https://example.org/${slug}/issues`, source_url: `https://example.org/${slug}`, wiki_url: null, discord_url: null,
      gallery, _author: author,
    });
  });

  // File bodies (modpacks need the other files first)
  const fileBody = new Map();
  for (const v of versions.values()) {
    if (v._type === 'modpack') continue;
    const body = Buffer.from(`PK-fake-${v.files[0].filename}`.padEnd(3000, '.'));
    fileBody.set(v.id, body);
  }
  const unknown = Buffer.from('PK-not-on-modrinth'.padEnd(1200, '.'));
  for (const v of versions.values()) {
    if (v._type !== 'modpack') continue;
    const include = v.project_id === 'AAAA0006' ? ['LUM00002', 'COR00002', 'TID00003', 'PAS00001'] : ['COR00002', 'TID00001'];
    const files = include.map((vid) => {
      const iv = versions.get(vid);
      const b = fileBody.get(vid);
      const folder = iv._type === 'mod' ? 'mods' : iv._type === 'resourcepack' ? 'resourcepacks' : 'shaderpacks';
      return { path: `${folder}/${iv.files[0].filename}`, hashes: { sha1: sha1(b), sha512: sha512(b) }, env: { client: 'required', server: 'required' }, downloads: [iv._url], fileSize: b.length };
    });
    files.push({ path: 'mods/handmade-tweaks.jar', hashes: { sha1: sha1(unknown), sha512: sha512(unknown) }, env: { client: 'required', server: 'required' }, downloads: ['https://github.com/example/handmade/releases/download/1.0/handmade-tweaks.jar'], fileSize: unknown.length });
    files.push({ path: 'mods/server-only.jar', hashes: { sha1: 'aa', sha512: 'bb' }, env: { client: 'unsupported', server: 'required' }, downloads: ['https://cdn.modrinth.com/data/x/server-only.jar'], fileSize: 10 });
    const deps = v.loaders.includes('neoforge') ? { minecraft: '1.21.1', neoforge: '21.1.77' } : { minecraft: '1.21.1', 'fabric-loader': '0.16.5' };
    const index = { formatVersion: 1, game: 'minecraft', versionId: v.version_number, name: projects.get(v.project_id).title, summary: '', files, dependencies: deps };
    fileBody.set(v.id, storeZip([
      { name: 'modrinth.index.json', data: Buffer.from(JSON.stringify(index, null, 2)) },
      { name: 'overrides/config/lumina.json5', data: Buffer.from('{ quality: "phone" }') },
      { name: 'client-overrides/options.txt', data: Buffer.from('renderDistance:8\n') },
    ]));
  }
  blobs.set('https://github.com/example/handmade/releases/download/1.0/handmade-tweaks.jar', { type: 'application/octet-stream', body: unknown });
  for (const v of versions.values()) {
    const b = fileBody.get(v.id);
    v.files[0].size = b.length;
    v.files[0].hashes = { sha1: sha1(b), sha512: sha512(b) };
    blobs.set(v._url, { type: 'application/octet-stream', body: b });
  }
  const byHash = new Map([...versions.values()].map((v) => [v.files[0].hashes.sha1, v]));

  const cleanV = (v) => { const { _url, _type, ...rest } = v; return rest; };
  const cleanP = (p) => { const { _author, ...rest } = p; return rest; };
  const json = (data, status = 200) => ({ status, type: 'application/json', body: Buffer.from(JSON.stringify(data)) });
  const arr = (s) => (s ? JSON.parse(s) : null);
  const projectOf = (idOrSlug) => projects.get(idOrSlug) || [...projects.values()].find((p) => p.slug === idOrSlug);

  function handle({ url, method = 'GET', body = null }) {
    const u = new URL(url);
    if (blobs.has(u.origin + u.pathname)) return { status: 200, ...blobs.get(u.origin + u.pathname) };
    if (u.hostname !== 'api.modrinth.com') return null;
    const p = u.pathname.replace(/^\/v2/, '');
    const q = u.searchParams;
    let m;
    if (p === '/search') {
      const facets = arr(q.get('facets')) || [];
      let list = [...projects.values()];
      for (const group of facets) {
        list = list.filter((pr) => group.some((f) => {
          const [k, v] = f.split(':');
          if (k === 'project_type') return pr.project_type === v;
          if (k === 'versions') return pr.game_versions.includes(v);
          if (k === 'categories') return pr.categories.includes(v) || pr.loaders.includes(v);
          return true;
        }));
      }
      const query = (q.get('query') || '').toLowerCase();
      if (query) list = list.filter((pr) => (pr.title + ' ' + pr.description).toLowerCase().includes(query));
      const index = q.get('index') || 'relevance';
      if (index === 'downloads') list.sort((a, b) => b.downloads - a.downloads);
      else if (index === 'follows') list.sort((a, b) => b.followers - a.followers);
      const offset = Number(q.get('offset') || 0);
      const limit = Number(q.get('limit') || 10);
      return json({
        hits: list.slice(offset, offset + limit).map((pr) => ({
          project_id: pr.id, project_type: pr.project_type, slug: pr.slug, author: pr._author, title: pr.title, description: pr.description,
          categories: [...pr.categories, ...pr.loaders], display_categories: [...pr.categories, ...pr.loaders], versions: pr.game_versions,
          downloads: pr.downloads, follows: pr.followers, icon_url: pr.icon_url, date_created: pr.published, date_modified: pr.updated,
          latest_version: pr.versions[0], license: 'MIT', client_side: 'required', server_side: 'optional', gallery: pr.gallery.map((g) => g.url),
        })),
        offset, limit, total_hits: list.length,
      });
    }
    if (p === '/projects') return json((arr(q.get('ids')) || []).map(projectOf).filter(Boolean).map(cleanP));
    if ((m = /^\/project\/([^/]+)\/members$/.exec(p))) {
      const pr = projectOf(decodeURIComponent(m[1]));
      return pr ? json([{ team_id: pr.team, role: 'Owner', user: { username: pr._author } }]) : json({}, 404);
    }
    if ((m = /^\/project\/([^/]+)\/version$/.exec(p))) {
      const pr = projectOf(decodeURIComponent(m[1]));
      if (!pr) return json({}, 404);
      const gv = arr(q.get('game_versions'));
      const ld = arr(q.get('loaders'));
      let list = pr.versions.map((id) => versions.get(id));
      if (gv) list = list.filter((v) => v.game_versions.some((x) => gv.includes(x)));
      if (ld) list = list.filter((v) => v.loaders.some((x) => ld.includes(x)));
      return json(list.map(cleanV));
    }
    if ((m = /^\/project\/([^/]+)$/.exec(p))) {
      const pr = projectOf(decodeURIComponent(m[1]));
      return pr ? json(cleanP(pr)) : json({ error: 'not_found' }, 404);
    }
    if ((m = /^\/version\/([^/]+)$/.exec(p))) return versions.has(m[1]) ? json(cleanV(versions.get(m[1]))) : json({}, 404);
    if (p === '/version_files' && method === 'POST') {
      const req = JSON.parse(body || '{}');
      const out = {};
      for (const hsh of req.hashes || []) if (byHash.has(hsh)) out[hsh] = cleanV(byHash.get(hsh));
      return json(out);
    }
    if (p === '/version_files/update' && method === 'POST') {
      const req = JSON.parse(body || '{}');
      const out = {};
      for (const hsh of req.hashes || []) {
        const v = byHash.get(hsh);
        if (!v) continue;
        const pr = projects.get(v.project_id);
        const cands = pr.versions.map((id) => versions.get(id))
          .filter((x) => !req.game_versions || x.game_versions.some((g) => req.game_versions.includes(g)))
          .filter((x) => !req.loaders || x.loaders.some((l) => req.loaders.includes(l)))
          .sort((a, b) => Date.parse(b.date_published) - Date.parse(a.date_published));
        if (cands[0]) out[hsh] = cleanV(cands[0]);
      }
      return json(out);
    }
    if (p === '/tag/category') {
      const cats = [];
      for (const pr of projects.values()) for (const c of pr.categories) if (!cats.some((x) => x.name === c && x.project_type === pr.project_type)) cats.push({ icon: '', name: c, project_type: pr.project_type, header: 'categories' });
      return json(cats);
    }
    if (p === '/tag/game_version') return json(['1.21.1', '1.21', '1.20.6', '1.20.1', '24w14a', '1.19.2'].map((v) => ({ version: v, version_type: /w/.test(v) ? 'snapshot' : 'release', date: '2026-01-01T00:00:00Z', major: false })));
    return json({ error: 'unknown ' + p }, 404);
  }
  return { handle };
}
