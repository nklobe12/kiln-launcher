# What rea found in CurseForge, and how Kiln maps to it

Target: the CurseForge Windows app from `curseforge_remastered.zip`. Its `resources/app.asar` declares itself as `CurseForge 1.324.0-41180` and runs on Electron 42.11.4 (Overwolf's ow-electron).

Tool: [rea](https://github.com/morluto/rea) 6.7.0, using `analyze-javascript-application` on `app.asar` with `integrity_policy=record-and-continue`. The native helpers in `app.asar.unpacked` are signed after packing, so their ASAR integrity hashes don't match. rea reported this, and the policy records those files as untrusted instead of stopping. npm wasn't reachable from the analysis machine, so rea and its dependencies were built from their GitHub sources and run under Node 22.

## Application graph (from rea)

| Fact | Value |
|---|---|
| Main process | `dist/background/background.js` (package.json `main`) |
| Renderer windows | `dist/desktop/desktop.html` (main UI), `dist/background/background.html`, `dist/game-dashboard/game-dashboard.html` |
| Preload | `dist/preload/preload.js`, one contextBridge API (`__SENTRY_IPC__`) |
| IPC | 11 operations; renderer→main calls are `ipcRenderer.invoke(`${service}.${method}`)` and listeners `${service}.addListener` |
| Parsed | 42 files, 8 JS bundles, 2.2M AST nodes, 261 findings, 0 parse failures |
| Storage | localStorage and sessionStorage in the renderer |
| Source maps | Referenced (`../source-map/*.js.map`) but not shipped |

**UI routes** (React Router paths rea recovered): `/home`, `game/:gameId`, `:gameInstanceId`, `project/:projectId` with `overview / changelog / comments / gallery / versions`, `browse`, `discover`, `my-modpacks`, `my-addons`, `my-servers`, `my-library/*`, `add-content/:modpackId`, `server-list`, `server/:serverId`, `user/:userId`, `download-manager`, `logs`, `skins`, `settings/:section` with `general / advanced / languages / privacy / themes / subscription`.

**Backend services** (`AppService` names behind the IPC proxy): ProjectVersions, ProjectComments, InstallModData, GameAuth, GamePrerequisites, ServerHealth, UserProfile, UserActivity, UserMeasurement, Analytics, Ads.

**Network endpoints**: `https://api.curseforge.com` (public CurseForge API); Minecraft auth through Microsoft device-code/PKCE → `user.auth.xboxlive.com` → `xsts.auth.xboxlive.com` → `api.minecraftservices.com/authentication/login_with_xbox`, with entitlements, profile, skins and capes; game files from `launchermeta.mojang.com`, `libraries.minecraft.net` and `resources.download.minecraft.net`.

**Settings** (from the bundled English strings): Minecraft modding folder, game resolution, launcher behavior after start, Java memory (with "recommended by author"), extra JVM arguments, environment variables, Java versions, and the Forge debug log.

## How Kiln recreates it

| CurseForge | Kiln |
|---|---|
| Electron renderer (React 19) | One HTML/JS UI (`web/`) running in WKWebView (iOS), Android WebView, or a browser |
| `${service}.${method}` IPC to the main process | `window.webkit.messageHandlers.kiln` / `KilnAndroid` bridge with named methods (`fs.*`, `zip.*`, `profiles.*`, `game.launch`…) |
| Home / game / browse / discover | Home, Browse (class tabs, version, loader, category, sort), Choose a game |
| `project/:projectId` + tabs | Project page: About, Files, Changelog, Gallery, Dependencies |
| `my-modpacks`, `:gameInstanceId`, `add-content/:modpackId` | Profiles list, profile page (content list with on/off, lock, remove, updates), "Add content" mode in Browse |
| InstallModData / ProjectVersions | Install engine: best-file selection by game version + loader + release channel, required dependencies, incompatibility warnings, update check that stays on the same release channel |
| Modpack install / import / export | CurseForge `manifest.json` packs: download, resolve files in batches, apply `overrides/`, set recommended RAM; import a zip; export a CurseForge zip |
| `download-manager` (In progress / Completed) | Downloads page with the same two tabs |
| `logs` | Activity log |
| GameAuth (Microsoft → Xbox → Minecraft) and the CurseForge launcher | Amethyst's Microsoft sign-in and launcher, started from Kiln's Play button |
| Settings sections | CurseForge key, release channels, dependencies, memory, launcher settings, theme |

Left out on purpose: ads, analytics/Sentry, Overwolf subscription perks, server hosting, comments (not in the public API), and CurseForge's own branding and embedded API key.
