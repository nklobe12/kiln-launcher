// ---- Profiles: list, detail, create, install flows, play ----

function profileCard(p) {
  const busy = Tasks.busyFor(p.id);
  return h('div.pcard', { onclick: (e) => { if (!e.target.closest('button')) go(`#/profile/${p.id}`); }, role: 'link', tabindex: '0' },
    h('div.pcard-top',
      profileIcon(p),
      h('div', { style: { minWidth: 0 } },
        h('div.pcard-name', p.name),
        h('div.muted.num', { style: { fontSize: '13px' } }, `${p.mc} · ${loaderLabel(p)}`))),
    h('div.pcard-foot',
      h('div.row', { style: { gap: '6px' } },
        h('span.chip.num', icon('box', 13), `${(p.content || []).length}`),
        p.modpack ? h('span.chip', 'Modpack') : null,
        statusChip(p)),
      playButton(p, { disabled: busy })));
}

function playButton(p, { disabled = false, large = false } = {}) {
  return h('button.btn.btn-play' + (large ? '.btn-lg' : '.btn-sm'), {
    disabled,
    onclick: async (e) => {
      const btn = e.currentTarget;
      btn.disabled = true;
      try { await playProfile(p); } finally { btn.disabled = false; }
    },
  }, icon('play', large ? 18 : 15), 'Play');
}

async function playProfile(p) {
  if (!Native.available) {
    openSheet({
      title: 'Play in the Kiln app',
      body: h('div.stack',
        h('p', { style: { margin: 0 } }, 'This page is the browser version of Kiln. Minecraft launches from the Kiln app on iPhone, iPad or Android, which runs Java on the device.'),
        h('p.muted', { style: { margin: 0 } }, 'You can export this profile and import the zip in the app or any launcher that reads CurseForge packs.')),
      actions: [{ label: 'Close' }, { label: 'Export profile', primary: true, onClick: () => exportProfile(p) }],
    });
    return;
  }
  try {
    if ((p.loader.type === 'forge' || p.loader.type === 'neoforge') && p.status !== 'ready') {
      const found = await findInstalledVersion(p);
      if (!found) {
        const ok = await confirmSheet({
          title: `Install ${LOADER_NAMES[p.loader.type]} ${p.loader.version}`,
          message: h('div.stack',
            h('p', { style: { margin: 0 } }, `${p.name} needs ${LOADER_NAMES[p.loader.type]}. Its installer runs in Java and takes a minute or two.`),
            Native.platform === 'ios' ? h('p.muted', { style: { margin: 0 } }, 'On iPhone, JIT must be on (StikDebug opens automatically). When the installer finishes, close and reopen Kiln, then tap Play again.') : null),
          confirm: 'Install',
        });
        if (!ok) return;
      }
    }
    const state = await launchProfile(p);
    if (state === 'installer') toast(`${LOADER_NAMES[p.loader.type]} installer started`);
    else if (state === 'launched') toast(`Starting ${p.name}…`);
  } catch (e) {
    toast(e.message || String(e), { error: true });
    log('error', 'Play failed', e);
  }
}

async function viewProfiles() {
  const list = await Profiles.all(true);
  const page = h('div.page');
  page.appendChild(h('div.row-between',
    h('h1', 'Profiles'),
    h('div.row',
      h('button.btn', { onclick: () => importModpackFlow() }, icon('file', 18), 'Import zip'),
      h('button.btn.btn-primary', { onclick: () => createProfileSheet() }, icon('plus', 18), 'New profile'))));
  if (!list.length) {
    page.appendChild(h('div.empty',
      icon('layers'),
      h('h3', 'No profiles yet'),
      h('div', 'A profile is one Minecraft setup: a game version, a mod loader and the mods you add to it.'),
      h('div.row', { style: { justifyContent: 'center' } },
        h('a.btn.btn-primary', { href: '#/browse/modpacks' }, 'Install a modpack'),
        h('button.btn', { onclick: () => createProfileSheet() }, 'Start from scratch'))));
    return page;
  }
  page.appendChild(h('div.profiles', list.map(profileCard)));
  return page;
}

