// ---- shared UI pieces ----

function toast(message, { error = false, ms = 3200 } = {}) {
  const el = h('div.toast' + (error ? '.err' : ''), icon(error ? 'warn' : 'check', 18), h('span', message));
  const box = $('#toasts');
  box.appendChild(el);
  while (box.children.length > 3) box.firstChild.remove();
  setTimeout(() => el.remove(), ms);
}

// Modal sheet (bottom sheet on phones). Returns { close, body }.
function openSheet({ title, body, actions = [], onClose, wide = false }) {
  const root = $('#sheet-root');
  let closed = false;
  const close = (value) => {
    if (closed) return;
    closed = true;
    backdrop.remove();
    document.removeEventListener('keydown', onKey);
    onClose && onClose(value);
  };
  const onKey = (e) => { if (e.key === 'Escape') close(); };
  const bodyEl = h('div.sheet-body', body);
  const foot = actions.length
    ? h('div.sheet-foot', actions.map((a) => h('button.btn' + (a.primary ? '.btn-primary' : '') + (a.danger ? '.btn-danger' : ''), {
      onclick: async (e) => {
        if (!a.onClick) return close(a.value);
        const btn = e.currentTarget;
        btn.disabled = true;
        try {
          const r = await a.onClick();
          if (r !== false) close(a.value);
        } catch (err) {
          toast(err.message || String(err), { error: true });
        } finally {
          btn.disabled = false;
        }
      },
      id: a.id,
    }, a.label)))
    : null;
  const sheet = h('div.sheet', { role: 'dialog', 'aria-modal': 'true', 'aria-label': title, style: wide ? { width: 'min(760px, 100%)' } : null },
    h('div.sheet-head', h('h2', title), h('button.btn.btn-ghost.btn-icon', { onclick: () => close(), 'aria-label': 'Close' }, icon('x'))),
    bodyEl,
    foot);
  const backdrop = h('div.sheet-backdrop', { onclick: (e) => { if (e.target === backdrop) close(); } }, sheet);
  root.appendChild(backdrop);
  document.addEventListener('keydown', onKey);
  return { close, body: bodyEl, sheet };
}

function confirmSheet({ title, message, confirm = 'Continue', danger = false }) {
  return new Promise((resolve) => {
    openSheet({
      title,
      body: typeof message === 'string' ? h('p', { style: { margin: 0 } }, message) : message,
      actions: [
        { label: 'Cancel', value: false },
        { label: confirm, value: true, primary: !danger, danger },
      ],
      onClose: (v) => resolve(!!v),
    });
  });
}

function promptSheet({ title, label, value = '', confirm = 'Save', placeholder = '' }) {
  return new Promise((resolve) => {
    const input = h('input.input#prompt-input', { value, placeholder, autocomplete: 'off' });
    const s = openSheet({
      title,
      body: h('div.field', h('label', { for: 'prompt-input' }, label), input),
      actions: [
        { label: 'Cancel', value: null },
        { label: confirm, primary: true, onClick: () => { resolve(input.value.trim()); return true; } },
      ],
      onClose: (v) => { if (v === null || v === undefined) resolve(null); },
    });
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { resolve(input.value.trim()); s.close('done'); } });
    setTimeout(() => input.focus(), 50);
  });
}

function errorNotice(err, retry) {
  const msg = err && err.message ? err.message : String(err);
  const needsKey = err && (err.status === 401 || err.status === 403);
  return h('div.notice.danger', icon('warn'),
    h('div.grow.stack', { style: { gap: '8px' } },
      h('div', msg),
      h('div.row',
        needsKey ? h('a.btn.btn-sm', { href: '#/settings' }, icon('key', 16), 'Open Settings') : null,
        retry ? h('button.btn.btn-sm', { onclick: retry }, icon('refresh', 16), 'Try again') : null)));
}

