// Sample CurseForge-shaped data for UI tests. Every project here is invented.
import crypto from 'node:crypto';
import { buildModrinth } from './fixtures-modrinth.mjs';

const MC = ['1.21.1', '1.21', '1.20.6', '1.20.4', '1.20.1', '1.19.2', '1.18.2', '1.16.5', '1.12.2'];
const LOADER_ID = { forge: 1, fabric: 4, quilt: 5, neoforge: 6 };
const LOADER_NAME = { forge: 'Forge', fabric: 'Fabric', quilt: 'Quilt', neoforge: 'NeoForge' };
const COLORS = ['#5fb39a', '#d9824b', '#6d8fd6', '#c96fb3', '#d4b44a', '#4fa3c7', '#a37a52', '#7a9d4a'];

function logoSvg(name, i) {
  const c = COLORS[i % COLORS.length];
  const letters = name.split(/\s+/).filter((w) => /^[A-Za-z]/.test(w)).map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return `<svg xmlns="http://www.w3.org/2000/svg" width="128" height="128"><rect width="128" height="128" rx="22" fill="${c}"/><path d="M0 96 L64 64 L128 96 L128 128 L0 128Z" fill="rgba(0,0,0,.18)"/><text x="64" y="78" font-family="Arial" font-weight="700" font-size="44" text-anchor="middle" fill="#fff">${letters}</text></svg>`;
}

const categories = [
  { id: 420, name: 'Performance', classId: 6 }, { id: 421, name: 'Library', classId: 6 },
  { id: 422, name: 'World Gen', classId: 6 }, { id: 423, name: 'Map and Information', classId: 6 },
  { id: 424, name: 'Technology', classId: 6 }, { id: 425, name: 'Utility & QoL', classId: 6 },
  { id: 426, name: 'Mobs', classId: 6 }, { id: 4471001, name: 'Adventure and RPG', classId: 4471 },
  { id: 4471002, name: 'Tech', classId: 4471 }, { id: 4471003, name: 'Small / Light', classId: 4471 },
  { id: 12001, name: '16x', classId: 12 }, { id: 6552001, name: 'Realistic', classId: 6552 },
];