async function createProfileSheet(preset = {}) {
  let versions = [];
  try { versions = await mcReleaseVersions(); } catch (e) { toast(e.message, { error: true }); return null; }
  const state = { name: preset.name || '', mc: preset.mc || versions[0], type: preset.loader || 'fabric', version: '' };
  const nameInput = h('input.input#np-name', { value: state.name, placeholder: 'My modded world', autocomplete: 'off' });
  const loaderVersionField = h('div.field');
  const typeSeg = h('div.segmented', { role: 'radiogroup', 'aria-label': 'Mod loader' });

  function drawTypes() {
    typeSeg.replaceChildren(...['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].map((t) => h('button', {
      type: 'button',
      'aria-pressed': String(state.type === t),
      onclick: () => { state.type = t; drawTypes(); loadLoaderVersions(); },
    }, LOADER_NAMES[t])));
  }
  async function loadLoaderVersions() {
    if (state.type === 'vanilla') {
      loaderVersionField.replaceChildren();
      state.version = '';
      return;
    }
    loaderVersionField.replaceChildren(h('label', 'Loader version'), h('div.muted', icon('spinner', 16, 'spin')));
    const list = await loaderVersions(state.mc, state.type);
    if (!list.length) {
      state.version = '';
      loaderVersionField.replaceChildren(h('label', 'Loader version'), h('div.hint', `${LOADER_NAMES[state.type]} has no build for Minecraft ${state.mc}.`));
      return;
    }
    const rec = list.find((l) => l.recommended) || list[0];
    state.version = rec.version;
    loaderVersionField.replaceChildren(h('label', { for: 'np-lv' }, 'Loader version'),
      selectEl('np-lv', list.map((l) => ({ value: l.version, label: l.version + (l.recommended ? ' (recommended)' : l.latest ? ' (latest)' : '') })), state.version, (v) => { state.version = v; }));
  }
  drawTypes();
  loadLoaderVersions();

  return new Promise((resolve) => {
    openSheet({
      title: 'New profile',
      body: h('div.stack',
        h('div.field', h('label', { for: 'np-name' }, 'Name'), nameInput),
        h('div.field', h('label', { for: 'np-mc' }, 'Minecraft version'), selectEl('np-mc', versions.map((v) => ({ value: v, label: v })), state.mc, (v) => { state.mc = v; loadLoaderVersions(); })),
        h('div.field', h('span.label', 'Mod loader'), typeSeg),
        loaderVersionField,
        h('div.hint', 'Fabric and Quilt set up in seconds. Forge and NeoForge run their installer the first time you play.')),
      actions: [
        { label: 'Cancel' },
        {
          label: 'Create', primary: true, id: 'np-create',
          onClick: async () => {
            if (state.type !== 'vanilla' && !state.version) throw new Error('Pick a loader version, or choose Vanilla.');
            const name = nameInput.value.trim() || `${LOADER_NAMES[state.type]} ${state.mc}`;
            const p = await Profiles.create(newProfile({ name, mc: state.mc, loader: { type: state.type, version: state.version } }));
            if (state.type === 'vanilla' || state.type === 'fabric' || state.type === 'quilt') {
              try { await installLoader(p); } catch (e) { toast(e.message, { error: true }); }
            }
            toast(`Created ${p.name}`);
            resolve(p);
            if (!preset.stay) go(`#/profile/${p.id}`);
            return true;
          },
        },
      ],
      onClose: () => resolve(null),
    });
    setTimeout(() => nameInput.focus(), 60);
  });
}

function compatibility(mod, p) {
  if (isModrinth(mod)) {
    if (mod.gameVersions.length && !mod.gameVersions.includes(p.mc)) return { ok: false, why: `No ${p.mc} file` };
    if (mod.classId === 6) {
      const type = p.loader && p.loader.type !== 'vanilla' ? p.loader.type : null;
      if (!type) return { ok: false, why: 'Needs a mod loader' };
      if (mod.loaders.length && !mod.loaders.includes(type) && !(type === 'quilt' && mod.loaders.includes('fabric'))) return { ok: false, why: `Not for ${LOADER_NAMES[type]}` };
    }
    return { ok: true };
  }
  if (mod.classId !== 6 && mod.classId !== 12 && mod.classId !== 6552 && mod.classId !== 6945 && mod.classId !== 17) return { ok: true };
  const versions = projectVersions(mod);
  if (versions.length && !versions.includes(p.mc)) return { ok: false, why: `No ${p.mc} file` };
  if (mod.classId === 6) {
    const want = p.loader && p.loader.type !== 'vanilla' ? LOADER_KEYS[p.loader.type] : null;
    const idx = (mod.latestFilesIndexes || []).filter((i) => i.gameVersion === p.mc);
    if (!want) return { ok: idx.some((i) => !i.modLoader), why: 'Needs a mod loader' };
    if (idx.length && !idx.some((i) => i.modLoader === want || !i.modLoader || (want === 5 && i.modLoader === 4))) return { ok: false, why: `Not for ${LOADER_NAMES[p.loader.type]}` };
  }
  return { ok: true };
}

