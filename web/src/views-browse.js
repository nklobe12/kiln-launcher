// ---- Home, Browse, Project ----

const isMinecraft = () => Number(settings.get().gameId) === MINECRAFT;

let mcVersionCache = null;
async function mcReleaseVersions() {
  if (mcVersionCache) return mcVersionCache;
  const list = await CF.minecraftVersions();
  const set = new Set(list.map((v) => v.versionString).filter((v) => /^\d+\.\d+(\.\d+)?$/.test(v)));
  mcVersionCache = [...set].sort((a, b) => cmpVersion(b, a));
  return mcVersionCache;
}

async function viewHome() {
  const profiles = await Profiles.all();
  const page = h('div.page');
  const totalMods = profiles.reduce((s, p) => s + (p.content || []).length, 0);
  const hero = h('section.hero',
    heroBlocks(),
    h('div.eyebrow', isMinecraft() ? 'Minecraft: Java Edition' : 'CurseForge'),
    h('h1', profiles.length ? 'Pick up where you left off' : 'Build your first modded world'),
    h('p', profiles.length
      ? `${profiles.length} profile${profiles.length === 1 ? '' : 's'} · ${totalMods} mod${totalMods === 1 ? '' : 's'} installed${Native.available ? '' : ' · open the Kiln app to play'}`
      : 'Install a modpack in one tap, or start a profile and add mods, shaders and resource packs from CurseForge.'),
    h('div.row',
      h('a.btn.btn-primary', { href: '#/browse/modpacks' }, icon('box', 18), 'Browse modpacks'),
      h('button.btn', { onclick: () => createProfileSheet() }, icon('plus', 18), 'New profile')));
  page.appendChild(hero);

  if (profiles.length) {
    page.appendChild(h('section.stack',
      h('div.section-head', h('h2', 'Jump back in'), h('a', { href: '#/profiles' }, 'All profiles')),
      h('div.profiles', profiles.slice(0, 4).map(profileCard))));
  }

  if (!CF.hasKey()) {
    page.appendChild(keyNeededCard());
    return page;
  }
  if (!isMinecraft()) {
    page.appendChild(h('div.notice', icon('info'), h('div', 'Kiln installs and launches Minecraft content. For other games you can browse and open projects on CurseForge. ', h('a', { href: '#/games' }, 'Switch game'))));
  }

  const packs = h('div.scroller', Array.from({ length: 6 }, () => h('div.skeleton', { style: { height: '220px' } })));
  const mods = skeletonList(4);
  page.appendChild(h('section.stack', h('div.section-head', h('h2', isMinecraft() ? 'Popular modpacks' : 'Popular projects'), h('a', { href: isMinecraft() ? '#/browse/modpacks' : '#/browse' }, 'See all')), packs));
  if (isMinecraft()) page.appendChild(h('section.stack', h('div.section-head', h('h2', 'Trending mods'), h('a', { href: '#/browse/mc-mods' }, 'See all')), mods));

  const gameId = settings.get().gameId;
  CF.search({ gameId, classId: isMinecraft() ? 4471 : undefined, sortField: 2, pageSize: 12 })
    .then((r) => packs.replaceWith(h('div.scroller', r.data.map((m) => projectTile(m)))))
    .catch((e) => packs.replaceWith(errorNotice(e, () => render())));
  if (isMinecraft()) {
    CF.search({ gameId, classId: 6, sortField: 2, pageSize: 6 })
      .then((r) => mods.replaceWith(h('div.list', r.data.map((m) => projectRow(m, { action: installButton(m) })))))
      .catch((e) => mods.replaceWith(errorNotice(e, () => render())));
  }
  return page;
}