// [id, name, classId, categoryIds, downloads, author, summary, versions, loaders, deps, extra]
const PROJECTS = [
  [1001, 'Lumen Engine', 6, [420], 98400000, 'Glasswright', 'A rendering engine rewrite that doubles frame rates on phones and old laptops.', ['1.21.1', '1.21', '1.20.1'], ['fabric', 'quilt', 'neoforge'], [[1002, 3]]],
  [1002, 'Lantern Lib', 6, [421], 120500000, 'Glasswright', 'Shared code for Lumen Engine and friends. Install it when another mod asks.', ['1.21.1', '1.21', '1.20.1', '1.19.2'], ['fabric', 'quilt', 'forge', 'neoforge'], []],
  [1003, 'Biome Bloom', 6, [422], 41200000, 'Fernhollow', 'Eighty new biomes with hand-painted trees, flowers and calmer rivers.', ['1.21.1', '1.20.1'], ['fabric', 'forge', 'neoforge'], [[1002, 3]]],
  [1004, 'Pocket Map', 6, [423], 36900000, 'Cartographer Co', 'A light minimap with waypoints, cave mode and death markers.', ['1.21.1', '1.20.4', '1.20.1', '1.18.2'], ['fabric', 'forge', 'neoforge', 'quilt'], []],
  [1005, 'Copper Pipes', 6, [424], 12800000, 'Tinkerline', 'Move items and fluids through oxidizing copper pipes.', ['1.20.1', '1.19.2'], ['forge', 'neoforge'], [[1002, 3]]],
  [1006, 'Quiet Menus', 6, [425], 8300000, 'Softpaw', 'Cleaner pause and title screens that load faster.', ['1.21.1', '1.20.1'], ['fabric'], [], { update: true }],
  [1007, 'Stack Sense', 6, [425], 22100000, 'Softpaw', 'Sort chests, move stacks and see totals at a glance.', ['1.21.1', '1.20.1', '1.16.5'], ['fabric', 'forge', 'neoforge'], []],
  [1008, 'Mob Manners', 6, [426], 5400000, 'Fernhollow', 'Mobs that wander, nest and flee instead of standing still.', ['1.21.1', '1.20.1'], ['fabric', 'forge'], [[1004, 5]]],
  [1009, 'Clockwork Crates', 6, [424], 3100000, 'Tinkerline', 'Crates that keep their items when broken. Author allows website downloads only.', ['1.21.1', '1.20.1'], ['fabric', 'forge'], [], { noDistribution: true }],
  [1010, 'Starlit Skies', 6, [422], 18700000, 'Nightjar', 'Real constellations, meteor showers and a moon that changes size.', ['1.21.1', '1.20.1', '1.19.2'], ['fabric', 'forge', 'neoforge', 'quilt'], []],
  [1011, 'Ore Echo', 6, [425], 9900000, 'Nightjar', 'Hear nearby ores faintly when you tap the sneak key twice.', ['1.21.1', '1.20.1'], ['fabric', 'neoforge'], []],
  [1012, 'Garden Tools', 6, [425], 6600000, 'Fernhollow', 'Trowels, shears and seed bags for faster farming.', ['1.20.1', '1.12.2'], ['forge'], []],
  [2001, 'Ember Valley', 4471, [4471001, 4471003], 4200000, 'Kilnworks', 'A cozy 60-mod adventure pack tuned for phones and tablets.', ['1.21.1'], ['fabric'], [], { pack: { loader: 'fabric-0.16.5', mods: [1001, 1002, 1003, 1006, 1009], ram: 3072 } }],
  [2002, 'Iron & Ash', 4471, [4471002], 2900000, 'Forgefolk', 'Tech and automation with copper pipes and slow-burning furnaces.', ['1.20.1'], ['forge'], [], { pack: { loader: 'forge-47.3.0', mods: [1002, 1005, 1007], ram: 4096 } }],
  [2003, 'Quiet Isles', 4471, [4471003], 1700000, 'Softpaw', 'Small islands, fishing and boats. Runs well on 4 GB phones.', ['1.21.1'], ['fabric'], [], { pack: { loader: 'fabric-0.16.5', mods: [1002, 1004, 1007], ram: 2048 } }],
  [2004, 'Deepstone Saga', 4471, [4471001], 6100000, 'Nightjar', 'Dungeons, bosses and a story told through lost journals.', ['1.20.1'], ['neoforge'], [], { pack: { loader: 'neoforge-47.1.106', mods: [1002, 1003], ram: 6144 } }],
  [2005, 'Lantern Lite', 4471, [4471003], 950000, 'Glasswright', 'Vanilla plus performance: Lumen Engine and a minimap.', ['1.21.1'], ['quilt'], [], { pack: { loader: 'quilt-0.26.4', mods: [1001, 1002, 1004], ram: 2048 } }],
  [2006, 'Sky Kiln', 4471, [4471002], 3300000, 'Kilnworks', 'Skyblock with pottery, glazes and kiln automation.', ['1.20.1'], ['forge'], [], { pack: { loader: 'forge-47.3.0', mods: [1002, 1007], ram: 3072 } }],
  [3001, 'Soft Light 16x', 12, [12001], 14200000, 'Pixelmoss', 'Gentle colors and rounded edges that keep the vanilla feel.', ['1.21.1', '1.20.1', '1.19.2'], [], []],
  [4001, 'Glaze Shaders', 6552, [6552001], 9800000, 'Nightjar', 'Soft shadows and wet stone reflections that phones can run.', ['1.21.1', '1.20.1'], [], []],
];

