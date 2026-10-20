// Install engine: dependency planning, downloads, mod loaders, modpacks, launch.

function contentItem(mod, file, extra = {}) {
  const cls = classById(mod.classId) || classById(6);
  return {
    source: mod.source || 'curseforge',
    projectId: mod.id,
    fileId: file.id,
    versionId: mod.source === 'modrinth' ? file.id : undefined,
    name: mod.name,
    slug: mod.slug,
    author: modAuthor(mod),
    logo: modLogo(mod),
    classId: mod.classId,
    folder: cls.folder || 'mods',
    fileName: file.fileName,
    displayName: file.displayName || file.fileName,
    fileDate: file.fileDate,
    releaseType: file.releaseType,
    gameVersions: file.gameVersions || [],
    size: file.fileLength || 0,
    sha1: fileSha1(file),
    sha512: file.sha512 || null,
    url: fileDownloadUrl(file),
    manual: !fileDownloadUrl(file),
    website: projectWebUrl(mod),
    enabled: true,
    locked: false,
    added: Date.now(),
    ...extra,
  };
}

// Works out everything that needs installing for one project, including
// required dependencies that are not already in the profile.
async function planInstall(profile, mod, chosenFile = null) {
  const installed = new Set((profile.content || []).map((c) => c.projectId));
  const seen = new Set();
  const items = [];
  const warnings = [];
  async function add(project, file, reason) {
    if (seen.has(project.id)) return;
    seen.add(project.id);
    if (installed.has(project.id) && reason !== 'selected') return;
    const f = file || (await bestFileFor(project, profile));
    if (!f) {
      items.push({ mod: project, file: null, reason, problem: `No file for Minecraft ${profile.mc}${profile.loader && profile.loader.type !== 'vanilla' ? ' + ' + LOADER_NAMES[profile.loader.type] : ''}` });
      return;
    }
    items.push({ mod: project, file: f, reason });
    const deps = (f.dependencies || []).filter((d) => d.relationType === REL.REQUIRED);
    const incompatible = (f.dependencies || []).filter((d) => d.relationType === REL.INCOMPATIBLE && installed.has(d.modId));
    incompatible.forEach((d) => {
      const other = profile.content.find((c) => c.projectId === d.modId);
      warnings.push(`${project.name} does not work with ${other ? other.name : 'a mod you have installed'}.`);
    });
    if (!settings.get().autoDeps || !deps.length) return;
    const depMods = await CF.mods(deps.map((d) => d.modId));
    for (const dm of depMods) await add(dm, null, `Needed by ${project.name}`);
  }
  await add(mod, chosenFile, 'selected');
  return { items, warnings };
}

// Same as planInstall, for Modrinth projects
async function mrPlanInstall(profile, mod, chosenFile = null) {
  const installed = new Set((profile.content || []).map((c) => c.projectId));
  const seen = new Set();
  const items = [];
  const warnings = [];
  async function add(project, file, reason) {
    if (seen.has(project.id)) return;
    seen.add(project.id);
    if (installed.has(project.id) && reason !== 'selected') return;
    const f = file || (await mrBestFile(project, profile));
    if (!f) {
      items.push({ mod: project, file: null, reason, problem: `No file for Minecraft ${profile.mc}${profile.loader && profile.loader.type !== 'vanilla' ? ' + ' + LOADER_NAMES[profile.loader.type] : ''}` });
      return;
    }
    items.push({ mod: project, file: f, reason });
    const deps = f.dependencies || [];
    deps.filter((d) => d.dependency_type === 'incompatible' && installed.has(d.project_id)).forEach((d) => {
      const other = profile.content.find((c) => c.projectId === d.project_id);
      warnings.push(`${project.name} does not work with ${other ? other.name : 'a mod you have installed'}.`);
    });
    const required = deps.filter((d) => d.dependency_type === 'required');
    if (!settings.get().autoDeps || !required.length) return;
    const pinned = {};
    for (const d of required) {
      if (d.version_id) {
        try {
          const v = await MR.version(d.version_id);
          pinned[v.modId] = v;
          d.project_id = d.project_id || v.modId;
        } catch (e) { /* fall back to best version */ }
      }
    }
    const projects = await MR.projects(required.map((d) => d.project_id).filter(Boolean));
    for (const dp of projects) await add(dp, pinned[dp.id] || null, `Needed by ${project.name}`);
  }
  await add(mod, chosenFile, 'selected');
  return { items, warnings };
}