async function chooseProfileAndInstall(mod, file = null) {
  const list = await Profiles.all();
  const rows = list.map((p) => ({ p, c: compatibility(mod, p), have: (p.content || []).some((x) => x.projectId === mod.id) }));
  rows.sort((a, b) => Number(b.c.ok) - Number(a.c.ok));
  const s = openSheet({
    title: `Install ${mod.name}`,
    body: h('div.stack',
      rows.length ? h('div.eyebrow', 'Choose a profile') : h('div.muted', 'You have no profiles yet. Create one for this project.'),
      rows.map(({ p, c, have }) => h('div.option' + (c.ok ? '' : '.dim'), {
        role: 'button', tabindex: '0',
        onclick: async () => {
          if (have) return toast(`${mod.name} is already in ${p.name}`);
          s.close();
          await installInto(p, mod, file);
        },
      },
      profileIcon(p),
      h('div.grow', h('strong', p.name), h('div.muted.num', { style: { fontSize: '13px' } }, `${p.mc} · ${loaderLabel(p)}`)),
      have ? h('span.chip.chip-accent', 'Installed') : c.ok ? h('span.chip', 'Compatible') : h('span.chip.chip-warn', c.why))),
      h('button.btn', {
        onclick: async () => {
          s.close();
          const versions = projectVersions(mod);
          const loaders = isModrinth(mod)
            ? mod.loaders.map((l) => LOADER_KEYS[l])
            : (mod.latestFilesIndexes || []).filter((i) => i.gameVersion === versions[0]).map((i) => i.modLoader);
          const loader = mod.classId === 6 ? (loaders.includes(4) ? 'fabric' : loaders.includes(6) ? 'neoforge' : loaders.includes(1) ? 'forge' : loaders.includes(5) ? 'quilt' : 'fabric') : 'vanilla';
          const p = await createProfileSheet({ name: '', mc: versions[0], loader, stay: true });
          if (p) {
            await installInto(p, mod, file);
            go(`#/profile/${p.id}`);
          }
        },
      }, icon('plus', 18), 'New profile for this')),
  });
}

async function installInto(profile, mod, file = null, button = null) {
  if (button) {
    button.disabled = true;
    button.replaceChildren(icon('spinner', 16, 'spin'), 'Checking');
  }
  try {
    const plan = await planFor(profile, mod, file);
    const blocked = plan.items.filter((i) => !i.file);
    const ready = plan.items.filter((i) => i.file);
    const manual = ready.filter((i) => !fileDownloadUrl(i.file));
    if (!ready.length) throw new Error(blocked[0] ? `${blocked[0].mod.name}: ${blocked[0].problem}` : 'Nothing to install');
    const needsConfirm = ready.length > 1 || blocked.length || plan.warnings.length || manual.length;
    if (needsConfirm) {
      const ok = await confirmSheet({
        title: `Install into ${profile.name}`,
        confirm: `Install ${ready.length}`,
        message: h('div.stack',
          plan.warnings.map((w) => h('div.notice.warn', icon('warn'), h('div', w))),
          h('div.content-list', plan.items.map((i) => h('div.citem',
            img(modLogo(i.mod), ''),
            h('div.ci-main', h('strong', i.mod.name), h('small', i.file ? `${i.file.displayName} · ${i.reason === 'selected' ? 'Selected' : i.reason}` : i.problem)),
            h('div.ci-act', !i.file ? h('span.chip.chip-danger', 'Skipped') : !fileDownloadUrl(i.file) ? h('span.chip.chip-warn', 'Website only') : releaseTag(i.file.releaseType))))),
          manual.length ? h('div.hint', 'Some authors only allow downloads from the CurseForge website. Kiln adds them to the list with a link so you can get the file yourself.') : null),
      });
      if (!ok) return;
    }
    const result = await runPlan(profile, plan);
    toast(result.added.length === 1 ? `Installed ${result.added[0].name}` : `Installed ${result.added.length} items into ${profile.name}`);
    bus.emit('profiles');
  } catch (e) {
    toast(e.message || String(e), { error: true });
  } finally {
    if (button && button.isConnected) render();
  }
}