// The main Install/Installed/Update button for a project
function installButton(mod, targetProfile = null, file = null) {
  if (!isMinecraft() || !classById(mod.classId)) {
    return h('a.btn.btn-sm', { href: projectWebUrl(mod), target: '_blank', rel: 'noopener' }, icon('external', 16), 'Open');
  }
  if (mod.classId === 4471) {
    return h('button.btn.btn-sm.btn-primary', { onclick: () => startModpackInstall(mod, file) }, icon('download', 16), 'Install');
  }
  if (targetProfile) {
    const have = (targetProfile.content || []).find((c) => c.projectId === mod.id);
    if (have) return h('button.btn.btn-sm.btn-installed', { disabled: true }, icon('check', 16), 'Installed');
    return h('button.btn.btn-sm.btn-primary', { onclick: (e) => installInto(targetProfile, mod, file, e.currentTarget) }, icon('download', 16), 'Install');
  }
  return h('button.btn.btn-sm.btn-primary', { onclick: () => chooseProfileAndInstall(mod, file) }, icon('download', 16), 'Install');
}

async function viewBrowse(params, query) {
  const page = h('div.page');
  const gameId = settings.get().gameId;
  const target = query.for ? Profiles.get(query.for) || (await Profiles.all(), Profiles.get(query.for)) : null;
  let cls = isMinecraft() ? classBySlug(params[0] || (target ? 'mc-mods' : 'modpacks')) || MC_CLASSES[0] : null;
  if (target && cls && cls.id === 4471) cls = MC_CLASSES[1];

  if (target) {
    page.appendChild(h('div.addbar',
      profileIcon(target),
      h('div.grow', h('strong', `Adding to ${target.name}`), h('div.muted', `Minecraft ${target.mc} · ${loaderLabel(target)}`)),
      h('a.btn.btn-sm', { href: `#/profile/${target.id}` }, 'Done')));
  } else {
    page.appendChild(h('div.row-between', h('h1', isMinecraft() ? 'Browse' : 'Browse projects')));
  }
  if (!CF.hasKey()) {
    page.appendChild(keyNeededCard());
    return page;
  }

  const state = {
    q: query.q || '',
    v: target ? target.mc : query.v || '',
    l: target ? (target.loader && target.loader.type !== 'vanilla' ? target.loader.type : '') : query.l || '',
    cat: query.cat || '',
    sort: Number(query.sort || 2),
    cls: cls ? cls.id : query.cls || '',
  };
  const setQuery = (patch) => {
    const next = { ...state, ...patch };
    const qs = new URLSearchParams();
    if (next.q) qs.set('q', next.q);
    if (!target && next.v) qs.set('v', next.v);
    if (!target && next.l) qs.set('l', next.l);
    if (next.cat) qs.set('cat', next.cat);
    if (next.sort !== 2) qs.set('sort', next.sort);
    if (target) qs.set('for', target.id);
    if (!isMinecraft() && next.cls) qs.set('cls', next.cls);
    const slug = isMinecraft() ? (classById(Number(next.cls)) || MC_CLASSES[0]).slug : '';
    go(`#/browse${slug ? '/' + slug : ''}${qs.toString() ? '?' + qs : ''}`);
  };

  if (isMinecraft()) {
    const classes = target ? MC_CLASSES.filter((c) => c.id !== 4471) : MC_CLASSES;
    page.appendChild(h('div.segmented', { role: 'tablist' }, classes.map((c) => h('button', {
      'aria-pressed': String(c.id === state.cls),
      onclick: () => setQuery({ cls: c.id, cat: '', l: c.id === 6 ? state.l : '' }),
    }, c.name))));
  }

  const filters = h('div.filters');
  page.appendChild(filters);
  const searchInput = h('input.input#browse-q', { type: 'search', value: state.q, placeholder: `Search ${cls ? cls.name.toLowerCase() : 'projects'}`, enterkeyhint: 'search' });
  searchInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') setQuery({ q: searchInput.value.trim() }); });
  filters.appendChild(h('div.field.wide', h('label', { for: 'browse-q' }, 'Search'), searchInput));

  // version / loader / category / sort
  const versionField = h('div.field', h('label', { for: 'browse-v' }, 'Game version'), h('select.select#browse-v', { disabled: !!target }, h('option', { value: '' }, state.v || 'Any version')));
  filters.appendChild(versionField);
  if (isMinecraft()) {
    mcReleaseVersions().then((versions) => {
      versionField.replaceChildren(h('label', { for: 'browse-v' }, 'Game version'),
        selectEl('browse-v', [{ value: '', label: 'Any version' }, ...versions.map((v) => ({ value: v, label: v }))], state.v, (v) => setQuery({ v })));
      if (target) $('#browse-v', versionField).disabled = true;
    }).catch(() => {});
  }
  if (isMinecraft() && state.cls === 6) {
    const loaderSel = selectEl('browse-l', [{ value: '', label: 'Any loader' }, ...Object.keys(LOADER_KEYS).map((k) => ({ value: k, label: LOADER_NAMES[k] }))], state.l, (l) => setQuery({ l }));
    if (target) loaderSel.disabled = true;
    filters.appendChild(h('div.field', h('label', { for: 'browse-l' }, 'Mod loader'), loaderSel));
  }
  const catField = h('div.field', h('label', { for: 'browse-cat' }, 'Category'), h('select.select#browse-cat', h('option', 'All categories')));
  filters.appendChild(catField);
  CF.categories(gameId, state.cls || undefined).then((cats) => {
    const opts = cats.filter((c) => !state.cls || c.classId === Number(state.cls)).sort((a, b) => a.name.localeCompare(b.name));
    catField.replaceChildren(h('label', { for: 'browse-cat' }, 'Category'),
      selectEl('browse-cat', [{ value: '', label: 'All categories' }, ...opts.map((c) => ({ value: c.id, label: c.name }))], state.cat, (cat) => setQuery({ cat })));
  }).catch(() => {});
  filters.appendChild(h('div.field', h('label', { for: 'browse-sort' }, 'Sort by'),
    selectEl('browse-sort', SORTS.map((s) => ({ value: s.id, label: s.label })), state.sort, (sort) => setQuery({ sort: Number(sort) }))));

  const results = h('div.list');
  const more = h('div.row', { style: { justifyContent: 'center' } });
  const summary = h('div.muted.num', { style: { fontSize: '13px' } });
  page.append(summary, results, more);
  let index = 0;
  const pageSize = 30;

  async function loadPage() {
    more.replaceChildren(h('div.muted', icon('spinner', 18, 'spin')));
    try {
      const r = await CF.search({
        gameId,
        classId: state.cls || undefined,
        categoryId: state.cat || undefined,
        gameVersion: state.v || undefined,
        modLoaderType: state.l ? LOADER_KEYS[state.l] : undefined,
        searchFilter: state.q || undefined,
        sortField: state.sort,
        index,
        pageSize,
      });
      if (index === 0 && !r.data.length) {
        results.replaceChildren(h('div.empty', icon('search'), h('h3', 'No results'), h('div', state.q ? `Nothing matched “${state.q}”. Try fewer words or another category.` : 'Try a different filter.')));
      }
      r.data.forEach((m) => results.appendChild(projectRow(m, { action: installButton(m, target), context: target && target.id })));
      index += r.data.length;
      const total = Math.min(r.pagination.totalCount || 0, 10000);
      summary.textContent = total ? `${fmtNum(total)} result${total === 1 ? '' : 's'}` : '';
      more.replaceChildren(index < total && r.data.length ? h('button.btn', { onclick: loadPage }, 'Load more') : '');
    } catch (e) {
      more.replaceChildren();
      results.appendChild(errorNotice(e, () => render()));
    }
  }
  results.appendChild(skeletonList(4));
  loadPage().then(() => { const sk = results.querySelector('.skeleton'); if (sk) sk.parentElement.remove(); });
  return page;
}