function planFor(profile, mod, file) {
  return isModrinth(mod) ? mrPlanInstall(profile, mod, file) : planInstall(profile, mod, file);
}

async function downloadContent(profile, item, task) {
  if (!Native.available) return; // the browser build keeps a list only
  if (!item.url) throw new Error(`${item.name} must be downloaded from CurseForge's website`);
  const path = contentPath(profile, item);
  const base = task.received || 0;
  await nativeDownload(item.url, path, {
    sha1: item.sha1,
    onProgress: (e) => Tasks.update(task, { detail: `${item.displayName} · ${fmtBytes(e.received)}${e.total ? ' of ' + fmtBytes(e.total) : ''}`, received: base + (e.received || 0) }),
  });
  if (item.classId === 17) {
    // Worlds come as zips; unpack into saves/
    await Native.call('zip.extract', { path, prefix: '', dest: `${profileDir(profile)}/saves` });
    await FS.remove(path);
  }
}

async function runPlan(profile, plan) {
  const ready = plan.items.filter((i) => i.file);
  const task = Tasks.add({ label: `Installing ${ready[0] ? ready[0].mod.name : 'content'}`, detail: profile.name, profileId: profile.id, kind: 'install' });
  Tasks.update(task, { steps: ready.length, done: 0 });
  const added = [];
  const manual = [];
  try {
    for (const it of ready) {
      const existing = profile.content.findIndex((c) => c.projectId === it.mod.id);
      const item = contentItem(it.mod, it.file, it.reason !== 'selected' ? { dependencyOf: it.reason } : {});
      if (item.manual) {
        manual.push(item);
      } else {
        await downloadContent(profile, item, task);
      }
      if (existing >= 0) {
        const old = profile.content[existing];
        if (Native.available && old.fileName !== item.fileName) await FS.remove(contentPath(profile, old)).catch(() => {});
        item.enabled = old.enabled;
        profile.content[existing] = item;
      } else {
        profile.content.push(item);
      }
      added.push(item);
      Tasks.update(task, { done: task.done + 1 });
    }
    await Profiles.save(profile, { syncLauncher: false });
    Tasks.finish(task);
    log('info', `Installed ${added.map((a) => a.name).join(', ')} into ${profile.name}`);
  } catch (e) {
    await Profiles.save(profile, { syncLauncher: false });
    Tasks.finish(task, e);
    log('error', 'Install failed', e);
    throw e;
  }
  return { added, manual };
}

async function removeContent(profile, item) {
  if (Native.available) await FS.remove(contentPath(profile, item)).catch(() => {});
  profile.content = profile.content.filter((c) => c.projectId !== item.projectId);
  await Profiles.save(profile, { syncLauncher: false });
}

async function setEnabled(profile, item, enabled) {
  if (item.enabled === enabled) return;
  const from = contentPath(profile, item);
  item.enabled = enabled;
  const to = contentPath(profile, item);
  if (Native.available && !item.manual) {
    try {
      await FS.rename(from, to);
    } catch (e) {
      item.enabled = !enabled;
      throw e;
    }
  }
  await Profiles.save(profile, { syncLauncher: false });
}

// Finds newer files for everything in a profile that is not locked.
async function checkUpdates(profile) {
  const cf = await cfCheckUpdates(profile);
  const mr = await mrCheckUpdates(profile);
  return [...cf, ...mr];
}

async function mrCheckUpdates(profile) {
  const items = profile.content.filter((c) => c.source === 'modrinth' && !c.locked && !c.manual && c.sha1);
  if (!items.length) return [];
  const loaderType = profile.loader && profile.loader.type !== 'vanilla' ? profile.loader.type : null;
  const mods = items.filter((c) => c.classId === 6);
  const other = items.filter((c) => c.classId !== 6);
  const found = {
    ...(await MR.latestByHash(mods.map((c) => c.sha1), { loaders: loaderType ? (loaderType === 'quilt' ? ['quilt', 'fabric'] : [loaderType]) : [], gameVersions: [profile.mc] })),
    ...(await MR.latestByHash(other.map((c) => c.sha1), { gameVersions: [profile.mc] })),
  };
  const out = [];
  for (const item of items) {
    const v = found[item.sha1];
    if (!v || v.id === item.versionId) continue;
    if (Date.parse(v.fileDate) <= Date.parse(item.fileDate || 0)) continue;
    if (v.releaseType > (item.releaseType || 1) || !allowedReleaseTypes().includes(v.releaseType)) continue;
    const mod = {
      source: 'modrinth', id: item.projectId, slug: item.slug, name: item.name, classId: item.classId,
      logo: { thumbnailUrl: item.logo }, authors: [{ name: item.author }], links: { websiteUrl: item.website },
    };
    out.push({ mod, item, file: v });
  }
  return out;
}

