package net.kdt.pojavlaunch.kiln;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Handler;
import android.os.Looper;
import android.webkit.JavascriptInterface;
import android.webkit.WebView;

import androidx.fragment.app.FragmentActivity;

import com.google.gson.JsonElement;
import com.google.gson.JsonObject;
import com.google.gson.JsonParser;

import net.kdt.pojavlaunch.JavaGUILauncherActivity;
import net.kdt.pojavlaunch.LauncherActivity;
import net.kdt.pojavlaunch.PojavProfile;
import net.kdt.pojavlaunch.Tools;
import net.kdt.pojavlaunch.extra.ExtraConstants;
import net.kdt.pojavlaunch.extra.ExtraCore;
import net.kdt.pojavlaunch.modloaders.ForgeUtils;
import net.kdt.pojavlaunch.prefs.LauncherPreferences;
import net.kdt.pojavlaunch.prefs.screens.LauncherPreferenceFragment;
import net.kdt.pojavlaunch.value.MinecraftAccount;
import net.kdt.pojavlaunch.value.launcherprofiles.LauncherProfiles;
import net.kdt.pojavlaunch.value.launcherprofiles.MinecraftProfile;

import org.json.JSONArray;
import org.json.JSONException;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.Enumeration;
import java.util.Iterator;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.zip.ZipEntry;
import java.util.zip.ZipFile;

/**
 * Native side of the Kiln web UI on Android. Mirrors the iOS bridge
 * (ios/Natives/kiln/KilnViewController.m): same method names and results.
 * JS calls KilnAndroid.postMessage(JSON.stringify({id, method, params}));
 * results come back through window.__kilnReply(id, ok, json).
 */
public class KilnBridge {
    public interface Host {
        FragmentActivity activity();
        void reloadProfiles();
        void openProfileEditor();
        void pickFiles(boolean multiple);
    }

    private final Host mHost;
    private final WebView mWebView;
    private final Handler mMain = new Handler(Looper.getMainLooper());
    private final ExecutorService mIo = Executors.newFixedThreadPool(4);
    private int mPendingPickId = -1;

    public KilnBridge(Host host, WebView webView) {
        mHost = host;
        mWebView = webView;
    }

    public void shutdown() {
        mIo.shutdownNow();
    }

    // ---- transport ----

    @JavascriptInterface
    public void postMessage(String json) {
        final int id;
        final String method;
        final JSONObject params;
        try {
            JSONObject msg = new JSONObject(json);
            id = msg.getInt("id");
            method = msg.getString("method");
            params = msg.optJSONObject("params") != null ? msg.optJSONObject("params") : new JSONObject();
        } catch (JSONException e) {
            return;
        }
        if (isUiMethod(method)) {
            mMain.post(() -> run(id, method, params));
        } else {
            mIo.execute(() -> run(id, method, params));
        }
    }

    private void run(int id, String method, JSONObject params) {
        try {
            Object result = dispatch(id, method, params);
            if (result != DEFERRED) reply(id, true, result);
        } catch (Throwable t) {
            reply(id, false, t.getMessage() != null ? t.getMessage() : t.toString());
        }
    }

    private static final Object DEFERRED = new Object();

    private void reply(int id, boolean ok, Object value) {
        String json;
        try {
            json = toJson(value);
        } catch (JSONException e) {
            json = JSONObject.quote(String.valueOf(value));
        }
        final String script = "window.__kilnReply && window.__kilnReply(" + id + "," + ok + "," + JSONObject.quote(json) + ")";
        mMain.post(() -> mWebView.evaluateJavascript(script, null));
    }

    public void emit(String name, JSONObject payload) {
        try {
            JSONObject event = new JSONObject();
            event.put("name", name);
            event.put("payload", payload != null ? payload : new JSONObject());
            final String script = "window.__kilnEvent && window.__kilnEvent(" + event + ")";
            mMain.post(() -> mWebView.evaluateJavascript(script, null));
        } catch (JSONException ignored) {}
    }

