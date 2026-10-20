// ---- router + shell ----

const ROUTES = {
  '': viewHome,
  browse: viewBrowse,
  project: viewProject,
  mr: viewMrProject,
  profiles: viewProfiles,
  profile: viewProfile,
  downloads: viewDownloads,
  settings: viewSettings,
  logs: viewLogs,
  games: viewGames,
};
const NAV = [
  { key: '', label: 'Home', icon: 'home', href: '#/' },
  { key: 'browse', label: 'Browse', icon: 'browse', href: '#/browse', match: ['project', 'mr'] },
  { key: 'profiles', label: 'Profiles', icon: 'layers', href: '#/profiles', match: ['profile'] },
  { key: 'downloads', label: 'Downloads', icon: 'download', href: '#/downloads' },
  { key: 'settings', label: 'Settings', icon: 'settings', href: '#/settings', match: ['logs'] },
];

let routeCleanup = [];
let renderToken = 0;
let currentGame = null;

function parseRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, qs] = raw.split('?');
  const parts = path.split('/').filter(Boolean).map(decodeURIComponent);
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  return { name: parts[0] || '', params: parts.slice(1), query };
}

function go(hash) {
  if (location.hash === hash) render();
  else location.hash = hash;
}

function drawRail(route) {
  const rail = $('#rail');
  const activeCount = Tasks.active().length;
  rail.replaceChildren(
    h('div.brand', h('div.brand-mark', icon('flame', 20)), h('div', h('div.brand-name', 'Kiln'), h('div.brand-sub', Native.available ? 'Mods + play' : 'Mod manager'))),
    ...NAV.map((n) => h('a.nav-item', {
      href: n.href,
      'aria-current': n.key === route.name || (n.match || []).includes(route.name) ? 'page' : null,
    }, icon(n.icon, 20), h('span.nav-text', n.label), n.key === 'downloads' && activeCount ? h('span.badge', activeCount) : null)),
    h('div.rail-foot',
      h('div.faint', { style: { fontSize: '12px', padding: '0 6px' } }, Native.available ? `Amethyst engine · ${Native.platform === 'ios' ? 'iOS' : 'Android'}` : 'Browser mode')));
}

function drawTopbar(route) {
  const top = $('#topbar');
  const q = route.name === 'browse' ? route.query.q || '' : '';
  const input = h('input#top-search', { type: 'search', placeholder: isMinecraft() ? 'Search mods, modpacks…' : 'Search projects…', value: q, enterkeyhint: 'search', 'aria-label': 'Search CurseForge' });
  input.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    const v = input.value.trim();
    const r = parseRoute();
    const forId = r.query.for ? `&for=${encodeURIComponent(r.query.for)}` : '';
    const cls = r.name === 'browse' && r.params[0] ? r.params[0] : isMinecraft() ? 'mc-mods' : '';
    const src = r.name === 'browse' && r.query.src ? `&src=${r.query.src}` : '';
    go(`#/browse${cls ? '/' + cls : ''}?q=${encodeURIComponent(v)}${forId}${src}`);
    input.blur();
  });
  const game = currentGame;
  top.replaceChildren(
    h('button.game-switch', { onclick: () => go('#/games'), 'aria-label': 'Choose game' },
      game && game.assets && game.assets.iconUrl ? img(game.assets.iconUrl, '') : h('span.ph', { style: { background: glazeFor('minecraft'), display: 'inline-block' } }),
      h('span', game ? game.name : 'Minecraft')),
    h('label.search-box', icon('search', 18), input),
    accountChip());
}

async function render() {
  const token = ++renderToken;
  routeCleanup.forEach((fn) => fn());
  routeCleanup = [];
  const route = parseRoute();
  drawRail(route);
  drawTopbar(route);
  const view = ROUTES[route.name] || viewHome;
  const main = $('#main');
  let node;
  try {
    node = await view(route.params, route.query);
  } catch (e) {
    log('error', 'View failed', e);
    node = h('div.page', errorNotice(e, () => render()));
  }
  if (token !== renderToken) return; // a newer navigation won
  main.replaceChildren(node);
}

// Re-render parts that show live task progress without rebuilding forms
let tasksTimer = null;
bus.on('tasks', () => {
  if (tasksTimer) return;
  tasksTimer = setTimeout(() => {
    tasksTimer = null;
    drawRail(parseRoute());
    const r = parseRoute();
    if (r.name === 'downloads') render();
  }, 300);
});
bus.on('profiles', () => {
  const r = parseRoute();
  if (r.name === 'profiles' || r.name === '') render();
});

async function boot() {
  document.body.classList.toggle('native', Native.available);
  document.body.classList.add('platform-' + Native.platform);
  applyTheme();
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: light)').addEventListener?.('change', applyTheme);
  window.addEventListener('hashchange', () => { render(); $('#main').scrollTo?.(0, 0); window.scrollTo(0, 0); });
  log('info', `Kiln starting (${Native.platform})`);
  await Native.info();
  await CF.loadBundledKey();
  await Profiles.all(true).catch((e) => log('error', 'Loading profiles failed', e));
  await render();
  finishPendingLoaders().catch((e) => log('warn', 'Pending loader check failed', e));
  if (CF.hasKey()) {
    CF.games().then((games) => {
      currentGame = games.find((g) => g.id === Number(settings.get().gameId)) || null;
      drawTopbar(parseRoute());
    }).catch(() => {});
  }
  bus.on('native:resume', async () => {
    await Native.info(true);
    drawTopbar(parseRoute());
    finishPendingLoaders().catch(() => {});
  });
  bus.on('settings', () => {
    const g = settings.get().gameId;
    if (!currentGame || currentGame.id !== Number(g)) {
      CF.games().then((games) => { currentGame = games.find((x) => x.id === Number(g)) || null; drawTopbar(parseRoute()); }).catch(() => {});
    }
  });
}

boot();