function keyNeededCard() {
  return h('div.card.card-pad.stack',
    h('div.row', icon('key'), h('h2', 'Connect to CurseForge')),
    h('p.muted', { style: { margin: 0 } },
      'Kiln loads mods with your own free CurseForge API key. Create one at ',
      h('a', { href: 'https://console.curseforge.com/', target: '_blank', rel: 'noopener' }, 'console.curseforge.com'),
      ', then paste it in Settings.'),
    h('div.row', h('a.btn.btn-primary', { href: '#/settings' }, 'Add API key')));
}

function skeletonList(n = 5) {
  return h('div.list', Array.from({ length: n }, () => h('div.skeleton', { style: { height: '88px' } })));
}

function img(src, cls, alt = '') {
  const el = h('img' + (cls ? '.' + cls : ''), { src: src || '', alt, loading: 'lazy', decoding: 'async', referrerpolicy: 'no-referrer' });
  el.addEventListener('error', () => { el.removeAttribute('src'); el.style.visibility = 'hidden'; }, { once: true });
  if (!src) el.style.visibility = 'hidden';
  return el;
}

function profileIcon(p, large = false) {
  const generated = () => h(large ? 'div.picon.picon-lg' : 'div.picon', { style: { background: glazeFor(p.name) }, 'aria-hidden': 'true' }, initials(p.name));
  if (p.icon) {
    const el = h('img', { src: p.icon, alt: '', class: large ? 'picon picon-lg' : 'picon', referrerpolicy: 'no-referrer' });
    el.addEventListener('error', () => el.replaceWith(generated()), { once: true });
    return el;
  }
  return generated();
}

function releaseTag(rt) {
  return h(`span.rt.rt-${rt || 1}`, RELEASE[rt] || 'Release');
}

function statusChip(p) {
  if (Tasks.busyFor(p.id)) return h('span.chip.chip-accent', icon('spinner', 13, 'spin'), 'Working');
  if (p.status === 'loader-pending') return h('span.chip.chip-warn', 'Finish loader install');
  if (p.status === 'broken') return h('span.chip.chip-danger', 'Needs repair');
  if (p.status === 'installing') return h('span.chip.chip-accent', 'Installing');
  return null;
}

// Strips CurseForge description HTML down to safe, readable markup.
function sanitizeHtml(html) {
  const allowed = new Set(['p', 'br', 'b', 'strong', 'i', 'em', 'u', 's', 'a', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'img', 'blockquote', 'code', 'pre', 'span', 'div', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'hr', 'figure', 'figcaption', 'sup', 'sub', 'details', 'summary', 'center']);
  const doc = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
  const root = doc.body.firstChild;
  const fixUrl = (u) => {
    if (!u) return null;
    try {
      const url = new URL(u, 'https://www.curseforge.com/');
      if (url.hostname.endsWith('curseforge.com') && url.pathname.startsWith('/linkout')) {
        const inner = url.searchParams.get('remoteUrl');
        if (inner) return fixUrl(decodeURIComponent(inner));
      }
      return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
    } catch (e) {
      return null;
    }
  };
  const walk = (node) => {
    for (const child of [...node.childNodes]) {
      if (child.nodeType === 8) { child.remove(); continue; }
      if (child.nodeType !== 1) continue;
      const tag = child.tagName.toLowerCase();
      if (tag === 'iframe') {
        const src = fixUrl(child.getAttribute('src'));
        const link = doc.createElement('a');
        link.className = 'video-link';
        link.textContent = '▶ Open video';
        if (src) link.setAttribute('href', src.replace('youtube.com/embed/', 'youtube.com/watch?v='));
        child.replaceWith(link);
        continue;
      }
      if (!allowed.has(tag)) {
        if (['script', 'style', 'object', 'embed', 'form', 'input', 'button', 'svg', 'video', 'audio', 'noscript'].includes(tag)) child.remove();
        else child.replaceWith(...child.childNodes);
        continue;
      }
      for (const attr of [...child.attributes]) {
        const n = attr.name.toLowerCase();
        if (tag === 'a' && n === 'href') continue;
        if (tag === 'img' && (n === 'src' || n === 'alt' || n === 'width' || n === 'height')) continue;
        if ((tag === 'td' || tag === 'th') && (n === 'colspan' || n === 'rowspan')) continue;
        child.removeAttribute(attr.name);
      }
      if (tag === 'a') {
        const href = fixUrl(child.getAttribute('href'));
        if (href) {
          child.setAttribute('href', href);
          child.setAttribute('target', '_blank');
          child.setAttribute('rel', 'noopener noreferrer');
        } else child.removeAttribute('href');
      }
      if (tag === 'img') {
        const src = fixUrl(child.getAttribute('src'));
        if (src) {
          child.setAttribute('src', src);
          child.setAttribute('loading', 'lazy');
          child.setAttribute('referrerpolicy', 'no-referrer');
        } else child.remove();
      }
      walk(child);
    }
  };
  walk(root);
  return root.innerHTML;
}