    private static String toJson(Object value) throws JSONException {
        if (value == null) return "null";
        if (value instanceof JSONObject || value instanceof JSONArray) return value.toString();
        if (value instanceof JsonElement) return value.toString();
        if (value instanceof String) return JSONObject.quote((String) value);
        if (value instanceof Boolean || value instanceof Number) return JSONObject.wrap(value).toString();
        return JSONObject.quote(value.toString());
    }

    private static boolean isUiMethod(String method) {
        switch (method) {
            case "game.launch":
            case "account.manage":
            case "native.settings":
            case "native.profiles":
            case "native.openURL":
            case "loader.runInstaller":
            case "file.share":
            case "file.pick":
                return true;
            default:
                return false;
        }
    }

    // ---- paths ----

    private static File gameRoot() {
        return new File(Tools.DIR_GAME_NEW);
    }

    private static File resolve(String rel) throws IOException {
        if (rel == null || rel.isEmpty() || rel.startsWith("/") || rel.contains("\\"))
            throw new IOException("Invalid path: " + rel);
        for (String part : rel.split("/")) {
            if (part.equals("..")) throw new IOException("Invalid path: " + rel);
        }
        return new File(gameRoot(), rel);
    }

    private static String sha1(File file) throws IOException {
        try (InputStream in = new FileInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-1");
            byte[] buffer = new byte[65536];
            int read;
            while ((read = in.read(buffer)) > 0) digest.update(buffer, 0, read);
            StringBuilder hex = new StringBuilder();
            for (byte b : digest.digest()) hex.append(String.format("%02x", b));
            return hex.toString();
        } catch (java.security.NoSuchAlgorithmException e) {
            throw new IOException(e);
        }
    }

    private static String readStream(InputStream in) throws IOException {
        ByteArrayOutputStream out = new ByteArrayOutputStream();
        byte[] buffer = new byte[16384];
        int read;
        while ((read = in.read(buffer)) > 0) out.write(buffer, 0, read);
        return new String(out.toByteArray(), StandardCharsets.UTF_8);
    }

    // ---- methods ----