async function startModpackInstall(mod, file = null) {
  if (!isModrinth(mod) && !CF.hasKey()) return go('#/settings');
  let chosen = file;
  if (!chosen && isModrinth(mod)) {
    try {
      const versions = await MR.versions(mod.id);
      const sorted = versions.sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));
      chosen = sorted.find((f) => allowedReleaseTypes().includes(f.releaseType)) || sorted[0];
    } catch (e) {
      return toast(e.message, { error: true });
    }
  }
  if (!chosen) {
    const files = (mod.latestFiles || []).filter((f) => !f.isServerPack).sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate));
    chosen = files.find((f) => allowedReleaseTypes().includes(f.releaseType)) || files[0];
  }
  if (!chosen) return toast('This modpack has no files yet', { error: true });
  const ok = await confirmSheet({
    title: `Install ${mod.name}`,
    confirm: 'Install',
    message: h('div.stack',
      h('div.row', img(modLogo(mod), 'picon'), h('div.grow', h('strong', chosen.displayName), h('div.muted.num', `${fileMcVersions(chosen)[0] || ''} · ${fmtBytes(chosen.fileLength)} · ${fmtDate(chosen.fileDate)}`))),
      h('div.hint', 'Kiln creates a new profile, downloads every mod in the pack and copies its settings. You can keep using the app while it works.'),
      !Native.available ? h('div.notice.warn', icon('info'), h('div', 'In a browser Kiln records the pack and its mod list. Open the app to download the files and play.')) : null),
  });
  if (!ok) return;
  toast(`Installing ${mod.name}…`);
  go('#/downloads');
  try {
    const p = isModrinth(mod) ? await installMrpack({ mod, file: chosen }) : await installModpack({ mod, file: chosen });
    await afterModpackInstalled(p);
  } catch (e) {
    toast(e.message || String(e), { error: true });
  }
}

async function afterModpackInstalled(p) {
  const type = p.loader.type;
  if (type === 'vanilla' || type === 'fabric' || type === 'quilt') {
    try { await installLoader(p); } catch (e) { toast(e.message, { error: true }); }
    toast(`${p.name} is ready to play`);
  } else {
    p.status = 'loader-pending';
    await Profiles.save(p, { syncLauncher: false });
    toast(`${p.name} installed. Tap Play to set up ${LOADER_NAMES[type]}.`);
  }
  if (location.hash.startsWith('#/downloads')) go(`#/profile/${p.id}`);
}

async function importModpackFlow() {
  if (Native.available) {
    let picked;
    try { picked = await Native.call('file.pick', { multiple: false }); } catch (e) { return toast(e.message, { error: true }); }
    if (!picked || !picked.length) return;
    go('#/downloads');
    try {
      const isMr = !!(await Native.call('zip.readText', { path: picked[0].path, entry: 'modrinth.index.json' }).catch(() => null));
      const p = isMr ? await installMrpack({ localPath: picked[0].path }) : await installModpack({ localPath: picked[0].path });
      await FS.remove(picked[0].path).catch(() => {});
      await afterModpackInstalled(p);
    } catch (e) {
      toast(e.message || String(e), { error: true });
    }
    return;
  }
  const input = h('input', { type: 'file', accept: '.zip,.mrpack,application/zip' });
  input.addEventListener('change', async () => {
    const f = input.files[0];
    if (!f) return;
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      const isMr = zipOpen(bytes).names.includes('modrinth.index.json');
      const p = isMr ? await installMrpack({ localBytes: bytes }) : await installModpack({ localBytes: bytes });
      await afterModpackInstalled(p);
    } catch (e) {
      toast(e.message || String(e), { error: true });
    }
  });
  input.click();
}