async function cfCheckUpdates(profile) {
  const items = profile.content.filter((c) => c.source !== 'modrinth' && !c.locked && !c.manual && c.projectId);
  if (!items.length || !CF.hasKey()) return [];
  const mods = await CF.mods(items.map((c) => c.projectId));
  const allowed = allowedReleaseTypes();
  const candidates = [];
  for (const mod of mods) {
    const item = items.find((c) => c.projectId === mod.id);
    const idx = (mod.latestFilesIndexes || []).filter((i) => {
      if (i.gameVersion !== profile.mc || !allowed.includes(i.releaseType)) return false;
      if (mod.classId !== 6 || !profile.loader || profile.loader.type === 'vanilla') return true;
      const want = LOADER_KEYS[profile.loader.type];
      return i.modLoader == null || i.modLoader === want || (want === 5 && i.modLoader === 4);
    });
    // Prefer the newest stable file; fall back to beta/alpha only when no newer stable exists
    const newer = idx.filter((i) => i.fileId > item.fileId && i.releaseType <= (item.releaseType || 1)).sort((a, b) => a.releaseType - b.releaseType || b.fileId - a.fileId);
    const best = newer[0];
    if (best) candidates.push({ mod, item, fileId: best.fileId });
  }
  if (!candidates.length) return [];
  const files = await CF.filesByIds(candidates.map((c) => c.fileId));
  return candidates
    .map((c) => ({ ...c, file: files.find((f) => f.id === c.fileId) }))
    .filter((c) => c.file && Date.parse(c.file.fileDate) > Date.parse(c.item.fileDate || 0));
}

async function applyUpdates(profile, updates) {
  const plan = { items: updates.map((u) => ({ mod: u.mod, file: u.file, reason: 'selected' })), warnings: [] };
  const task = Tasks.add({ label: `Updating ${updates.length} item${updates.length === 1 ? '' : 's'}`, detail: profile.name, profileId: profile.id, kind: 'update' });
  Tasks.update(task, { steps: updates.length });
  try {
    for (const it of plan.items) {
      const idx = profile.content.findIndex((c) => c.projectId === it.mod.id);
      const old = profile.content[idx];
      const item = contentItem(it.mod, it.file, { enabled: old.enabled, locked: old.locked, dependencyOf: old.dependencyOf, required: old.required });
      if (item.manual) continue;
      await downloadContent(profile, item, task);
      if (Native.available && old.fileName !== item.fileName) await FS.remove(contentPath(profile, old)).catch(() => {});
      profile.content[idx] = item;
      Tasks.update(task, { done: task.done + 1 });
    }
    await Profiles.save(profile, { syncLauncher: false });
    Tasks.finish(task);
  } catch (e) {
    await Profiles.save(profile, { syncLauncher: false });
    Tasks.finish(task, e);
    throw e;
  }
}

// ---- mod loaders ----

function parseLoaderId(id, mc) {
  const m = /^(forge|neoforge|fabric|quilt)-(.+)$/i.exec(String(id || '').trim());
  if (!m) return { type: 'vanilla', version: '' };
  let version = m[2];
  if (mc && version.endsWith('-' + mc)) version = version.slice(0, -mc.length - 1);
  return { type: m[1].toLowerCase(), version };
}