    private Object dispatch(int id, String method, JSONObject p) throws Exception {
        FragmentActivity activity = mHost.activity();
        switch (method) {
            case "info": {
                JSONObject info = new JSONObject();
                info.put("platform", "android");
                info.put("engine", "amethyst");
                info.put("gameRoot", gameRoot().getAbsolutePath());
                info.put("jit", true);
                info.put("ramBytes", Runtime.getRuntime().maxMemory());
                info.put("device", Build.MANUFACTURER + " " + Build.MODEL);
                info.put("osVersion", "Android " + Build.VERSION.RELEASE);
                info.put("curseforgeApiKey", readBundledKey(activity));
                try {
                    info.put("appVersion", activity.getPackageManager().getPackageInfo(activity.getPackageName(), 0).versionName);
                } catch (Exception e) {
                    info.put("appVersion", "");
                }
                MinecraftAccount account = null;
                try { account = PojavProfile.getCurrentProfileContent(activity, null); } catch (Throwable ignored) {}
                if (account != null && account.username != null) {
                    JSONObject acc = new JSONObject();
                    acc.put("name", account.username);
                    acc.put("type", account.isDemo() ? "demo" : (account.isMicrosoft ? "microsoft" : "local"));
                    info.put("account", acc);
                } else {
                    info.put("account", JSONObject.NULL);
                }
                return info;
            }
            case "http": return http(p);
            case "download": return download(p);
            case "fs.list": {
                String rel = p.optString("path", "");
                File dir = rel.isEmpty() ? gameRoot() : resolve(rel);
                JSONArray out = new JSONArray();
                File[] files = dir.listFiles();
                if (files != null) {
                    for (File f : files) {
                        JSONObject e = new JSONObject();
                        e.put("name", f.getName());
                        e.put("dir", f.isDirectory());
                        e.put("size", f.length());
                        e.put("mtime", f.lastModified());
                        out.put(e);
                    }
                }
                return out;
            }
            case "fs.readText": {
                File f = resolve(p.getString("path"));
                if (!f.isFile()) return null;
                try (InputStream in = new FileInputStream(f)) { return readStream(in); }
            }
            case "fs.writeText": {
                File f = resolve(p.getString("path"));
                File parent = f.getParentFile();
                if (parent != null) parent.mkdirs();
                File tmp = new File(f.getAbsolutePath() + ".tmp");
                try (OutputStream out = new FileOutputStream(tmp)) {
                    out.write(p.optString("text", "").getBytes(StandardCharsets.UTF_8));
                }
                if (!tmp.renameTo(f)) {
                    f.delete();
                    if (!tmp.renameTo(f)) throw new IOException("Could not write " + f.getName());
                }
                return true;
            }
            case "fs.writeBase64": {
                File f = resolve(p.getString("path"));
                File parent = f.getParentFile();
                if (parent != null) parent.mkdirs();
                byte[] data = android.util.Base64.decode(p.optString("data", ""), android.util.Base64.DEFAULT);
                try (OutputStream out = new FileOutputStream(f)) { out.write(data); }
                JSONObject r = new JSONObject();
                r.put("size", data.length);
                return r;
            }
            case "fs.delete": {
                deleteRecursive(resolve(p.getString("path")));
                return true;
            }
            case "fs.rename": {
                File from = resolve(p.getString("from"));
                File to = resolve(p.getString("to"));
                File parent = to.getParentFile();
                if (parent != null) parent.mkdirs();
                deleteRecursive(to);
                if (!from.renameTo(to)) throw new IOException("Could not move " + from.getName());
                return true;
            }
            case "fs.copy": {
                File from = resolve(p.getString("from"));
                File to = resolve(p.getString("to"));
                File parent = to.getParentFile();
                if (parent != null) parent.mkdirs();
                try (InputStream in = new FileInputStream(from); OutputStream out = new FileOutputStream(to)) {
                    copy(in, out, null);
                }
                return true;
            }
            case "fs.exists": {
                File f = resolve(p.getString("path"));
                JSONObject r = new JSONObject();
                r.put("exists", f.exists());
                r.put("dir", f.isDirectory());
                return r;
            }
            case "fs.mkdir": {
                resolve(p.getString("path")).mkdirs();
                return true;
            }
            case "fs.sha1": {
                File f = resolve(p.getString("path"));
                return f.isFile() ? sha1(f) : null;
            }
            case "zip.readText": {
                try (ZipFile zip = new ZipFile(resolve(p.getString("path")))) {
                    ZipEntry entry = zip.getEntry(p.getString("entry"));
                    if (entry == null) return null;
                    try (InputStream in = zip.getInputStream(entry)) { return readStream(in); }
                }
            }
            case "zip.list": {
                JSONArray out = new JSONArray();
                try (ZipFile zip = new ZipFile(resolve(p.getString("path")))) {
                    Enumeration<? extends ZipEntry> entries = zip.entries();
                    while (entries.hasMoreElements()) out.put(entries.nextElement().getName());
                }
                return out;
            }
            case "zip.extract": return extract(p);
            case "profiles.list": return listProfiles();
            case "profiles.save": return saveProfile(p);
            case "profiles.delete": {
                LauncherProfiles.load();
                LauncherProfiles.mainProfileJson.profiles.remove(p.getString("key"));
                LauncherProfiles.write();
                mMain.post(mHost::reloadProfiles);
                return true;
            }
            case "profiles.select": {
                selectProfile(p.getString("key"));
                return true;
            }
            case "game.launch": {
                String key = p.getString("key");
                LauncherProfiles.load();
                if (!LauncherProfiles.mainProfileJson.profiles.containsKey(key)) throw new IOException("Profile not found");
                selectProfile(key);
                ExtraCore.setValue(ExtraConstants.LAUNCH_GAME, true);
                JSONObject r = new JSONObject();
                r.put("started", true);
                return r;
            }
            case "account.manage":
                ExtraCore.setValue(ExtraConstants.SELECT_AUTH_METHOD, true);
                return true;
            case "native.settings":
                Tools.swapFragment(activity, LauncherPreferenceFragment.class, LauncherActivity.SETTING_FRAGMENT_TAG, null);
                return true;
            case "native.profiles":
                mHost.openProfileEditor();
                return true;
            case "native.openURL": {
                String url = p.getString("url");
                if (!url.startsWith("https://") && !url.startsWith("http://")) throw new IOException("Only http(s) links can be opened");
                Tools.openURL(activity, url);
                return true;
            }
            case "loader.runInstaller": {
                File jar = resolve(p.getString("path"));
                if (!jar.isFile()) throw new IOException("Installer not found");
                Intent intent = new Intent(activity, JavaGUILauncherActivity.class);
                if ("neoforge".equals(p.optString("type"))) {
                    intent.putExtra("javaArgs", "-jar " + jar.getAbsolutePath() + " --install-client")
                          .putExtra("openLogOutput", true);
                } else {
                    ForgeUtils.addAutoInstallArgs(intent, jar, true);
                }
                activity.startActivity(intent);
                JSONObject r = new JSONObject();
                r.put("started", true);
                r.put("restartRequired", false);
                return r;
            }
            case "file.share": {
                Tools.openPath(activity, resolve(p.getString("path")), true);
                return true;
            }
            case "file.pick": {
                if (mPendingPickId >= 0) reply(mPendingPickId, true, new JSONArray());
                mPendingPickId = id;
                mHost.pickFiles(p.optBoolean("multiple", false));
                return DEFERRED;
            }
            default:
                throw new IOException("Unknown method " + method);
        }
    }

