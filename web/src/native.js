// Bridge to the native launcher (Amethyst engine) on iOS and Android.
// In a plain browser there is no bridge: Kiln still browses and manages
// profiles, but launching and writing game files need the app.
const Native = (() => {
  const ios = window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.kiln;
  const android = window.KilnAndroid;
  const pending = new Map();
  let seq = 0;
  let info = null;

  window.__kilnReply = (id, ok, json) => {
    const p = pending.get(id);
    if (!p) return;
    pending.delete(id);
    let value = null;
    try { value = JSON.parse(json); } catch (e) { value = json; }
    ok ? p.resolve(value) : p.reject(new Error(typeof value === 'string' ? value : 'Native call failed'));
  };
  window.__kilnEvent = (event) => {
    if (event && event.name) bus.emit('native:' + event.name, event.payload || {});
  };

  async function call(method, params = {}) {
    if (ios) {
      try {
        return await ios.postMessage({ method, params });
      } catch (e) {
        throw new Error(e && e.message ? e.message : String(e));
      }
    }
    if (android) {
      const id = ++seq;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        android.postMessage(JSON.stringify({ id, method, params }));
      });
    }
    throw new Error('This needs the Kiln app');
  }

  return {
    available: !!(ios || android),
    platform: ios ? 'ios' : android ? 'android' : 'web',
    call,
    async info(refresh = false) {
      if (!this.available) return null;
      if (!info || refresh) {
        try { info = await call('info'); } catch (e) { log('warn', 'native info failed', e); info = null; }
      }
      return info;
    },
    get cachedInfo() { return info; },
  };
})();

// File helpers on top of the bridge; paths are relative to the game folder.
const FS = {
  list: (path) => Native.call('fs.list', { path }),
  readText: (path) => Native.call('fs.readText', { path }),
  writeText: (path, text) => Native.call('fs.writeText', { path, text }),
  writeBase64: (path, data) => Native.call('fs.writeBase64', { path, data }),
  remove: (path) => Native.call('fs.delete', { path }),
  rename: (from, to) => Native.call('fs.rename', { from, to }),
  copy: (from, to) => Native.call('fs.copy', { from, to }),
  mkdir: (path) => Native.call('fs.mkdir', { path }),
  async exists(path) {
    const r = await Native.call('fs.exists', { path });
    return !!(r && r.exists);
  },
  async readJSON(path) {
    const text = await this.readText(path);
    if (!text) return null;
    try { return JSON.parse(text); } catch (e) { return null; }
  },
  writeJSON(path, value) {
    return this.writeText(path, JSON.stringify(value, null, 2));
  },
};

// HTTP that bypasses CORS when the app is present
async function httpRequest(url, { method = 'GET', headers = {}, body = null } = {}) {
  if (Native.available) {
    const r = await Native.call('http', { url, method, headers, body });
    return { status: r.status, text: r.body, headers: r.headers || {} };
  }
  const res = await fetch(url, { method, headers, body });
  return { status: res.status, text: await res.text(), headers: Object.fromEntries(res.headers.entries()) };
}