async function loaderVersions(mc, type) {
  if (type === 'vanilla') return [];
  let list = [];
  if (CF.hasKey()) try {
    const all = await CF.modloaders(mc);
    list = all
      .map((l) => ({ ...parseLoaderId(l.name, mc), latest: l.latest, recommended: l.recommended }))
      .filter((l) => l.type === type);
  } catch (e) {
    log('warn', 'CurseForge loader list failed', e);
  }
  if (!list.length && (type === 'fabric' || type === 'quilt')) {
    const url = type === 'fabric' ? `https://meta.fabricmc.net/v2/versions/loader/${mc}` : `https://meta.quiltmc.org/v3/versions/loader/${mc}`;
    try {
      const r = await httpRequest(url);
      list = JSON.parse(r.text).map((x, i) => ({ type, version: x.loader.version, latest: i === 0, recommended: x.loader.stable !== false && i === 0 }));
    } catch (e) {
      log('warn', 'loader meta failed', e);
    }
  }
  if (!list.length && type === 'forge') {
    try {
      const r = await httpRequest('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
      const promos = JSON.parse(r.text).promos || {};
      const rec = promos[`${mc}-recommended`];
      const latest = promos[`${mc}-latest`];
      if (rec) list.push({ type, version: rec, recommended: true, latest: rec === latest });
      if (latest && latest !== rec) list.push({ type, version: latest, latest: true, recommended: !rec });
    } catch (e) {
      log('warn', 'Forge versions failed', e);
    }
  }
  if (!list.length && type === 'neoforge') {
    try {
      const r = await httpRequest('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
      const parts = mc.split('.');
      const prefix = `${parts[1]}.${parts[2] || 0}.`;
      const versions = (JSON.parse(r.text).versions || []).filter((v) => v.startsWith(prefix) && !/beta|alpha/i.test(v));
      versions.sort((a, b) => cmpVersion(b, a));
      list = versions.slice(0, 15).map((v, i) => ({ type, version: v, latest: i === 0, recommended: i === 0 }));
    } catch (e) {
      log('warn', 'NeoForge versions failed', e);
    }
  }
  list.sort((a, b) => cmpVersion(b.version, a.version));
  return list;
}

function expectedVersionId(profile) {
  const { type, version } = profile.loader || {};
  if (!type || type === 'vanilla') return profile.mc;
  if (type === 'fabric') return `fabric-loader-${version}-${profile.mc}`;
  if (type === 'quilt') return `quilt-loader-${version}-${profile.mc}`;
  if (type === 'forge') return `${profile.mc}-forge-${version}`;
  if (type === 'neoforge') return `neoforge-${version}`;
  return profile.mc;
}

async function findInstalledVersion(profile) {
  if (!Native.available) return null;
  const want = expectedVersionId(profile);
  if (await FS.exists(`versions/${want}/${want}.json`)) return want;
  const { version, type } = profile.loader || {};
  if (!version) return null;
  let dirs = [];
  try { dirs = await FS.list('versions'); } catch (e) { dirs = []; }
  const hit = dirs.find((d) => d.dir && d.name.toLowerCase().includes(type) && d.name.includes(version));
  return hit ? hit.name : null;
}

// Makes sure the profile's game version + loader exist in the launcher.
// Returns 'ready', or 'installer' when a Forge/NeoForge installer was started.
async function installLoader(profile, { runInstaller = true } = {}) {
  const { type, version } = profile.loader || { type: 'vanilla' };
  if (!Native.available) {
    profile.versionId = expectedVersionId(profile);
    profile.status = 'ready';
    await Profiles.save(profile);
    return 'ready';
  }
  if (type === 'vanilla' || !type) {
    profile.versionId = profile.mc;
    profile.status = 'ready';
    await Profiles.save(profile);
    return 'ready';
  }
  const found = await findInstalledVersion(profile);
  if (found) {
    profile.versionId = found;
    profile.status = 'ready';
    await Profiles.save(profile);
    return 'ready';
  }
  const task = Tasks.add({ label: `Installing ${LOADER_NAMES[type]} ${version}`, detail: `Minecraft ${profile.mc}`, profileId: profile.id, kind: 'loader' });
  try {
    if (type === 'fabric' || type === 'quilt') {
      const url = type === 'fabric'
        ? `https://meta.fabricmc.net/v2/versions/loader/${profile.mc}/${version}/profile/json`
        : `https://meta.quiltmc.org/v3/versions/loader/${profile.mc}/${version}/profile/json`;
      const r = await httpRequest(url);
      if (r.status !== 200) throw new Error(`${LOADER_NAMES[type]} ${version} is not available for Minecraft ${profile.mc}`);
      const json = JSON.parse(r.text);
      const id = json.id || expectedVersionId(profile);
      await FS.writeText(`versions/${id}/${id}.json`, r.text);
      profile.versionId = id;
      profile.status = 'ready';
      await Profiles.save(profile);
      Tasks.finish(task);
      return 'ready';
    }
    // Forge and NeoForge ship an installer that has to run in Java.
    const url = type === 'forge'
      ? `https://maven.minecraftforge.net/net/minecraftforge/forge/${profile.mc}-${version}/forge-${profile.mc}-${version}-installer.jar`
      : `https://maven.neoforged.net/releases/net/neoforged/neoforge/${version}/neoforge-${version}-installer.jar`;
    const path = `${PROFILE_ROOT}/_installers/${type}-${profile.mc}-${version}.jar`;
    await nativeDownload(url, path, { onProgress: (e) => Tasks.update(task, { detail: `Installer · ${fmtBytes(e.received)}` }) });
    profile.status = 'loader-pending';
    profile.versionId = '';
    await Profiles.save(profile, { syncLauncher: false });
    Tasks.finish(task);
    if (runInstaller) {
      await Native.call('loader.runInstaller', { path, type });
      return 'installer';
    }
    return 'pending';
  } catch (e) {
    Tasks.finish(task, e);
    throw e;
  }
}

// Called on start/resume: finishes Forge installs that completed in Java.
async function finishPendingLoaders() {
  if (!Native.available) return;
  const list = await Profiles.all(true);
  for (const p of list) {
    if (p.status !== 'loader-pending') continue;
    const found = await findInstalledVersion(p);
    if (found) {
      p.versionId = found;
      p.status = 'ready';
      await Profiles.save(p);
      log('info', `${LOADER_NAMES[p.loader.type]} is ready for ${p.name}`);
      toast(`${p.name} is ready to play`);
    }
  }
}

// ---- modpacks ----

function parseManifest(text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { throw new Error('manifest.json is not valid JSON'); }
  if (!m || !m.minecraft || !Array.isArray(m.files)) throw new Error('This zip is not a CurseForge modpack (manifest.json missing fields)');
  const mc = m.minecraft.version;
  const loaders = m.minecraft.modLoaders || [];
  const primary = loaders.find((l) => l.primary) || loaders[0];
  return {
    name: m.name || 'Modpack',
    version: m.version || '',
    author: m.author || '',
    mc,
    loader: primary ? parseLoaderId(primary.id, mc) : { type: 'vanilla', version: '' },
    files: m.files.map((f) => ({ projectId: f.projectID, fileId: f.fileID, required: f.required !== false })),
    overrides: m.overrides || 'overrides',
    ram: (m.minecraft && m.minecraft.recommendedRam) || 0,
  };
}

async function installModpack({ mod = null, file = null, localPath = null, localBytes = null }) {
  const label = mod ? mod.name : 'modpack';
  const task = Tasks.add({ label: `Installing ${label}`, detail: 'Downloading pack', kind: 'modpack' });
  let profile = null;
  let zipPath = null;
  try {
    let manifest;
    let webZip = null;
    if (Native.available) {
      zipPath = localPath;
      if (!zipPath) {
        if (!fileDownloadUrl(file)) throw new Error(`${mod.name} can only be downloaded from CurseForge's website.`);
        zipPath = `${PROFILE_ROOT}/_tmp/pack-${file.id}.zip`;
        await nativeDownload(file.downloadUrl, zipPath, {
          sha1: fileSha1(file),
          onProgress: (e) => Tasks.update(task, { detail: `Pack · ${fmtBytes(e.received)}${e.total ? ' of ' + fmtBytes(e.total) : ''}` }),
        });
      }
      const text = await Native.call('zip.readText', { path: zipPath, entry: 'manifest.json' });
      if (!text) throw new Error('manifest.json not found in the modpack');
      manifest = parseManifest(text);
    } else {
      let bytes = localBytes;
      if (!bytes) {
        if (!fileDownloadUrl(file)) throw new Error(`${mod.name} can only be downloaded from CurseForge's website.`);
        const res = await fetch(file.downloadUrl);
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        bytes = new Uint8Array(await res.arrayBuffer());
      }
      webZip = zipOpen(bytes);
      const text = await webZip.readText('manifest.json');
      if (!text) throw new Error('manifest.json not found in the modpack');
      manifest = parseManifest(text);
    }

    Tasks.update(task, { label: `Installing ${manifest.name}`, detail: 'Reading mod list' });
    profile = await Profiles.create(newProfile({
      name: manifest.name,
      mc: manifest.mc,
      loader: manifest.loader,
      icon: mod ? modLogo(mod) : '',
      modpack: mod
        ? { projectId: mod.id, fileId: file.id, name: mod.name, version: file.displayName || manifest.version, author: modAuthor(mod) }
        : { projectId: null, fileId: null, name: manifest.name, version: manifest.version, author: manifest.author },
    }));
    task.profileId = profile.id;
    profile.status = 'installing';
    if (manifest.ram) profile.memoryMb = manifest.ram;
    await Profiles.save(profile, { syncLauncher: false });

    const files = await CF.filesByIds(manifest.files.map((f) => f.fileId));
    const mods = await CF.mods(manifest.files.map((f) => f.projectId));
    const items = [];
    for (const entry of manifest.files) {
      const f = files.find((x) => x.id === entry.fileId);
      const m = mods.find((x) => x.id === entry.projectId);
      if (!f || !m) {
        log('warn', 'Pack entry missing on CurseForge', entry);
        continue;
      }
      items.push(contentItem(m, f, { required: entry.required, fromPack: true }));
    }
    Tasks.update(task, { steps: items.length, done: 0, detail: `0 of ${items.length} files` });
    const failed = [];
    await pool(items, 4, async (item) => {
      if (!item.manual && Native.available) {
        try {
          await nativeDownload(item.url, contentPath(profile, item), { sha1: item.sha1 });
        } catch (e) {
          failed.push(item);
          log('error', `Download failed: ${item.fileName}`, e);
        }
      }
      Tasks.update(task, { done: task.done + 1, detail: `${task.done + 1} of ${items.length} files` });
    });
    profile.content = items.filter((i) => !failed.includes(i));

    if (Native.available) {
      Tasks.update(task, { detail: 'Copying pack settings' });
      await Native.call('zip.extract', { path: zipPath, prefix: manifest.overrides, dest: profileDir(profile) });
    }
    await Profiles.save(profile, { syncLauncher: false });
    Tasks.update(task, { detail: `Setting up ${loaderLabel(profile)}` });
    Tasks.finish(task, failed.length ? new Error(`${failed.length} file${failed.length === 1 ? '' : 's'} failed to download. Open the profile and use Repair.`) : null);
    if (zipPath && !localPath && Native.available) await FS.remove(zipPath).catch(() => {});
    return profile;
  } catch (e) {
    Tasks.finish(task, e);
    if (profile) {
      profile.status = 'broken';
      await Profiles.save(profile, { syncLauncher: false }).catch(() => {});
    }
    throw e;
  }
}

// ---- Modrinth modpacks (.mrpack) ----

function parseMrIndex(text) {
  let m;
  try { m = JSON.parse(text); } catch (e) { throw new Error('modrinth.index.json is not valid JSON'); }
  if (!m || !m.dependencies || !Array.isArray(m.files)) throw new Error('This file is not a Modrinth modpack');
  const d = m.dependencies;
  const mc = d.minecraft;
  let loader = { type: 'vanilla', version: '' };
  if (d['fabric-loader']) loader = { type: 'fabric', version: d['fabric-loader'] };
  else if (d['quilt-loader']) loader = { type: 'quilt', version: d['quilt-loader'] };
  else if (d.neoforge) loader = { type: 'neoforge', version: d.neoforge };
  else if (d.forge) loader = { type: 'forge', version: d.forge };
  const files = m.files
    .filter((f) => !f.env || f.env.client !== 'unsupported')
    .filter((f) => f.path && !f.path.startsWith('/') && !f.path.split('/').includes('..'))
    .map((f) => ({ path: f.path, sha1: f.hashes && f.hashes.sha1, sha512: f.hashes && f.hashes.sha512, url: (f.downloads || [])[0], size: f.fileSize || 0, optional: !!(f.env && f.env.client === 'optional') }));
  return { name: m.name || 'Modpack', version: m.versionId || '', mc, loader, files };
}

async function installMrpack({ mod = null, file = null, localPath = null, localBytes = null }) {
  const task = Tasks.add({ label: `Installing ${mod ? mod.name : 'modpack'}`, detail: 'Downloading pack', kind: 'modpack' });
  let profile = null;
  let zipPath = localPath;
  try {
    let index;
    if (Native.available) {
      if (!zipPath) {
        zipPath = `${PROFILE_ROOT}/_tmp/pack-${file.id}.mrpack`;
        await nativeDownload(file.downloadUrl, zipPath, {
          sha1: fileSha1(file),
          onProgress: (e) => Tasks.update(task, { detail: `Pack · ${fmtBytes(e.received)}${e.total ? ' of ' + fmtBytes(e.total) : ''}` }),
        });
      }
      const text = await Native.call('zip.readText', { path: zipPath, entry: 'modrinth.index.json' });
      if (!text) throw new Error('modrinth.index.json not found in the pack');
      index = parseMrIndex(text);
    } else {
      let bytes = localBytes;
      if (!bytes) {
        const res = await fetch(file.downloadUrl);
        if (!res.ok) throw new Error(`Download failed (${res.status})`);
        bytes = new Uint8Array(await res.arrayBuffer());
      }
      const text = await zipOpen(bytes).readText('modrinth.index.json');
      if (!text) throw new Error('modrinth.index.json not found in the pack');
      index = parseMrIndex(text);
    }

    Tasks.update(task, { label: `Installing ${index.name}`, detail: 'Reading mod list' });
    profile = await Profiles.create(newProfile({
      name: index.name,
      mc: index.mc,
      loader: index.loader,
      icon: mod ? modLogo(mod) : '',
      modpack: mod
        ? { source: 'modrinth', projectId: mod.id, fileId: file.id, name: mod.name, version: file.versionNumber || file.displayName || index.version, author: modAuthor(mod) }
        : { source: 'modrinth', projectId: null, fileId: null, name: index.name, version: index.version, author: '' },
    }));
    task.profileId = profile.id;
    profile.status = 'installing';
    await Profiles.save(profile, { syncLauncher: false });

    // Name the files: ask Modrinth which projects these hashes belong to
    let byHash = {};
    let projects = [];
    try {
      byHash = await MR.versionsByHash(index.files.map((f) => f.sha1).filter(Boolean));
      projects = await MR.projects(Object.values(byHash).map((v) => v.modId));
    } catch (e) {
      log('warn', 'Could not identify pack files', e);
    }
    const items = index.files.map((f) => {
      const slash = f.path.lastIndexOf('/');
      const folder = slash > 0 ? f.path.slice(0, slash) : '.';
      const fileName = f.path.slice(slash + 1);
      const v = byHash[f.sha1];
      const proj = v && projects.find((p) => p.id === v.modId);
      const base = proj ? contentItem(proj, v) : {
        source: 'modrinth', projectId: null, fileId: null, name: fileName.replace(/\.(jar|zip)$/i, ''), author: '', logo: '',
        classId: folder === 'mods' ? 6 : folder === 'resourcepacks' ? 12 : folder === 'shaderpacks' ? 6552 : 6,
        displayName: fileName, releaseType: 1, gameVersions: [], enabled: true, locked: false, added: Date.now(),
      };
      return { ...base, folder, fileName, sha1: f.sha1, sha512: f.sha512, url: f.url, size: f.size, manual: !f.url, fromPack: true, required: !f.optional };
    });

    Tasks.update(task, { steps: items.length, done: 0, detail: `0 of ${items.length} files` });
    const failed = [];
    await pool(items, 4, async (item) => {
      if (!item.manual && Native.available) {
        try {
          await nativeDownload(item.url, contentPath(profile, item), { sha1: item.sha1 });
        } catch (e) {
          failed.push(item);
          log('error', `Download failed: ${item.fileName}`, e);
        }
      }
      Tasks.update(task, { done: task.done + 1, detail: `${task.done + 1} of ${items.length} files` });
    });
    profile.content = items.filter((i) => !failed.includes(i));
    if (Native.available) {
      Tasks.update(task, { detail: 'Copying pack settings' });
      await Native.call('zip.extract', { path: zipPath, prefix: 'overrides', dest: profileDir(profile) });
      await Native.call('zip.extract', { path: zipPath, prefix: 'client-overrides', dest: profileDir(profile) });
    }
    await Profiles.save(profile, { syncLauncher: false });
    Tasks.finish(task, failed.length ? new Error(`${failed.length} file${failed.length === 1 ? '' : 's'} failed to download. Open the profile and use Repair.`) : null);
    if (zipPath && !localPath && Native.available) await FS.remove(zipPath).catch(() => {});
    return profile;
  } catch (e) {
    Tasks.finish(task, e);
    if (profile) {
      profile.status = 'broken';
      await Profiles.save(profile, { syncLauncher: false }).catch(() => {});
    }
    throw e;
  }
}

// Re-downloads anything missing from a profile folder
async function repairProfile(profile) {
  if (!Native.available) return 0;
  const task = Tasks.add({ label: `Repairing ${profile.name}`, profileId: profile.id, kind: 'repair' });
  let fixed = 0;
  try {
    const missing = [];
    for (const item of profile.content) {
      if (item.manual) continue;
      if (!(await FS.exists(contentPath(profile, item)))) missing.push(item);
    }
    Tasks.update(task, { steps: missing.length });
    await pool(missing, 4, async (item) => {
      if (!item.url && item.source !== 'modrinth') {
        const f = await CF.file(item.projectId, item.fileId);
        item.url = fileDownloadUrl(f);
      }
      if (item.url) {
        await nativeDownload(item.url, contentPath(profile, item), { sha1: item.sha1 });
        fixed++;
      }
      Tasks.update(task, { done: task.done + 1 });
    });
    await Profiles.save(profile, { syncLauncher: false });
    Tasks.finish(task);
  } catch (e) {
    Tasks.finish(task, e);
    throw e;
  }
  return fixed;
}

// ---- export ----

function buildManifest(profile) {
  const loader = profile.loader && profile.loader.type !== 'vanilla'
    ? [{ id: `${profile.loader.type}-${profile.loader.version}`, primary: true }]
    : [];
  return {
    minecraft: { version: profile.mc, modLoaders: loader, ...(profile.memoryMb ? { recommendedRam: profile.memoryMb } : {}) },
    manifestType: 'minecraftModpack',
    manifestVersion: 1,
    name: profile.name,
    version: (profile.modpack && profile.modpack.version) || '1.0.0',
    author: (profile.modpack && profile.modpack.author) || 'Kiln',
    files: profile.content.filter((c) => c.source !== 'modrinth' && c.projectId && c.fileId).map((c) => ({ projectID: c.projectId, fileID: c.fileId, required: c.enabled !== false })),
    overrides: 'overrides',
  };
}

function buildModlist(profile) {
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const rows = profile.content.map((c) => `<li><a href="${esc(c.website || '')}">${esc(c.name)} (by ${esc(c.author || '')})</a></li>`).join('\n');
  return `<ul>\n${rows}\n</ul>\n`;
}

// Modrinth pack index (.mrpack) for the Modrinth items in a profile
function buildMrIndex(profile) {
  const deps = { minecraft: profile.mc };
  const { type, version } = profile.loader || {};
  if (type === 'fabric') deps['fabric-loader'] = version;
  if (type === 'quilt') deps['quilt-loader'] = version;
  if (type === 'forge') deps.forge = version;
  if (type === 'neoforge') deps.neoforge = version;
  return {
    formatVersion: 1,
    game: 'minecraft',
    versionId: (profile.modpack && profile.modpack.version) || '1.0.0',
    name: profile.name,
    summary: `Exported from Kiln`,
    files: profile.content.filter((c) => c.source === 'modrinth' && c.url && c.sha1 && c.sha512 && c.enabled !== false).map((c) => ({
      path: `${c.folder}/${c.fileName}`,
      hashes: { sha1: c.sha1, sha512: c.sha512 },
      env: { client: 'required', server: c.classId === 6 ? 'optional' : 'unsupported' },
      downloads: [c.url],
      fileSize: c.size || 0,
    })),
    dependencies: deps,
  };
}

function exportFormats(profile) {
  const cf = profile.content.filter((c) => c.source !== 'modrinth').length;
  const mr = profile.content.filter((c) => c.source === 'modrinth').length;
  const out = [];
  if (cf || !mr) out.push('curseforge');
  if (mr) out.push('modrinth');
  return out;
}

async function exportProfile(profile, format = 'curseforge') {
  const mr = format === 'modrinth';
  const bytes = mr
    ? zipStore([{ name: 'modrinth.index.json', data: JSON.stringify(buildMrIndex(profile), null, 2) }])
    : zipStore([
      { name: 'manifest.json', data: JSON.stringify(buildManifest(profile), null, 2) },
      { name: 'modlist.html', data: buildModlist(profile) },
    ]);
  const fileName = `${slugify(profile.name)}-${profile.mc}.${mr ? 'mrpack' : 'zip'}`;
  if (Native.available) {
    const path = `${PROFILE_ROOT}/_exports/${fileName}`;
    await FS.writeBase64(path, b64FromBytes(bytes));
    await Native.call('file.share', { path });
    return path;
  }
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const a = h('a', { href: url, download: fileName });
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return fileName;
}

// ---- launch ----

async function launchProfile(profile) {
  if (!Native.available) {
    throw new Error('Playing needs the Kiln app on your iPhone, iPad or Android device.');
  }
  if (profile.status === 'installing') throw new Error(`${profile.name} is still installing.`);
  if (profile.status !== 'ready' || !profile.versionId) {
    const state = await installLoader(profile);
    if (state !== 'ready') return state;
  }
  profile.lastPlayed = Date.now();
  await Profiles.save(profile);
  await Native.call('game.launch', { key: profile.name });
  log('info', `Launching ${profile.name} (${profile.versionId})`);
  return 'launched';
}