    private static String readBundledKey(Activity activity) {
        try (InputStream in = activity.getAssets().open("kiln/kiln-config.json")) {
            return new JSONObject(readStream(in)).optString("curseforgeApiKey", "");
        } catch (Exception e) {
            return "";
        }
    }

    private void selectProfile(String key) {
        LauncherPreferences.DEFAULT_PREF.edit().putString(LauncherPreferences.PREF_KEY_CURRENT_PROFILE, key).commit();
        mMain.post(mHost::reloadProfiles);
    }

    private JSONObject listProfiles() throws JSONException {
        LauncherProfiles.load();
        JSONObject profiles = new JSONObject(Tools.GLOBAL_GSON.toJson(LauncherProfiles.mainProfileJson.profiles));
        JSONObject r = new JSONObject();
        r.put("profiles", profiles);
        r.put("selected", LauncherPreferences.DEFAULT_PREF.getString(LauncherPreferences.PREF_KEY_CURRENT_PROFILE, ""));
        return r;
    }

    private JSONObject saveProfile(JSONObject p) throws JSONException, IOException {
        String key = p.getString("key");
        JSONObject patch = p.getJSONObject("profile");
        LauncherProfiles.load();
        Map<String, MinecraftProfile> profiles = LauncherProfiles.mainProfileJson.profiles;
        MinecraftProfile existing = profiles.get(key);
        JsonObject merged = existing != null
                ? Tools.GLOBAL_GSON.toJsonTree(existing).getAsJsonObject()
                : new JsonObject();
        JsonObject patchTree = JsonParser.parseString(patch.toString()).getAsJsonObject();
        for (Map.Entry<String, JsonElement> e : patchTree.entrySet()) merged.add(e.getKey(), e.getValue());
        String instanceDir = p.optString("instanceDir", "");
        if (!instanceDir.isEmpty()) {
            if (instanceDir.contains("..")) throw new IOException("Invalid instance folder");
            // gameDir is resolved against DIR_GAME_HOME; the game root is DIR_GAME_HOME/.minecraft
            merged.addProperty("gameDir", Tools.LAUNCHERPROFILES_RTPREFIX + ".minecraft/" + instanceDir);
        }
        if (!merged.has("name")) merged.addProperty("name", key);
        MinecraftProfile profile = Tools.GLOBAL_GSON.fromJson(merged, MinecraftProfile.class);
        profiles.put(key, profile);
        LauncherProfiles.write();
        if (p.optBoolean("select", false)) selectProfile(key);
        else mMain.post(mHost::reloadProfiles);
        return new JSONObject(Tools.GLOBAL_GSON.toJson(profile));
    }

