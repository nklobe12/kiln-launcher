// DOM builder: h('div.card#id', {onclick, class, style, ...}, children...)
function h(tag, props, ...children) {
  let name = tag;
  let id = null;
  const classes = [];
  const m = /^([a-z0-9-]*)((?:[.#][\w-]+)*)$/i.exec(tag);
  if (m) {
    name = m[1] || 'div';
    (m[2].match(/[.#][\w-]+/g) || []).forEach((p) => (p[0] === '.' ? classes.push(p.slice(1)) : (id = p.slice(1))));
  }
  const el = name === 'svg' || name === 'path' || name === 'rect' || name === 'g' ? document.createElementNS('http://www.w3.org/2000/svg', name) : document.createElement(name);
  if (id) el.id = id;
  if (classes.length) el.setAttribute('class', classes.join(' '));
  if (props && (typeof props !== 'object' || props instanceof Node || Array.isArray(props))) {
    children.unshift(props);
    props = null;
  }
  if (props) {
    for (const [k, v] of Object.entries(props)) {
      if (v == null || v === false) continue;
      if (k === 'class') el.setAttribute('class', [el.getAttribute('class'), v].filter(Boolean).join(' '));
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
      else if (k === 'html') el.innerHTML = v;
      else if (k === 'value') el.value = v;
      else if (k === 'checked') el.checked = !!v;
      else if (k === 'dataset') Object.assign(el.dataset, v);
      else if (v === true) el.setAttribute(k, '');
      else el.setAttribute(k, String(v));
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c == null || c === false || c === true) continue;
    el.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
}

function frag(...children) {
  const f = document.createDocumentFragment();
  appendChildren(f, children);
  return f;
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

const $ = (sel, root = document) => root.querySelector(sel);

function fmtNum(n) {
  n = Number(n) || 0;
  if (n >= 1e9) return (n / 1e9).toFixed(1).replace(/\.0$/, '') + 'B';
  if (n >= 1e6) return (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1e3) return (n / 1e3).toFixed(1).replace(/\.0$/, '') + 'K';
  return String(n);
}

function fmtBytes(n) {
  n = Number(n) || 0;
  if (n >= 1073741824) return (n / 1073741824).toFixed(2) + ' GB';
  if (n >= 1048576) return (n / 1048576).toFixed(1) + ' MB';
  if (n >= 1024) return Math.round(n / 1024) + ' KB';
  return n + ' B';
}

function relTime(date) {
  const t = typeof date === 'number' ? date : Date.parse(date);
  if (!t) return '';
  const s = Math.round((Date.now() - t) / 1000);
  if (s < 60) return 'just now';
  const units = [['year', 31536000], ['month', 2592000], ['week', 604800], ['day', 86400], ['hour', 3600], ['minute', 60]];
  for (const [u, sec] of units) {
    const v = Math.floor(s / sec);
    if (v >= 1) return `${v} ${u}${v > 1 ? 's' : ''} ago`;
  }
  return 'just now';
}

function fmtDate(date) {
  const t = Date.parse(date);
  if (!t) return '';
  return new Date(t).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function slugify(s) {
  return String(s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'profile';
}

function uid() {
  return Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function debounce(fn, ms) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

// Run async tasks with limited concurrency
async function pool(items, limit, worker) {
  const results = new Array(items.length);
  let next = 0;
  async function lane() {
    while (next < items.length) {
      const i = next++;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, lane));
  return results;
}

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

// Compare Minecraft-ish versions: "1.20.1" > "1.20"; non-numeric parts sort last
function cmpVersion(a, b) {
  const pa = String(a).split(/[.\-+]/);
  const pb = String(b).split(/[.\-+]/);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return -1;
    if (y === undefined) return 1;
    const nx = /^\d+$/.test(x) ? Number(x) : NaN;
    const ny = /^\d+$/.test(y) ? Number(y) : NaN;
    if (!isNaN(nx) && !isNaN(ny)) {
      if (nx !== ny) return nx - ny;
    } else if (x !== y) {
      return isNaN(nx) ? -1 : 1;
    }
  }
  return 0;
}

// Tiny event bus
const bus = {
  map: new Map(),
  on(name, fn) {
    if (!this.map.has(name)) this.map.set(name, new Set());
    this.map.get(name).add(fn);
    return () => this.map.get(name).delete(fn);
  },
  emit(name, data) {
    (this.map.get(name) || []).forEach((fn) => {
      try { fn(data); } catch (e) { console.error(e); }
    });
  },
};

// Activity log shown on the Logs page
const LOG = [];
function log(level, ...parts) {
  const msg = parts.map((p) => (p instanceof Error ? p.message : typeof p === 'object' ? JSON.stringify(p) : String(p))).join(' ');
  LOG.push({ t: Date.now(), level, msg });
  if (LOG.length > 600) LOG.splice(0, LOG.length - 600);
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)('[kiln]', msg);
  bus.emit('log');
}

const storage = {
  get(key, fallback) {
    try {
      const v = localStorage.getItem('kiln.' + key);
      return v == null ? fallback : JSON.parse(v);
    } catch (e) {
      return fallback;
    }
  },
  set(key, value) {
    try { localStorage.setItem('kiln.' + key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  },
  remove(key) {
    try { localStorage.removeItem('kiln.' + key); } catch (e) { /* ignore */ }
  },
};

function b64FromBytes(bytes) {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  return btoa(s);
}

function initials(name) {
  const words = String(name || '?').trim().split(/\s+/).filter(Boolean);
  return ((words[0] || '?')[0] + (words[1] ? words[1][0] : '')).toUpperCase();
}

// Stable glaze color from a string (for generated profile icons)
function glazeFor(text) {
  let hsh = 0;
  for (const ch of String(text)) hsh = (hsh * 31 + ch.charCodeAt(0)) >>> 0;
  const hues = [158, 172, 34, 18, 205, 268, 330, 48];
  const hue = hues[hsh % hues.length];
  return `linear-gradient(150deg, hsl(${hue} 55% 62%), hsl(${(hue + 20) % 360} 45% 38%))`;
}