async function viewProfile(params, query) {
  await Profiles.all();
  const p = Profiles.get(params[0]);
  const page = h('div.page');
  if (!p) {
    page.appendChild(h('div.empty', icon('layers'), h('h3', 'Profile not found'), h('a.btn', { href: '#/profiles' }, 'All profiles')));
    return page;
  }
  const tab = params[1] || 'content';
  const busy = Tasks.busyFor(p.id);
  page.appendChild(h('button.btn.btn-ghost.btn-sm', { onclick: () => go('#/profiles'), style: { alignSelf: 'flex-start' } }, icon('back', 16), 'Profiles'));
  page.appendChild(h('section.phead', { style: { gridTemplateColumns: 'auto minmax(0,1fr)' } },
    profileIcon(p, true),
    h('div.phead-info',
      h('div.eyebrow', p.modpack ? `Modpack · ${p.modpack.version || ''}` : 'Custom profile'),
      h('h1', p.name),
      h('div.row', h('span.chip.mono', p.mc), h('span.chip', loaderLabel(p)), h('span.chip.num', `${p.content.length} item${p.content.length === 1 ? '' : 's'}`), statusChip(p)),
      p.status === 'loader-pending' ? h('div.notice.warn', icon('info'), h('div', `${LOADER_NAMES[p.loader.type]} is not installed yet. Tap Play to run its installer${Native.platform === 'ios' ? ', then reopen Kiln when it finishes' : ''}.`)) : null,
      h('div.phead-actions',
        playButton(p, { large: true, disabled: busy }),
        h('a.btn', { href: `#/browse/mc-mods?for=${p.id}` }, icon('plus', 18), 'Add content'),
        h('button.btn.btn-icon', { onclick: () => profileMenu(p), 'aria-label': 'More actions' }, icon('more'))))));

  page.appendChild(h('div.tabs', { role: 'tablist' },
    [['content', 'Content', p.content.length], ['settings', 'Settings']].map(([t, label, count]) =>
      h('a.tab', { href: `#/profile/${p.id}${t === 'content' ? '' : '/' + t}`, role: 'tab', 'aria-selected': String(t === tab) }, label, count != null ? h('span.count', count) : null))));

  if (tab === 'settings') {
    page.appendChild(profileSettings(p));
    return page;
  }

  // content tab
  const filter = { folder: query.folder || 'all', q: '' };
  const counts = {};
  p.content.forEach((c) => { counts[c.folder] = (counts[c.folder] || 0) + 1; });
  const folders = MC_CLASSES.filter((c) => c.folder && counts[c.folder]);
  const listEl = h('div.content-list');
  const updatesBar = h('div');
  const toolbar = h('div.row-between',
    folders.length > 1 ? h('div.segmented', [h('button', { 'aria-pressed': String(filter.folder === 'all'), onclick: () => go(`#/profile/${p.id}`) }, 'All'),
      ...folders.map((c) => h('button', { 'aria-pressed': String(filter.folder === c.folder), onclick: () => go(`#/profile/${p.id}?folder=${c.folder}`) }, `${c.name} ${counts[c.folder]}`))]) : h('span'),
    h('div.row',
      h('input.input#pc-q', { type: 'search', placeholder: 'Filter', style: { width: '160px', height: '34px' }, oninput: (e) => { filter.q = e.target.value.toLowerCase(); drawList(); } }),
      h('button.btn.btn-sm', { onclick: (e) => runUpdateCheck(p, e.currentTarget, updatesBar) }, icon('refresh', 16), 'Check for updates')));
  page.append(toolbar, updatesBar, listEl);

  function drawList() {
    const items = p.content
      .filter((c) => filter.folder === 'all' || c.folder === filter.folder)
      .filter((c) => !filter.q || c.name.toLowerCase().includes(filter.q))
      .sort((a, b) => a.name.localeCompare(b.name));
    if (!p.content.length) {
      listEl.replaceWith(h('div.empty', icon('box'), h('h3', 'Nothing installed yet'), h('div', 'Add mods, resource packs and shaders made for ' + p.mc + '.'), h('a.btn.btn-primary', { href: `#/browse/mc-mods?for=${p.id}` }, 'Browse mods')));
      return;
    }
    listEl.replaceChildren(...items.map((c) => contentRow(p, c)));
  }
  drawList();
  return page;
}

function contentRow(p, c) {
  const row = h('div.citem' + (c.enabled === false ? '.off' : ''),
    img(c.logo, ''),
    h('div.ci-main',
      h('strong', c.name, c.locked ? h('span.faint', { title: 'Locked from updates' }, ' ', icon('lock', 13)) : null),
      h('small', c.manual ? 'Download from the CurseForge website' : `${c.displayName}${c.dependencyOf ? ' · ' + c.dependencyOf : ''}`)),
    h('div.ci-act',
      c.manual ? h('a.btn.btn-sm.btn-update', { href: c.website, target: '_blank', rel: 'noopener' }, icon('external', 15), 'Get file') : null,
      switchEl(`en-${c.projectId}`, c.enabled !== false, async (on) => {
        try { await setEnabled(p, c, on); row.classList.toggle('off', !on); } catch (e) { toast(e.message, { error: true }); render(); }
      }, `${c.enabled !== false ? 'Disable' : 'Enable'} ${c.name}`),
      h('button.btn.btn-sm.btn-ghost.btn-icon', { onclick: () => contentMenu(p, c), 'aria-label': `Options for ${c.name}` }, icon('more', 18))));
  return row;
}