async function viewProject(params, query) {
  const id = Number(params[0]);
  const tab = params[1] || 'about';
  const target = query.for ? (await Profiles.all(), Profiles.get(query.for)) : null;
  const page = h('div.page');
  if (!CF.hasKey()) {
    page.appendChild(keyNeededCard());
    return page;
  }
  let mod;
  try {
    mod = await CF.mod(id);
  } catch (e) {
    page.appendChild(errorNotice(e, () => render()));
    return page;
  }
  const cls = classById(mod.classId);
  const versions = projectVersions(mod);
  const tabHref = (t) => `#/project/${id}${t === 'about' ? '' : '/' + t}${target ? '?for=' + target.id : ''}`;

  page.appendChild(h('button.btn.btn-ghost.btn-sm', { onclick: () => history.back(), style: { alignSelf: 'flex-start' } }, icon('back', 16), 'Back'));
  page.appendChild(h('section.phead',
    img(modLogo(mod), 'phead-logo'),
    h('div.phead-info',
      h('div.eyebrow', cls ? cls.name.replace(/s$/, '') : 'Project'),
      h('h1', mod.name),
      h('div.muted', 'by ', (mod.authors || []).map((a, i) => [i ? ', ' : '', h('a', { href: a.url || '#', target: '_blank', rel: 'noopener' }, a.name)])),
      h('p', { style: { margin: 0 } }, mod.summary || ''),
      h('div.stats.num',
        h('span', h('b', fmtNum(mod.downloadCount)), ' downloads'),
        h('span', 'Updated ', h('b', relTime(mod.dateReleased || mod.dateModified))),
        versions[0] ? h('span', 'Minecraft ', h('b', versions.length > 1 ? `${versions[versions.length - 1]} – ${versions[0]}` : versions[0])) : null,
        projectLoaders(mod).length ? h('span', h('b', projectLoaders(mod).join(', '))) : null),
      h('div.row', (mod.categories || []).slice(0, 6).map((c) => h('span.chip', c.name))),
      h('div.phead-actions',
        installButton(mod, target),
        h('a.btn.btn-sm', { href: projectWebUrl(mod), target: '_blank', rel: 'noopener' }, icon('external', 16), 'CurseForge page'),
        mod.links && mod.links.sourceUrl ? h('a.btn.btn-sm.btn-ghost', { href: mod.links.sourceUrl, target: '_blank', rel: 'noopener' }, 'Source') : null,
        mod.links && mod.links.issuesUrl ? h('a.btn.btn-sm.btn-ghost', { href: mod.links.issuesUrl, target: '_blank', rel: 'noopener' }, 'Issues') : null))));

  const tabs = [['about', 'About'], ['files', 'Files'], ['changelog', 'Changelog'], ['gallery', 'Gallery', (mod.screenshots || []).length], ['relations', 'Dependencies']];
  page.appendChild(h('div.tabs', { role: 'tablist' }, tabs.map(([t, label, count]) => h('a.tab', { href: tabHref(t), role: 'tab', 'aria-selected': String(t === tab) }, label, count ? h('span.count', count) : null))));
  const body = h('section', h('div.skeleton', { style: { height: '240px' } }));
  page.appendChild(body);

  const fill = (node) => body.replaceChildren(node);
  try {
    if (tab === 'about') {
      const html = await CF.description(id);
      fill(h('div.desc.card.card-pad', { html: sanitizeHtml(html) }));
    } else if (tab === 'files') {
      fill(await filesPanel(mod, target));
    } else if (tab === 'changelog') {
      const latest = (mod.latestFiles || []).slice().sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate))[0];
      if (!latest) fill(h('div.empty', 'No files yet'));
      else {
        const html = await CF.changelog(id, latest.id);
        fill(h('div.stack', h('div.row', h('strong', latest.displayName), releaseTag(latest.releaseType), h('span.muted', fmtDate(latest.fileDate))),
          h('div.desc.card.card-pad', { html: sanitizeHtml(html) || '<p>No changelog for this file.</p>' })));
      }
    } else if (tab === 'gallery') {
      const shots = mod.screenshots || [];
      fill(shots.length
        ? h('div.gallery', shots.map((s) => h('figure', { onclick: () => lightbox(s.url) }, img(s.thumbnailUrl || s.url, ''), s.title ? h('figcaption', s.title) : null)))
        : h('div.empty', icon('browse'), h('h3', 'No images'), h('div', 'The author has not added a gallery.')));
    } else if (tab === 'relations') {
      const file = target ? await bestFileFor(mod, target) : (mod.latestFiles || []).slice().sort((a, b) => Date.parse(b.fileDate) - Date.parse(a.fileDate))[0];
      const deps = file ? (file.dependencies || []).filter((d) => [REL.REQUIRED, REL.OPTIONAL, REL.INCOMPATIBLE, REL.EMBEDDED].includes(d.relationType)) : [];
      if (!deps.length) fill(h('div.empty', icon('link'), h('h3', 'No dependencies'), h('div', file ? `${file.displayName} works on its own.` : 'No file to check.')));
      else {
        const mods = await CF.mods(deps.map((d) => d.modId));
        const label = { [REL.REQUIRED]: 'Required', [REL.OPTIONAL]: 'Optional', [REL.INCOMPATIBLE]: 'Incompatible', [REL.EMBEDDED]: 'Included' };
        fill(h('div.stack', h('div.muted', `For ${file.displayName}`), h('div.list', deps.map((d) => {
          const m = mods.find((x) => x.id === d.modId);
          if (!m) return null;
          return projectRow(m, { action: h('span.chip' + (d.relationType === REL.INCOMPATIBLE ? '.chip-danger' : d.relationType === REL.REQUIRED ? '.chip-accent' : ''), label[d.relationType]), context: target && target.id });
        }))));
      }
    }
  } catch (e) {
    fill(errorNotice(e, () => render()));
  }
  return page;
}