export function buildFixtures() {
  const blobs = new Map(); // url -> { type, body: Buffer }
  const mods = new Map();
  const files = new Map();
  let t0 = Date.parse('2026-10-10T12:00:00Z');

  const sha1 = (buf) => crypto.createHash('sha1').update(buf).digest('hex');

  for (const [i, row] of PROJECTS.entries()) {
    const [id, name, classId, catIds, downloads, author, summary, versions, loaders, deps, extra = {}] = row;
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/-+$/, '');
    const logoUrl = `https://media.forgecdn.net/avatars/thumbnails/${id}/logo.png`;
    blobs.set(logoUrl, { type: 'image/svg+xml', body: Buffer.from(logoSvg(name, i)) });
    const shots = [1, 2, 3].map((n) => {
      const url = `https://media.forgecdn.net/attachments/${id}/${n}.png`;
      blobs.set(url, { type: 'image/svg+xml', body: Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="640" height="400"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7cc4e8"/><stop offset="1" stop-color="#cfe9d9"/></linearGradient></defs><rect width="640" height="400" fill="url(#g)"/><path d="M0 300 L120 240 L260 290 L380 220 L520 280 L640 230 L640 400 L0 400Z" fill="${COLORS[(i + n) % COLORS.length]}"/><text x="24" y="44" font-family="Arial" font-size="24" fill="#1d2a24">${name.replace(/&/g, '&amp;')} — screenshot ${n}</text></svg>`) });
      return { id: id * 10 + n, modId: id, title: `${name} screenshot ${n}`, description: '', thumbnailUrl: url, url };
    });

    // Files: one per version x loader group (newest first), plus an older one for update tests
    const modFiles = [];
    const loaderSets = classId === 6 ? loaders.map((l) => [l]) : [[]];
    let n = 0;
    for (const v of versions) {
      for (const ls of (classId === 4471 ? [[]] : loaderSets)) {
        n++;
        const fid = id * 100 + n;
        const loaderTag = ls.length ? '-' + ls[0] : '';
        const ext = classId === 6 ? 'jar' : 'zip';
        const fileName = `${slug}${loaderTag}-${v}-${classId === 4471 ? '1.4.0' : '2.' + n + '.0'}.${ext}`;
        const date = new Date(t0 - (i * 3 + n) * 86400000 * 2).toISOString();
        let body;
        if (classId === 4471) body = Buffer.alloc(0); // filled below
        else body = Buffer.from(`PK-fake-${fileName}`.padEnd(2048 + n * 37, '.'));
        const url = extra.noDistribution ? null : `https://edge.forgecdn.net/files/${Math.floor(fid / 1000)}/${fid % 1000}/${fileName}`;
        const f = {
          id: fid, gameId: 432, modId: id, isAvailable: true,
          displayName: fileName.replace(/\.(jar|zip)$/, ''), fileName, releaseType: 1, fileStatus: 4,
          hashes: [], fileDate: date, fileLength: body.length, downloadCount: Math.round(downloads / (n + 3)),
          downloadUrl: url,
          gameVersions: [v, ...ls.map((l) => LOADER_NAME[l]), classId === 6 ? 'Client' : null].filter(Boolean),
          sortableGameVersions: [],
          dependencies: deps.map(([modId, relationType]) => ({ modId, relationType })),
          isServerPack: false,
          _body: body,
          _pack: classId === 4471 ? extra.pack : null,
        };
        modFiles.push(f);
      }
    }
    if (extra.update) {
      // An older 1.21.1 fabric file so the update check finds something
      const old = { ...modFiles[0], displayName: modFiles[0].displayName.replace(/2\.\d+\.0/, '1.9.0'), fileName: modFiles[0].fileName.replace(/2\.\d+\.0/, '1.9.0'), fileDate: new Date(Date.parse(modFiles[0].fileDate) - 40 * 86400000).toISOString(), _body: Buffer.from('PK-old'.padEnd(1500, '.')) };
      old.id = id * 100;
      old.downloadUrl = old.downloadUrl && old.downloadUrl.replace(/[^/]+$/, old.fileName);
      modFiles.push(old);
    }
    if (classId === 6 && i % 4 === 1) {
      // a beta build on top
      const b = { ...modFiles[0], id: id * 100 + 80, releaseType: 2, displayName: modFiles[0].displayName + '-beta', fileName: modFiles[0].fileName.replace(/\.jar$/, '-beta.jar'), fileDate: new Date(t0 + 86400000).toISOString() };
      b.downloadUrl = b.downloadUrl && b.downloadUrl.replace(/[^/]+$/, b.fileName);
      modFiles.push(b);
    }
    for (const f of modFiles) files.set(f.id, f);

    const sorted = modFiles.slice().sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));
    const mod = {
      id, gameId: 432, name, slug,
      links: { websiteUrl: `https://www.curseforge.com/minecraft/${classId === 4471 ? 'modpacks' : classId === 12 ? 'texture-packs' : classId === 6552 ? 'shaders' : 'mc-mods'}/${slug}`, wikiUrl: '', issuesUrl: classId === 6 ? `https://example.org/${slug}/issues` : '', sourceUrl: classId === 6 ? `https://example.org/${slug}` : '' },
      summary, status: 4, downloadCount: downloads, isFeatured: i < 3, primaryCategoryId: catIds[0],
      categories: catIds.map((c) => ({ id: c, gameId: 432, name: categories.find((x) => x.id === c).name, classId, slug: 'c' + c, url: '', iconUrl: '' })),
      classId,
      authors: [{ id: 9000 + i, name: author, url: `https://www.curseforge.com/members/${author.toLowerCase().replace(/\W+/g, '')}` }],
      logo: { id: id * 7, modId: id, title: 'logo', thumbnailUrl: logoUrl, url: logoUrl },
      screenshots: classId === 6 && i % 3 === 2 ? [] : shots,
      mainFileId: sorted[0].id,
      latestFiles: sorted.slice(0, 6),
      latestFilesIndexes: sorted.filter((f) => f.id % 100 !== 0).map((f) => ({
        gameVersion: f.gameVersions[0], fileId: f.id, filename: f.fileName, releaseType: f.releaseType,
        gameVersionTypeId: 1, modLoader: f.gameVersions[1] ? LOADER_ID[f.gameVersions[1].toLowerCase()] : null,
      })),
      dateCreated: new Date(t0 - (400 + i * 30) * 86400000).toISOString(),
      dateModified: sorted[0].fileDate,
      dateReleased: sorted[0].fileDate,
      allowModDistribution: !extra.noDistribution,
      gamePopularityRank: i + 1, isAvailable: true, thumbsUpCount: 100 + i,
    };
    mods.set(id, mod);
  }

  // Build modpack zips now that all files exist
  for (const f of files.values()) {
    if (!f._pack) continue;
    const pack = f._pack;
    const mc = f.gameVersions[0];
    const packFiles = pack.mods.map((modId) => {
      const m = mods.get(modId);
      const loaderType = pack.loader.split('-')[0];
      const fit = [...files.values()].filter((x) => x.modId === modId && x.releaseType === 1 && x.gameVersions[0] === mc && (!x.gameVersions[1] || x.gameVersions[1].toLowerCase() === loaderType || (loaderType === 'quilt' && x.gameVersions[1] === 'Fabric')))
        .sort((a, b) => b.id - a.id)[0] || [...files.values()].find((x) => x.modId === modId);
      return { projectID: m.id, fileID: fit.id, required: true };
    });
    const manifest = {
      minecraft: { version: mc, modLoaders: [{ id: pack.loader, primary: true }], recommendedRam: pack.ram },
      manifestType: 'minecraftModpack', manifestVersion: 1,
      name: mods.get(f.modId).name, version: '1.4.0', author: mods.get(f.modId).authors[0].name,
      files: packFiles, overrides: 'overrides',
    };
    f._body = storeZip([
      { name: 'manifest.json', data: Buffer.from(JSON.stringify(manifest, null, 2)) },
      { name: 'modlist.html', data: Buffer.from('<ul></ul>') },
      { name: 'overrides/config/lumen.toml', data: Buffer.from('quality = "phone"\n') },
      { name: 'overrides/options.txt', data: Buffer.from('renderDistance:8\nguiScale:2\n') },
    ]);
    f.fileLength = f._body.length;
  }
  for (const f of files.values()) {
    f.hashes = [{ value: sha1(f._body), algo: 1 }];
    if (f.downloadUrl) blobs.set(f.downloadUrl, { type: 'application/octet-stream', body: f._body });
  }

  const forgeInstaller = 'https://maven.minecraftforge.net/net/minecraftforge/forge/1.20.1-47.3.0/forge-1.20.1-47.3.0-installer.jar';
  blobs.set(forgeInstaller, { type: 'application/java-archive', body: Buffer.from('PK-forge-installer'.padEnd(4096, '.')) });

  const clean = (f) => { const { _body, _pack, ...rest } = f; return rest; };
  const json = (data, status = 200) => ({ status, type: 'application/json', body: Buffer.from(JSON.stringify(data)) });
  const games = [
    { id: 432, name: 'Minecraft', slug: 'minecraft', assets: { iconUrl: 'https://media.forgecdn.net/game/432.png', tileUrl: 'https://media.forgecdn.net/game/432.png', coverUrl: '' }, status: 1, apiStatus: 1 },
    { id: 1, name: 'World of Warcraft', slug: 'wow', assets: { iconUrl: 'https://media.forgecdn.net/game/1.png', tileUrl: 'https://media.forgecdn.net/game/1.png' }, status: 1, apiStatus: 1 },
    { id: 78062, name: 'The Sims 4', slug: 'sims4', assets: { iconUrl: 'https://media.forgecdn.net/game/78062.png', tileUrl: 'https://media.forgecdn.net/game/78062.png' }, status: 1, apiStatus: 1 },
    { id: 669, name: 'Stardew Valley', slug: 'stardewvalley', assets: { iconUrl: 'https://media.forgecdn.net/game/669.png', tileUrl: 'https://media.forgecdn.net/game/669.png' }, status: 1, apiStatus: 1 },
  ];
  games.forEach((g, i) => blobs.set(g.assets.iconUrl, { type: 'image/svg+xml', body: Buffer.from(logoSvg(g.name, i + 2)) }));

  const modrinth = buildModrinth();
  function handle({ url, method = 'GET', headers = {}, body = null }) {
    const mr = modrinth.handle({ url, method, body });
    if (mr) return mr;
    const u = new URL(url);
    if (blobs.has(u.origin + u.pathname)) return { status: 200, ...blobs.get(u.origin + u.pathname) };
    if (u.hostname === 'meta.fabricmc.net' || u.hostname === 'meta.quiltmc.org') {
      const m = /\/versions\/loader\/([^/]+)\/([^/]+)\/profile\/json$/.exec(u.pathname);
      if (m) {
        const kind = u.hostname.includes('fabric') ? 'fabric' : 'quilt';
        return json({ id: `${kind}-loader-${m[2]}-${m[1]}`, inheritsFrom: m[1], releaseTime: '2026-09-01T00:00:00Z', type: 'release', mainClass: 'net.fabricmc.loader.impl.launch.knot.KnotClient', libraries: [] });
      }
      const l = /\/versions\/loader\/([^/]+)$/.exec(u.pathname);
      if (l) return json([{ loader: { version: '0.16.5', stable: true } }, { loader: { version: '0.16.4', stable: true } }]);
    }
    if (u.hostname !== 'api.curseforge.com') return { status: 404, type: 'text/plain', body: Buffer.from('not found') };
    const key = headers['x-api-key'] || headers['X-Api-Key'];
    if (key !== 'test-key') return json({ error: 'Forbidden' }, 403);
    const p = u.pathname;
    const q = Object.fromEntries(u.searchParams);
    const req = body ? JSON.parse(body) : {};
    let m;
    if (p === '/v1/games') return json({ data: games, pagination: { index: 0, pageSize: 50, resultCount: games.length, totalCount: games.length } });
    if (p === '/v1/categories') {
      if (q.classesOnly) return json({ data: [{ id: 6, name: 'Mods', isClass: true }, { id: 4471, name: 'Modpacks', isClass: true }, { id: 12, name: 'Resource Packs', isClass: true }, { id: 6552, name: 'Shaders', isClass: true }] });
      return json({ data: categories.filter((c) => !q.classId || c.classId === Number(q.classId)).map((c) => ({ ...c, gameId: 432, isClass: false, slug: 'c' + c.id })) });
    }
    if (p === '/v1/minecraft/version') return json({ data: MC.map((v, i) => ({ id: i + 1, gameVersionId: 9000 + i, versionString: v, approved: true })) });
    if (p === '/v1/minecraft/modloader') {
      const v = q.version;
      const out = [];
      if (v === '1.21.1' || v === '1.21') out.push({ name: 'neoforge-21.1.77', gameVersion: v, latest: true, recommended: true }, { name: 'fabric-0.16.5-' + v, gameVersion: v, latest: true, recommended: true }, { name: 'quilt-0.26.4-' + v, gameVersion: v, latest: true, recommended: true }, { name: 'forge-52.0.16', gameVersion: v, latest: true, recommended: false });
      if (v === '1.20.1') out.push({ name: 'forge-47.3.0', gameVersion: v, latest: true, recommended: true }, { name: 'forge-47.2.0', gameVersion: v, latest: false, recommended: false }, { name: 'fabric-0.16.5-' + v, gameVersion: v, latest: true, recommended: true });
      return json({ data: out });
    }
    if (p === '/v1/mods/search') {
      let list = [...mods.values()].filter((x) => x.gameId === Number(q.gameId || 432));
      if (q.classId) list = list.filter((x) => x.classId === Number(q.classId));
      if (q.categoryId) list = list.filter((x) => x.categories.some((c) => c.id === Number(q.categoryId)));
      if (q.searchFilter) list = list.filter((x) => (x.name + ' ' + x.summary).toLowerCase().includes(q.searchFilter.toLowerCase()));
      if (q.gameVersion) list = list.filter((x) => x.latestFilesIndexes.some((i) => i.gameVersion === q.gameVersion));
      if (q.modLoaderType) list = list.filter((x) => x.latestFilesIndexes.some((i) => i.modLoader === Number(q.modLoaderType)));
      const sf = Number(q.sortField || 2);
      if (sf === 4) list.sort((a, b) => a.name.localeCompare(b.name));
      else if (sf === 3 || sf === 11) list.sort((a, b) => Date.parse(b.dateModified) - Date.parse(a.dateModified));
      else list.sort((a, b) => b.downloadCount - a.downloadCount);
      const index = Number(q.index || 0);
      const size = Number(q.pageSize || 30);
      return json({ data: list.slice(index, index + size), pagination: { index, pageSize: size, resultCount: Math.min(size, Math.max(0, list.length - index)), totalCount: list.length } });
    }
    if (p === '/v1/mods' && method === 'POST') return json({ data: (req.modIds || []).map((id) => mods.get(id)).filter(Boolean) });
    if (p === '/v1/mods/files' && method === 'POST') return json({ data: (req.fileIds || []).map((id) => files.get(id)).filter(Boolean).map(clean) });
    if ((m = /^\/v1\/mods\/(\d+)$/.exec(p))) return mods.has(Number(m[1])) ? json({ data: mods.get(Number(m[1])) }) : json({}, 404);
    if ((m = /^\/v1\/mods\/(\d+)\/description$/.exec(p))) {
      const mod = mods.get(Number(m[1]));
      return json({ data: `<h2>About ${mod.name}</h2><p>${mod.summary}</p><p><img src="${mod.screenshots[0] ? mod.screenshots[0].url : mod.logo.url}" width="640"></p><h3>Features</h3><ul><li>Works with <strong>${mod.categories[0].name}</strong> packs</li><li>Tested on phones and tablets</li></ul><p><a href="https://www.curseforge.com/linkout?remoteUrl=https%253a%252f%252fexample.org%252fwiki">Read the wiki</a></p><script>alert('x')</script><iframe src="https://www.youtube.com/embed/abc123"></iframe>` });
    }
    if ((m = /^\/v1\/mods\/(\d+)\/files\/(\d+)\/changelog$/.exec(p))) return json({ data: '<ul><li>Fixed a crash when opening the map</li><li>Faster loading on iPad</li></ul>' });
    if ((m = /^\/v1\/mods\/(\d+)\/files\/(\d+)$/.exec(p))) return files.has(Number(m[2])) ? json({ data: clean(files.get(Number(m[2]))) }) : json({}, 404);
    if ((m = /^\/v1\/mods\/(\d+)\/files$/.exec(p))) {
      let list = [...files.values()].filter((f) => f.modId === Number(m[1]));
      if (q.gameVersion) list = list.filter((f) => f.gameVersions.includes(q.gameVersion));
      if (q.modLoaderType) {
        const name = Object.entries(LOADER_ID).find(([, v]) => v === Number(q.modLoaderType))[0];
        list = list.filter((f) => f.gameVersions.map((g) => g.toLowerCase()).includes(name));
      }
      list.sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));
      const index = Number(q.index || 0);
      const size = Number(q.pageSize || 50);
      return json({ data: list.slice(index, index + size).map(clean), pagination: { index, pageSize: size, resultCount: list.length, totalCount: list.length } });
    }
    return json({ error: 'unknown ' + p }, 404);
  }

  return { handle, mods, files };
}

function crc32(buf) {
  let c;
  const table = [];
  for (let n = 0; n < 256; n++) {
    c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  let crc = 0xffffffff;
  for (const b of buf) crc = table[(crc ^ b) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export function storeZip(entries) {
  const parts = [];
  const central = [];
  let offset = 0;
  for (const e of entries) {
    const name = Buffer.from(e.name);
    const crc = crc32(e.data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(e.data.length, 18); local.writeUInt32LE(e.data.length, 22); local.writeUInt16LE(name.length, 26);
    parts.push(local, name, e.data);
    const cen = Buffer.alloc(46);
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE(20, 4); cen.writeUInt16LE(20, 6);
    cen.writeUInt32LE(crc, 16); cen.writeUInt32LE(e.data.length, 20); cen.writeUInt32LE(e.data.length, 24); cen.writeUInt16LE(name.length, 28); cen.writeUInt32LE(offset, 42);
    central.push(cen, name);
    offset += 30 + name.length + e.data.length;
  }
  const cenBuf = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(entries.length, 8); end.writeUInt16LE(entries.length, 10); end.writeUInt32LE(cenBuf.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, cenBuf, end]);
}