function contentMenu(p, c) {
  const s = openSheet({
    title: c.name,
    body: h('div.stack',
      h('div.kv',
        h('dt', 'File'), h('dd.mono', c.fileName),
        h('dt', 'Channel'), h('dd', releaseTag(c.releaseType)),
        h('dt', 'Published'), h('dd', fmtDate(c.fileDate)),
        h('dt', 'Folder'), h('dd.mono', c.folder)),
      h('div.stack', { style: { gap: '8px' } },
        c.projectId ? h('button.btn', { onclick: () => { s.close(); go(contentHref(c, p.id)); } }, icon('info', 18), 'View project') : null,
        h('button.btn', { onclick: async () => { c.locked = !c.locked; await Profiles.save(p, { syncLauncher: false }); s.close(); render(); } }, icon(c.locked ? 'unlock' : 'lock', 18), c.locked ? 'Unlock updates' : 'Lock this version'),
        h('button.btn.btn-danger', {
          onclick: async () => {
            s.close();
            const dependents = p.content.filter((x) => x.dependencyOf && x.dependencyOf.includes(c.name));
            if (await confirmSheet({ title: `Remove ${c.name}?`, message: `This deletes ${c.fileName} from ${p.name}.${dependents.length ? ' Other mods may need it.' : ''}`, confirm: 'Remove', danger: true })) {
              await removeContent(p, c);
              toast(`Removed ${c.name}`);
              render();
            }
          },
        }, icon('trash', 18), 'Remove'))),
  });
}

async function runUpdateCheck(p, button, bar) {
  button.disabled = true;
  button.replaceChildren(icon('spinner', 16, 'spin'), 'Checking');
  try {
    const updates = await checkUpdates(p);
    if (!updates.length) {
      bar.replaceChildren(h('div.notice', icon('check'), h('div', 'Everything is up to date.')));
    } else {
      bar.replaceChildren(h('div.notice.warn', icon('update'),
        h('div.grow.stack', { style: { gap: '8px' } },
          h('strong', `${updates.length} update${updates.length === 1 ? '' : 's'} available`),
          h('div.muted', updates.slice(0, 6).map((u) => `${u.item.name} → ${u.file.displayName}`).join(' · ') + (updates.length > 6 ? ' …' : '')),
          h('div.row', h('button.btn.btn-sm.btn-primary', {
            onclick: async (e) => {
              e.currentTarget.disabled = true;
              try { await applyUpdates(p, updates); toast('Updated'); render(); } catch (err) { toast(err.message, { error: true }); }
            },
          }, 'Update all')))));
    }
  } catch (e) {
    bar.replaceChildren(errorNotice(e));
  } finally {
    button.disabled = false;
    button.replaceChildren(icon('refresh', 16), 'Check for updates');
  }
}

function profileMenu(p) {
  const s = openSheet({
    title: p.name,
    body: h('div.stack', { style: { gap: '8px' } },
      h('button.btn', { onclick: async () => { s.close(); const n = await promptSheet({ title: 'Rename profile', label: 'Name', value: p.name }); if (n) { await Profiles.rename(p, n); render(); } } }, 'Rename'),
      exportFormats(p).map((fmt) => h('button.btn', { onclick: async () => { s.close(); try { const r = await exportProfile(p, fmt); toast(Native.available ? 'Export ready to share' : `Saved ${r}`); } catch (e) { toast(e.message, { error: true }); } } }, icon('share', 18), fmt === 'modrinth' ? 'Export as Modrinth .mrpack' : 'Export as CurseForge zip')),
      Native.available ? h('button.btn', { onclick: async () => { s.close(); try { const n = await repairProfile(p); toast(n ? `Restored ${n} file${n === 1 ? '' : 's'}` : 'No missing files'); } catch (e) { toast(e.message, { error: true }); } } }, icon('refresh', 18), 'Repair missing files') : null,
      Native.available && p.loader.type !== 'vanilla' ? h('button.btn', { onclick: async () => { s.close(); p.status = 'new'; p.versionId = ''; await Profiles.save(p, { syncLauncher: false }); try { const st = await installLoader(p); toast(st === 'ready' ? 'Loader reinstalled' : 'Installer started'); } catch (e) { toast(e.message, { error: true }); } render(); } }, icon('cpu', 18), `Reinstall ${LOADER_NAMES[p.loader.type]}`) : null,
      h('button.btn.btn-danger', {
        onclick: async () => {
          s.close();
          if (await confirmSheet({ title: `Delete ${p.name}?`, message: 'This removes the profile, its mods, settings and worlds from this device.', confirm: 'Delete', danger: true })) {
            await Profiles.remove(p);
            toast(`Deleted ${p.name}`);
            go('#/profiles');
          }
        },
      }, icon('trash', 18), 'Delete profile')),
  });
}

