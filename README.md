# Kiln

Kiln is a CurseForge-style mod manager that also **launches Minecraft: Java Edition on iPhone, iPad and Android**. You can browse CurseForge, install modpacks, build your own profiles, add mods and their dependencies, update them, and press Play. The game runs on the device.

It was made by reverse-engineering the CurseForge desktop app (1.324.0, Electron) with [rea](https://github.com/morluto/rea). Kiln recreates CurseForge's screens and features in a single web UI. The phone apps run that UI on top of the open-source [Amethyst](https://github.com/AngelAuraMC) launcher engine, which is the successor to PojavLauncher. Amethyst is what runs Java, LWJGL and OpenGL on mobile. See [docs/REA-ANALYSIS.md](docs/REA-ANALYSIS.md) for what rea found and how each piece maps over.

| Platform | How to get it | Plays the game |
|---|---|---|
| iPhone / iPad | `Kiln.ipa` from [Releases](../../releases), installed with SideStore | Yes. Needs JIT from StikDebug. See [docs/IPHONE.md](docs/IPHONE.md) |
| Android | `Kiln.apk` from [Releases](../../releases) | Yes. See [docs/ANDROID.md](docs/ANDROID.md) |
| Any browser | Open `web/dist/index.html` or host it | Browse and manage profiles only; exports CurseForge zips |

## What's in here

```
web/        Kiln's UI. Plain HTML/CSS/JS, built into one file (web/dist/index.html)
  src/      UI source: views, CurseForge API client, install engine, native bridge
  test/     End-to-end UI tests (Playwright) with sample data and a fake bridge
ios/        Amethyst-iOS (GPL-3.0) + Kiln: Natives/kiln/KilnViewController.m
android/    Amethyst-Android (LGPL-3.0) + Kiln: app_pojavlauncher/.../kiln/KilnBridge.java
.github/    CI that builds Kiln.ipa (macOS runner) and Kiln.apk, then publishes a release
docs/       iPhone/Android setup, rea findings
```

### How it fits together

- The **web UI** handles everything CurseForge-related: searching, project pages, choosing the right file for your game version and loader, required dependencies, modpack manifests, updates and exports.
- The **native bridge** has the same API on iOS and Android. It lets the UI make HTTP calls without CORS, read and write files inside the game folder, unzip packs, create launcher profiles and press the launcher's Play button. Methods include `http`, `download`, `fs.*`, `zip.*`, `profiles.*`, `game.launch`, `loader.runInstaller` and `account.manage`.
- **Amethyst** handles Microsoft sign-in, downloading Minecraft and libraries, Java runtimes, renderers, touch controls and running the game.

Each Kiln profile is a folder at `<game folder>/kiln/<profile>/`. It holds a `kiln.json` listing what's installed, plus the normal `mods/`, `resourcepacks/`, `shaderpacks/` and `config/` folders. The profile is also added to the launcher's `launcher_profiles.json`, so the game runs with that folder as its game directory.

Mod loaders:
- **Fabric** and **Quilt**: Kiln writes the loader's version JSON directly, which takes seconds.
- **Forge** and **NeoForge**: Kiln downloads the official installer and runs it in Java. On iPhone you reopen Kiln afterwards.

## CurseForge API key

The CurseForge API needs a key. You can get one free at [console.curseforge.com](https://console.curseforge.com/). Then either:
- paste it into **Settings → CurseForge** in the app, or
- add it as a repository secret named `CURSEFORGE_API_KEY`. CI then builds it into the apps.

## Building

GitHub Actions builds everything on each push to `main` (see `.github/workflows/build.yml`) and publishes `Kiln.ipa` and `Kiln.apk` to the **nightly** release.

To build locally:

```sh
python3 web/build.py                      # -> web/dist/index.html
node web/test/run-tests.mjs               # UI tests (npm i in web/test first)

# Android (JDK 21, Android SDK/NDK; JRE 8 artifact as in CI)
cd android && ./gradlew :app_pojavlauncher:assembleDebug

# iOS (macOS, Xcode, JDK 8, `brew install ldid make`)
cd ios && gmake package PLATFORM=2
```

## Credits and licenses

- The iOS app is built from [Amethyst-iOS](https://github.com/AngelAuraMC/Amethyst-iOS) under GPL-3.0. The Android app is built from [Amethyst-Android](https://github.com/AngelAuraMC/Amethyst-Android) under LGPL-3.0. Both are based on [PojavLauncher](https://github.com/PojavLauncherTeam). Their own third-party notices still apply.
- Kiln's own code (`web/` and the `kiln` bridge files) is licensed under GPL-3.0 (see `LICENSE`).
- Kiln is not affiliated with CurseForge, Overwolf, Mojang or Microsoft. You need a Minecraft: Java Edition account to play.