function lightbox(src) {
  const el = h('div.lightbox', { onclick: () => el.remove() }, h('img', { src, alt: '' }));
  document.body.appendChild(el);
}

// One project row in search results
function projectRow(mod, { action, context } = {}) {
  const versions = projectVersions(mod);
  const loaders = projectLoaders(mod);
  const row = h('div.proj', {
    onclick: (e) => { if (!e.target.closest('button,a')) go(`#/project/${mod.id}${context ? '?for=' + encodeURIComponent(context) : ''}`); },
    role: 'link',
    tabindex: '0',
    onkeydown: (e) => { if (e.key === 'Enter' && e.target === row) go(`#/project/${mod.id}`); },
  },
  img(modLogo(mod), 'proj-logo'),
  h('div.proj-body',
    h('div.proj-title', h('strong', mod.name), h('span.by', 'by ' + modAuthor(mod))),
    h('div.proj-sum', mod.summary || ''),
    h('div.proj-meta',
      h('span.chip.num', icon('download', 13), fmtNum(mod.downloadCount)),
      h('span.chip', relTime(mod.dateReleased || mod.dateModified)),
      versions[0] ? h('span.chip.mono', versions[0]) : null,
      loaders.slice(0, 2).map((l) => h('span.chip', l)))),
  action ? h('div.proj-act', action) : null);
  return row;
}

function projectTile(mod, context) {
  return h('div.tile', { onclick: () => go(`#/project/${mod.id}${context ? '?for=' + encodeURIComponent(context) : ''}`), role: 'link', tabindex: '0' },
    img(modLogo(mod), '', ''),
    h('div', h('strong', { style: { display: 'block' } }, mod.name), h('span.muted.num', `${fmtNum(mod.downloadCount)} downloads`)));
}

function selectEl(id, options, value, onchange) {
  const sel = h('select.select', { id, onchange: (e) => onchange(e.target.value) },
    options.map((o) => h('option', { value: o.value, selected: String(o.value) === String(value) }, o.label)));
  return sel;
}

function switchEl(id, checked, onchange, label) {
  return h('label.switch', { title: label },
    h('input', { type: 'checkbox', id, checked, 'aria-label': label, onchange: (e) => onchange(e.target.checked) }),
    h('span'));
}

function progressBar(t) {
  const pct = t.steps ? Math.round((t.done / t.steps) * 100) : (t.total ? Math.round((t.received / t.total) * 100) : null);
  return h('div.progress' + (pct === null ? '.indet' : ''), h('i', { style: { width: (pct || 0) + '%' } }));
}

function accountChip() {
  const info = Native.cachedInfo;
  const acc = info && info.account;
  const chip = h('button.account-chip', {
    onclick: async () => {
      if (!Native.available) return go('#/settings');
      try { await Native.call('account.manage'); } catch (e) { toast(e.message, { error: true }); }
    },
    'aria-label': acc ? `Account: ${acc.name}` : 'Sign in',
  },
  h('span.avatar', acc && acc.avatar ? h('img', { src: acc.avatar, alt: '' }) : icon('user', 16)),
  h('span.acc-name', acc ? acc.name : Native.available ? 'Sign in' : 'Web'));
  return chip;
}
