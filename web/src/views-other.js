// ---- Downloads, Settings, Logs, Games ----

async function viewDownloads(params, query) {
  const tab = query.tab === 'done' ? 'done' : 'active';
  const page = h('div.page');
  const active = Tasks.active();
  const done = Tasks.history();
  page.appendChild(h('div.row-between', h('h1', 'Downloads'),
    tab === 'done' && done.length ? h('button.btn.btn-sm', { onclick: () => { Tasks.clearHistory(); render(); } }, 'Clear list') : null));
  page.appendChild(h('div.tabs', { role: 'tablist' },
    h('a.tab', { href: '#/downloads', role: 'tab', 'aria-selected': String(tab === 'active') }, 'In progress', h('span.count', active.length)),
    h('a.tab', { href: '#/downloads?tab=done', role: 'tab', 'aria-selected': String(tab === 'done') }, 'Completed', h('span.count', done.length))));
  const items = tab === 'active' ? active : done;
  if (!items.length) {
    page.appendChild(h('div.empty', icon('download'),
      h('h3', tab === 'active' ? 'Nothing downloading' : 'No finished downloads'),
      h('div', tab === 'active' ? 'Installs and updates show their progress here.' : 'Finished and failed installs are listed here.')));
    return page;
  }
  page.appendChild(h('div.card', items.map((t) => h('div.dl',
    h('div', { style: { minWidth: 0 } },
      h('strong', t.label),
      h('div', h('small', t.status === 'failed' ? t.error : t.detail || (t.steps ? `${t.done} of ${t.steps}` : '')))),
    h('div.row', { style: { gap: '6px' } },
      t.status === 'running' ? h('span.chip.chip-accent.num', t.steps ? `${t.done}/${t.steps}` : icon('spinner', 13, 'spin')) : null,
      t.status === 'done' ? h('span.chip.chip-accent', icon('check', 13), relTime(t.finished)) : null,
      t.status === 'failed' ? h('span.chip.chip-danger', 'Failed') : null,
      t.profileId && Profiles.get(t.profileId) ? h('a.btn.btn-sm.btn-ghost', { href: `#/profile/${t.profileId}` }, 'Open') : null),
    t.status === 'running' ? progressBar(t) : null))));
  return page;
}