async function filesPanel(mod, target) {
  const wrap = h('div.stack');
  const isMods = mod.classId === 6;
  const state = { v: target ? target.mc : '', l: target && isMods && target.loader.type !== 'vanilla' ? target.loader.type : '', index: 0 };
  const versions = projectVersions(mod);
  const list = h('div.content-list');
  const more = h('div.row', { style: { justifyContent: 'center' } });
  const filters = h('div.filters',
    h('div.field', h('label', { for: 'files-v' }, 'Game version'), selectEl('files-v', [{ value: '', label: 'All versions' }, ...versions.map((v) => ({ value: v, label: v }))], state.v, (v) => { state.v = v; reload(); })),
    isMods ? h('div.field', h('label', { for: 'files-l' }, 'Mod loader'), selectEl('files-l', [{ value: '', label: 'Any loader' }, ...Object.keys(LOADER_KEYS).map((k) => ({ value: k, label: LOADER_NAMES[k] }))], state.l, (l) => { state.l = l; reload(); })) : null);
  wrap.append(filters, list, more);

  async function load() {
    more.replaceChildren(icon('spinner', 18, 'spin'));
    const r = await CF.files(mod.id, { gameVersion: state.v || undefined, modLoaderType: state.l ? LOADER_KEYS[state.l] : undefined, index: state.index, pageSize: 30 });
    if (!r.data.length && state.index === 0) list.replaceChildren(h('div.empty', { style: { border: 0 } }, 'No files match these filters.'));
    r.data.forEach((f) => list.appendChild(h('div.citem',
      h('div.ph', { style: { display: 'grid', placeItems: 'center' } }, releaseTag(f.releaseType)),
      h('div.ci-main', h('strong', f.displayName || f.fileName), h('small.num', `${fmtDate(f.fileDate)} · ${fmtBytes(f.fileLength)} · ${fileMcVersions(f).slice(0, 4).join(', ')}${fileLoaders(f).length ? ' · ' + fileLoaders(f).map((l) => LOADER_NAMES[l]).join(', ') : ''}`)),
      h('div.ci-act', installButton(mod, target, f)))));
    state.index += r.data.length;
    const total = r.pagination.totalCount || 0;
    more.replaceChildren(state.index < total ? h('button.btn', { onclick: () => load().catch((e) => more.replaceChildren(errorNotice(e))) }, 'Load more') : '');
  }
  function reload() {
    state.index = 0;
    list.replaceChildren();
    load().catch((e) => list.replaceChildren(errorNotice(e)));
  }
  await load();
  return wrap;
}