    private JSONObject http(JSONObject p) throws Exception {
        URL url = new URL(p.getString("url"));
        if (!url.getProtocol().startsWith("http")) throw new IOException("http needs an http(s) url");
        HttpURLConnection conn = (HttpURLConnection) url.openConnection();
        conn.setConnectTimeout(20000);
        conn.setReadTimeout(45000);
        conn.setRequestMethod(p.optString("method", "GET"));
        JSONObject headers = p.optJSONObject("headers");
        if (headers != null) {
            Iterator<String> keys = headers.keys();
            while (keys.hasNext()) {
                String k = keys.next();
                conn.setRequestProperty(k, headers.optString(k));
            }
        }
        if (p.has("body") && !p.isNull("body")) {
            conn.setDoOutput(true);
            try (OutputStream out = conn.getOutputStream()) {
                out.write(p.getString("body").getBytes(StandardCharsets.UTF_8));
            }
        }
        int status = conn.getResponseCode();
        InputStream in = status >= 400 ? conn.getErrorStream() : conn.getInputStream();
        String body = in != null ? readStream(in) : "";
        JSONObject outHeaders = new JSONObject();
        for (Map.Entry<String, List<String>> h : conn.getHeaderFields().entrySet()) {
            if (h.getKey() != null && !h.getValue().isEmpty()) outHeaders.put(h.getKey(), h.getValue().get(0));
        }
        conn.disconnect();
        JSONObject r = new JSONObject();
        r.put("status", status);
        r.put("body", body);
        r.put("headers", outHeaders);
        return r;
    }

    private interface Progress { void update(long received); }

    private static long copy(InputStream in, OutputStream out, Progress progress) throws IOException {
        byte[] buffer = new byte[65536];
        long total = 0;
        int read;
        while ((read = in.read(buffer)) > 0) {
            out.write(buffer, 0, read);
            total += read;
            if (progress != null) progress.update(total);
        }
        return total;
    }