async function viewSettings() {
  const s = settings.get();
  const info = await Native.info(true);
  const page = h('div.page', { style: { maxWidth: '760px' } });
  page.appendChild(h('h1', 'Settings'));

  // CurseForge
  const keyInput = h('input.input#set-key', { type: 'password', value: s.apiKey, placeholder: CF.usingBundledKey() ? 'Using the key built into this app' : 'Paste your API key', autocomplete: 'off', spellcheck: 'false' });
  const keyStatus = h('div.hint');
  const testKey = async () => {
    keyStatus.textContent = 'Checking…';
    try {
      CF.clearCache();
      const games = await CF.games();
      keyStatus.textContent = `Connected. ${games.length} games available.`;
      keyStatus.style.color = 'var(--accent)';
    } catch (e) {
      keyStatus.textContent = e.message;
      keyStatus.style.color = 'var(--danger)';
    }
  };
  page.appendChild(h('section.card.card-pad.settings-sec',
    h('h2', 'CurseForge'),
    h('div.field', h('label', { for: 'set-key' }, 'API key'),
      h('div.row', { style: { flexWrap: 'nowrap' } }, keyInput,
        h('button.btn.btn-icon', { onclick: () => { keyInput.type = keyInput.type === 'password' ? 'text' : 'password'; }, 'aria-label': 'Show or hide key' }, icon('key', 18)))),
    h('div.hint', 'Get a free key at ', h('a', { href: 'https://console.curseforge.com/', target: '_blank', rel: 'noopener' }, 'console.curseforge.com'), '. It stays on this device. Modrinth works without a key.'),
    h('div.row',
      h('button.btn.btn-primary.btn-sm', { onclick: async () => { settings.set({ apiKey: keyInput.value.trim() }); await testKey(); } }, 'Save and test'),
      s.apiKey ? h('button.btn.btn-sm.btn-ghost', { onclick: () => { settings.set({ apiKey: '' }); render(); } }, 'Remove key') : null),
    keyStatus,
    !Native.available ? h('div.field', h('label', { for: 'set-base' }, 'API address (optional proxy)'),
      h('input.input#set-base', { value: s.apiBase, placeholder: 'https://api.curseforge.com', onchange: (e) => settings.set({ apiBase: e.target.value.trim() }) }),
      h('div.hint', 'Browsers may block CurseForge directly. Point this at a proxy you run, or use the app.')) : null));

  // Downloads
  page.appendChild(h('section.card.card-pad.settings-sec',
    h('h2', 'Installing'),
    h('div.set-row', h('div.t', h('strong', 'Beta files'), h('span', 'Allow beta releases when no stable file fits.')), switchEl('set-beta', s.allowBeta, (v) => settings.set({ allowBeta: v }), 'Beta files')),
    h('div.set-row', h('div.t', h('strong', 'Alpha files'), h('span', 'Allow early alpha builds. These break more often.')), switchEl('set-alpha', s.allowAlpha, (v) => settings.set({ allowAlpha: v }), 'Alpha files')),
    h('div.set-row', h('div.t', h('strong', 'Required dependencies'), h('span', 'Install libraries a mod needs along with it.')), switchEl('set-deps', s.autoDeps, (v) => settings.set({ autoDeps: v }), 'Required dependencies'))));

  // Game / launcher
  if (Native.available) {
    page.appendChild(h('section.card.card-pad.settings-sec',
      h('h2', 'Playing'),
      h('div.set-row', h('div.t', h('strong', 'Account'), h('span', info && info.account ? `${info.account.name} (${info.account.type === 'microsoft' ? 'Microsoft' : info.account.type})` : 'Sign in with the Microsoft account that owns Minecraft.')),
        h('button.btn.btn-sm', { onclick: () => Native.call('account.manage').catch((e) => toast(e.message, { error: true })) }, info && info.account ? 'Manage' : 'Sign in')),
      profileMemorySupported() ? h('div.set-row', h('div.t', h('strong', 'Default memory'), h('span', 'Used by profiles set to Automatic. ' + memoryHint())),
        selectEl('set-mem', memoryChoices(s.memoryMb || 0), s.memoryMb || 0, (v) => settings.set({ memoryMb: Number(v) }))) : null,
      h('div.set-row', h('div.t', h('strong', 'Launcher settings'), h('span', 'Renderer, resolution, touch and gamepad controls, Java runtimes and JIT options.')),
        h('button.btn.btn-sm', { onclick: () => Native.call('native.settings').catch((e) => toast(e.message, { error: true })) }, 'Open')),
      h('div.set-row', h('div.t', h('strong', 'All launcher profiles'), h('span', 'Edit profiles made outside Kiln, or tweak a profile’s renderer and controls.')),
        h('button.btn.btn-sm', { onclick: () => Native.call('native.profiles').catch((e) => toast(e.message, { error: true })) }, 'Open'))));
    if (info && info.platform === 'ios') {
      page.appendChild(h('section.card.card-pad.settings-sec',
        h('h2', 'JIT on iPhone'),
        h('div.notice' + (info.jit ? '' : '.warn'), icon(info.jit ? 'check' : 'info'),
          h('div.stack', { style: { gap: '6px' } },
            h('strong', info.jit ? 'JIT is on' : 'JIT is off right now'),
            h('div.muted', info.txm
              ? 'This iPhone needs StikDebug with the Universal JIT script. When you tap Play, Kiln opens StikDebug to turn JIT on and the game starts once it is enabled.'
              : 'Java needs JIT. When you tap Play, Kiln asks StikDebug or SideStore to enable it.'),
            h('a', { href: 'https://github.com/StikDebug/StikDebug', target: '_blank', rel: 'noopener' }, 'About StikDebug')))));
    }
  }

  // Appearance
  const themeSeg = h('div.segmented', ['system', 'dark', 'light'].map((t) => h('button', {
    'aria-pressed': String(s.theme === t),
    onclick: () => { settings.set({ theme: t }); applyTheme(); render(); },
  }, t[0].toUpperCase() + t.slice(1))));
  page.appendChild(h('section.card.card-pad.settings-sec', h('h2', 'Appearance'), h('div.set-row', h('div.t', h('strong', 'Theme')), themeSeg)));

  // About
  page.appendChild(h('section.card.card-pad.settings-sec',
    h('h2', 'About Kiln'),
    h('dl.kv',
      h('dt', 'Version'), h('dd', info ? `${info.appVersion || '—'} (${info.platform})` : 'Web'),
      info ? [h('dt', 'Device'), h('dd', `${info.device || ''} · ${info.osVersion || ''}`)] : null,
      info ? [h('dt', 'Game folder'), h('dd.mono', info.gameRoot || '')] : null,
      h('dt', 'Engine'), h('dd', Native.available ? 'Amethyst (PojavLauncher) Java runtime' : 'Browser')),
    h('p.muted', { style: { margin: 0, fontSize: '13px' } },
      'Kiln is a CurseForge-style front end for the open-source Amethyst launcher (GPL-3.0 on iOS, LGPL-3.0 on Android), itself based on PojavLauncher. Mod data comes from the CurseForge API. Kiln is not affiliated with CurseForge, Overwolf, Mojang or Microsoft.'),
    h('div.row',
      h('a.btn.btn-sm', { href: '#/logs' }, icon('logs', 16), 'Activity log'),
      h('button.btn.btn-sm.btn-danger', {
        onclick: async () => {
          if (await confirmSheet({ title: 'Reset Kiln settings?', message: 'This clears your API key and preferences on this device. Profiles and game files stay.', confirm: 'Reset', danger: true })) {
            storage.remove('settings');
            storage.remove('history');
            location.reload();
          }
        },
      }, 'Reset settings'))));
  return page;
}