// Memory picker choices. 0 = Automatic. Values above what the phone can spare
// are hidden (the app caps them anyway), except the one already chosen.
function memoryChoices(current) {
  const info = Native.cachedInfo;
  const ramMb = info && info.ramBytes ? info.ramBytes / 1048576 : 0;
  const ceiling = (info && info.memoryCeilingMb) || (ramMb ? ramMb * 0.6 : 0);
  const values = [0, 2048, 3072, 4096, 6144, 8192].filter((m) => m === 0 || !ceiling || m <= ceiling);
  if (current && !values.includes(current)) values.push(current);
  values.sort((a, b) => a - b);
  return values.map((m) => ({ value: m, label: m ? `${Math.round((m / 1024) * 10) / 10} GB` : 'Automatic' }));
}

function memoryHint() {
  const info = Native.cachedInfo;
  const ceiling = info && info.memoryCeilingMb;
  const most = ceiling ? ` This phone can spare up to about ${Math.floor(ceiling / 1024 * 10) / 10} GB.` : '';
  return `Automatic gives modded profiles 4 GB when the phone has room.${most}`;
}

// iOS sets Java memory once for every profile, in the launcher settings.
function profileMemorySupported() {
  const info = Native.cachedInfo;
  return !(info && info.profileMemory === false);
}

function profileSettings(p) {
  const info = Native.cachedInfo;
  const args = h('textarea.input#ps-args', { placeholder: '-XX:+UseG1GC' }, p.javaArgs || '');
  return h('div.card.card-pad.settings-sec',
    profileMemorySupported()
      ? h('div.set-row', h('div.t', h('strong', 'Memory'), h('span', 'How much RAM Java can use. ' + memoryHint())),
        selectEl('ps-mem', memoryChoices(p.memoryMb || 0), p.memoryMb || 0, async (v) => { p.memoryMb = Number(v); await Profiles.save(p); toast('Saved'); }))
      : h('div.set-row', h('div.t', h('strong', 'Memory'), h('span', 'On iPhone and iPad, Java memory is set for all profiles in Launcher settings.')),
        h('button.btn.btn-sm', { onclick: () => Native.call('native.settings').catch((e) => toast(e.message, { error: true })) }, 'Open')),
    h('div.set-row', { style: { flexDirection: 'column', alignItems: 'stretch' } },
      h('div.t', h('strong', 'Extra Java arguments'), h('span', 'Added when this profile starts.')),
      args,
      h('div.row', h('button.btn.btn-sm', { onclick: async () => { p.javaArgs = args.value.trim(); await Profiles.save(p); toast('Saved'); } }, 'Save arguments'))),
    h('div.set-row', h('div.t', h('strong', 'Game version'), h('span', `Minecraft ${p.mc} · ${loaderLabel(p)}${p.versionId ? ' · ' + p.versionId : ''}`))),
    Native.available ? h('div.set-row', h('div.t', h('strong', 'Renderer and controls'), h('span', 'Graphics renderer, touch controls and other engine options live in the launcher settings.')),
      h('button.btn.btn-sm', { onclick: () => Native.call('native.settings').catch((e) => toast(e.message, { error: true })) }, 'Open')) : null,
    Native.available ? h('div.set-row', h('div.t', h('strong', 'Folder'), h('span.mono', `${(info && info.gameRoot) || ''}/${profileDir(p)}`))) : null);
}
