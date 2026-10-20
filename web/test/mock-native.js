// Stand-in for the iOS/Android bridge so the UI can be tested in Chromium.
// Injected before the page loads; PLATFORM is replaced by the runner.
(() => {
  const PLATFORM = '__PLATFORM__';
  const files = new Map(); // path -> { b64, text }
  const dirs = new Set();
  const calls = [];
  const launcher = { profiles: {}, selected: null };
  window.__native = { files, dirs, calls, launcher, pick: [] };

  const enc = new TextEncoder();
  const dec = new TextDecoder();
  const toB64 = (bytes) => { let s = ''; bytes.forEach((b) => { s += String.fromCharCode(b); }); return btoa(s); };
  const fromB64 = (b64) => Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  const bytesOf = (e) => (e.text != null ? enc.encode(e.text) : fromB64(e.b64 || ''));
  const parentsOf = (p) => { const parts = p.split('/'); for (let i = 1; i < parts.length; i++) dirs.add(parts.slice(0, i).join('/')); };
  const put = (path, entry) => { files.set(path, entry); parentsOf(path); };
  const under = (path) => (k) => k === path || k.startsWith(path + '/');
  const check = (p) => { if (!p || p.startsWith('/') || p.split('/').includes('..')) throw new Error('Invalid path: ' + p); return p; };

  function readZip(bytes) {
    const view = new DataView(bytes.buffer);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= 0; i--) if (view.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    if (eocd < 0) throw new Error('Not a zip');
    const count = view.getUint16(eocd + 10, true);
    let p = view.getUint32(eocd + 16, true);
    const out = new Map();
    for (let i = 0; i < count; i++) {
      const csize = view.getUint32(p + 20, true);
      const nlen = view.getUint16(p + 28, true);
      const xlen = view.getUint16(p + 30, true);
      const clen = view.getUint16(p + 32, true);
      const lho = view.getUint32(p + 42, true);
      const name = dec.decode(bytes.subarray(p + 46, p + 46 + nlen));
      const lnlen = view.getUint16(lho + 26, true);
      const lxlen = view.getUint16(lho + 28, true);
      const start = lho + 30 + lnlen + lxlen;
      out.set(name, bytes.slice(start, start + csize));
      p += 46 + nlen + xlen + clen;
    }
    return out;
  }

  async function handle(method, params = {}) {
    calls.push({ method, params: JSON.parse(JSON.stringify(params)) });
    await new Promise((r) => setTimeout(r, 5));
    switch (method) {
      case 'info':
        return {
          platform: PLATFORM, engine: 'amethyst', appVersion: '1.0 (test)', gameRoot: PLATFORM === 'ios' ? '/var/mobile/Containers/Data/Application/KILN/Library/Application Support/minecraft' : '/storage/emulated/0/Android/data/com.nklobe.kiln/files/.minecraft',
          jit: false, txm: PLATFORM === 'ios', ios26: PLATFORM === 'ios', account: window.__noAccount ? null : { name: 'Klobe', type: 'microsoft', avatar: '' },
          ramBytes: 12 * 1073741824, curseforgeApiKey: '', device: PLATFORM === 'ios' ? 'iPhone' : 'Google Pixel 9', osVersion: PLATFORM === 'ios' ? '26.0' : 'Android 16',
        };
      case 'http': {
        const r = await window.__kilnFixture({ url: params.url, method: params.method || 'GET', headers: params.headers || {}, body: params.body || null });
        return { status: r.status, body: r.text, headers: {} };
      }
      case 'download': {
        check(params.path);
        const r = await window.__kilnFixture({ url: params.url, method: 'GET', headers: {} });
        if (r.status !== 200) throw new Error(`HTTP ${r.status} for ${params.url.split('/').pop()}`);
        window.__kilnEvent({ name: 'download.progress', payload: { taskId: params.taskId, received: Math.floor(r.size / 2), total: r.size } });
        put(params.path, { b64: r.b64 });
        window.__kilnEvent({ name: 'download.progress', payload: { taskId: params.taskId, received: r.size, total: r.size, done: true } });
        return { path: params.path, size: r.size };
      }
      case 'fs.list': {
        const base = params.path || '';
        const names = new Map();
        const pre = base ? base + '/' : '';
        for (const k of [...files.keys(), ...dirs]) {
          if (!k.startsWith(pre) || k === base) continue;
          const rest = k.slice(pre.length);
          const name = rest.split('/')[0];
          const isDir = rest.includes('/') || dirs.has(pre + name);
          if (!names.has(name) || isDir) names.set(name, isDir);
        }
        return [...names].map(([name, dir]) => ({ name, dir, size: dir ? 0 : bytesOf(files.get(pre + name) || {}).length, mtime: Date.now() }));
      }
      case 'fs.readText': { const e = files.get(check(params.path)); return e ? dec.decode(bytesOf(e)) : null; }
      case 'fs.writeText': put(check(params.path), { text: params.text || '' }); return true;
      case 'fs.writeBase64': put(check(params.path), { b64: params.data || '' }); return { size: fromB64(params.data || '').length };
      case 'fs.delete': {
        const m = under(check(params.path));
        [...files.keys()].filter(m).forEach((k) => files.delete(k));
        [...dirs].filter(m).forEach((k) => dirs.delete(k));
        return true;
      }
      case 'fs.rename': case 'fs.copy': {
        const from = check(params.from);
        const to = check(params.to);
        const keys = [...files.keys()].filter(under(from));
        if (!keys.length) throw new Error('No such file: ' + from);
        for (const k of keys) {
          put(to + k.slice(from.length), files.get(k));
          if (method === 'fs.rename') files.delete(k);
        }
        return true;
      }
      case 'fs.exists': {
        const p = check(params.path);
        const isFile = files.has(p);
        const isDir = dirs.has(p) || [...files.keys()].some((k) => k.startsWith(p + '/'));
        return { exists: isFile || isDir, dir: isDir };
      }
      case 'fs.mkdir': dirs.add(check(params.path)); parentsOf(params.path + '/x'); return true;
      case 'fs.sha1': return null;
      case 'zip.readText': {
        const e = files.get(check(params.path));
        if (!e) throw new Error('No zip at ' + params.path);
        const z = readZip(bytesOf(e));
        const b = z.get(params.entry);
        return b ? dec.decode(b) : null;
      }
      case 'zip.list': return [...readZip(bytesOf(files.get(check(params.path)))).keys()];
      case 'zip.extract': {
        const z = readZip(bytesOf(files.get(check(params.path))));
        const prefix = (params.prefix || '').replace(/\/+$/, '');
        let count = 0;
        for (const [name, data] of z) {
          if (prefix && !name.startsWith(prefix + '/')) continue;
          const rel = prefix ? name.slice(prefix.length + 1) : name;
          if (!rel || rel.endsWith('/')) continue;
          put(check(params.dest) + '/' + rel, { b64: toB64(data) });
          count++;
        }
        return { count };
      }
      case 'profiles.list': return { profiles: launcher.profiles, selected: launcher.selected };
      case 'profiles.save': {
        const merged = { ...(launcher.profiles[params.key] || {}), ...params.profile };
        if (params.instanceDir) merged.gameDir = './' + params.instanceDir;
        launcher.profiles[params.key] = merged;
        if (params.select) launcher.selected = params.key;
        return merged;
      }
      case 'profiles.delete': delete launcher.profiles[params.key]; return true;
      case 'profiles.select': launcher.selected = params.key; return true;
      case 'game.launch':
        if (!launcher.profiles[params.key]) throw new Error('Profile not found');
        launcher.selected = params.key;
        return { started: true };
      case 'loader.runInstaller':
        if (!files.has(check(params.path))) throw new Error('Installer not found');
        return { started: true, restartRequired: PLATFORM === 'ios' };
      case 'account.manage': case 'native.settings': case 'native.profiles': case 'native.openURL': case 'file.share':
        return true;
      case 'file.pick': return window.__native.pick;
      default:
        throw new Error('Unknown method ' + method);
    }
  }

  if (PLATFORM === 'ios') {
    window.webkit = { messageHandlers: { kiln: { postMessage: (m) => handle(m.method, m.params) } } };
  } else if (PLATFORM === 'android') {
    window.KilnAndroid = {
      postMessage(json) {
        const m = JSON.parse(json);
        handle(m.method, m.params).then(
          (v) => window.__kilnReply(m.id, true, JSON.stringify(v === undefined ? null : v)),
          (e) => window.__kilnReply(m.id, false, JSON.stringify(e.message || String(e))),
        );
      },
    };
  }
})();