async function shareGameLog() {
  try {
    const shared = await Native.call('game.shareLog');
    if (!shared) toast('No game log yet. Start the game once, then try again.');
  } catch (e) {
    toast(e.message, { error: true });
  }
}

async function viewLogs() {
  const page = h('div.page');
  const box = h('div.log');
  const draw = () => box.replaceChildren(...(LOG.length ? LOG.slice().reverse().map((l) => h('div.lv-' + l.level, h('time', new Date(l.t).toLocaleTimeString()), l.msg)) : [h('div.muted', 'Nothing logged yet.')]));
  draw();
  const off = bus.on('log', draw);
  routeCleanup.push(off);
  page.append(
    h('div.row-between', h('h1', 'Activity log'),
      h('div.row',
        Native.available ? h('button.btn.btn-sm#share-game-log', { onclick: shareGameLog }, 'Share game log') : null,
        h('button.btn.btn-sm', {
          onclick: async () => {
            const text = LOG.map((l) => `${new Date(l.t).toISOString()} ${l.level.toUpperCase()} ${l.msg}`).join('\n');
            try { await navigator.clipboard.writeText(text); toast('Copied'); } catch (e) { toast('Copy is not available here', { error: true }); }
          },
        }, 'Copy'))),
    h('div.muted', 'Requests, installs and errors from this session. ' + (Native.available
      ? 'Share game log sends the log from the last time Minecraft ran, which shows why a launch stalled or crashed.'
      : 'Game output appears in the launcher’s own log screen while Minecraft runs.')),
    box);
  return page;
}

async function viewGames() {
  const page = h('div.page');
  page.appendChild(h('h1', 'Choose a game'));
  if (!CF.hasKey()) {
    page.appendChild(keyNeededCard());
    return page;
  }
  try {
    const games = (await CF.games()).filter((g) => g.status !== 3);
    games.sort((a, b) => (a.id === MINECRAFT ? -1 : b.id === MINECRAFT ? 1 : a.name.localeCompare(b.name)));
    page.appendChild(h('div.tiles', games.map((g) => h('div.tile', {
      onclick: () => { settings.set({ gameId: g.id }); go('#/'); },
      role: 'button', tabindex: '0',
      style: g.id === Number(settings.get().gameId) ? { borderColor: 'var(--accent)' } : null,
    }, img((g.assets && (g.assets.tileUrl || g.assets.iconUrl)) || '', ''), h('strong', g.name), g.id === MINECRAFT ? h('span.chip.chip-accent', 'Install and play') : h('span.muted', 'Browse only')))));
  } catch (e) {
    page.appendChild(errorNotice(e, () => render()));
  }
  return page;
}