    private JSONObject download(JSONObject p) throws Exception {
        final String taskId = p.optString("taskId", String.valueOf(System.nanoTime()));
        String relPath = p.getString("path");
        File dest = resolve(relPath);
        String expected = p.optString("sha1", "").toLowerCase();
        if (!expected.isEmpty() && dest.isFile() && expected.equals(sha1(dest))) {
            JSONObject r = new JSONObject();
            r.put("path", relPath);
            r.put("size", dest.length());
            r.put("cached", true);
            return r;
        }
        File parent = dest.getParentFile();
        if (parent != null) parent.mkdirs();
        File part = new File(dest.getAbsolutePath() + ".part");
        URL url = new URL(p.getString("url"));
        HttpURLConnection conn = null;
        for (int redirects = 0; redirects < 6; redirects++) {
            conn = (HttpURLConnection) url.openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(20000);
            conn.setReadTimeout(60000);
            conn.setRequestProperty("User-Agent", "Kiln/1.0 (Amethyst Android)");
            int code = conn.getResponseCode();
            if (code >= 300 && code < 400 && conn.getHeaderField("Location") != null) {
                url = new URL(url, conn.getHeaderField("Location"));
                conn.disconnect();
                continue;
            }
            if (code < 200 || code >= 300) {
                conn.disconnect();
                throw new IOException("HTTP " + code + " for " + dest.getName());
            }
            break;
        }
        if (conn == null) throw new IOException("Too many redirects");
        long length = 0;
        try {
            String header = conn.getHeaderField("Content-Length");
            if (header != null) length = Long.parseLong(header.trim());
        } catch (NumberFormatException ignored) {}
        final long total = Math.max(0, length);
        final long[] lastEmit = {0};
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(part)) {
            copy(in, out, received -> {
                long now = System.currentTimeMillis();
                if (now - lastEmit[0] < 250) return;
                lastEmit[0] = now;
                try {
                    JSONObject ev = new JSONObject();
                    ev.put("taskId", taskId);
                    ev.put("received", received);
                    ev.put("total", total);
                    emit("download.progress", ev);
                } catch (JSONException ignored) {}
            });
        } finally {
            conn.disconnect();
        }
        if (!expected.isEmpty() && !expected.equals(sha1(part))) {
            part.delete();
            throw new IOException("Checksum mismatch for " + dest.getName());
        }
        dest.delete();
        if (!part.renameTo(dest)) throw new IOException("Could not save " + dest.getName());
        JSONObject done = new JSONObject();
        done.put("taskId", taskId);
        done.put("received", dest.length());
        done.put("total", dest.length());
        done.put("done", true);
        emit("download.progress", done);
        JSONObject r = new JSONObject();
        r.put("path", relPath);
        r.put("size", dest.length());
        return r;
    }

    private Object extract(JSONObject p) throws Exception {
        File zipFile = resolve(p.getString("path"));
        File dest = resolve(p.getString("dest"));
        String prefix = p.optString("prefix", "");
        while (prefix.endsWith("/")) prefix = prefix.substring(0, prefix.length() - 1);
        String destCanonical = dest.getCanonicalPath();
        int count = 0;
        try (ZipFile zip = new ZipFile(zipFile)) {
            Enumeration<? extends ZipEntry> entries = zip.entries();
            while (entries.hasMoreElements()) {
                ZipEntry entry = entries.nextElement();
                String name = entry.getName();
                if (!prefix.isEmpty()) {
                    if (!name.startsWith(prefix + "/") || name.length() <= prefix.length() + 1) continue;
                    name = name.substring(prefix.length() + 1);
                }
                File out = new File(dest, name);
                if (!out.getCanonicalPath().startsWith(destCanonical)) continue; // zip slip
                if (entry.isDirectory()) {
                    out.mkdirs();
                    continue;
                }
                File parent = out.getParentFile();
                if (parent != null) parent.mkdirs();
                try (InputStream in = zip.getInputStream(entry); OutputStream o = new FileOutputStream(out)) {
                    copy(in, o, null);
                }
                count++;
            }
        }
        JSONObject r = new JSONObject();
        r.put("count", count);
        return r;
    }

    private static void deleteRecursive(File f) {
        if (f.isDirectory()) {
            File[] children = f.listFiles();
            if (children != null) for (File c : children) deleteRecursive(c);
        }
        f.delete();
    }

    /** Called by the fragment after the system file picker returns. */
    public void onFilesPicked(List<Uri> uris) {
        final int id = mPendingPickId;
        mPendingPickId = -1;
        if (id < 0) return;
        mIo.execute(() -> {
            JSONArray out = new JSONArray();
            File importDir = new File(gameRoot(), "kiln/_import");
            importDir.mkdirs();
            for (Uri uri : uris) {
                try {
                    String name = Tools.getFileName(mHost.activity(), uri);
                    if (name == null || name.isEmpty()) name = "import-" + System.currentTimeMillis() + ".zip";
                    name = name.replace('/', '_');
                    File dest = new File(importDir, name);
                    try (InputStream in = mHost.activity().getContentResolver().openInputStream(uri);
                         OutputStream o = new FileOutputStream(dest)) {
                        if (in == null) continue;
                        copy(in, o, null);
                    }
                    JSONObject e = new JSONObject();
                    e.put("path", "kiln/_import/" + name);
                    e.put("name", name);
                    e.put("size", dest.length());
                    out.put(e);
                } catch (Exception ignored) {}
            }
            reply(id, true, out);
        });
    }
}
