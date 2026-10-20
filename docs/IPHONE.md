# Kiln on iPhone (including iPhone 17 Pro Max)

Apple doesn't allow apps that run Java in the App Store, so Kiln is **sideloaded** with your Apple ID. Minecraft Java also needs **JIT**, which an app can only get while a debugger is attached. StikDebug is the free tool that does this on the phone itself.

Kiln's engine is Amethyst. It is one of the few apps whose JIT works on iOS 26 and newer, and it supports the TXM chips in recent iPhones like the A19 Pro. It uses StikDebug's "Universal JIT" script. Kiln includes that script and passes it to StikDebug automatically.

## What you need

- Your iPhone, on Wi-Fi
- A computer (Windows, Mac or Linux) for the one-time setup
- An Apple ID. A free one works, but its apps must be refreshed every 7 days and you can only have 3 sideloaded apps at once (SideStore, StikDebug and Kiln). A paid developer account removes both limits.
- A Microsoft account that owns Minecraft: Java Edition

## One-time setup

1. **Install SideStore with iloader** on your computer ([github.com/nab138/iloader](https://github.com/nab138/iloader)). On Windows, install iTunes first so the computer can see the iPhone. Plug the iPhone in, tap **Trust**, sign in to iloader with your Apple ID and install **SideStore**. Pick plain SideStore, not "LiveContainer + SideStore", so you keep a free app slot. iloader also places the *pairing file* SideStore needs.
2. **Turn on Developer Mode** on the iPhone: Settings → Privacy & Security → Developer Mode → On, then restart. The switch only shows up after step 1. If iOS says the developer isn't trusted, go to Settings → General → VPN & Device Management and trust your Apple ID.
3. **Install LocalDevVPN** from the App Store. It's free, and SideStore and StikDebug talk to the phone through it.
4. **Install StikDebug** in SideStore from its official source ([github.com/StikDebug/StikDebug](https://github.com/StikDebug/StikDebug)). Then, in iloader, place the pairing file for StikDebug.
5. In **StikDebug → Settings**, turn on **Always Run Scripts**. If the setting is there, also turn on **Silent Audio**; it keeps the debugger alive on TXM iPhones.
6. **Install Kiln**: on the iPhone, open [Kiln.ipa](https://github.com/nklobe12/kiln-launcher/releases/download/nightly/Kiln.ipa) in Safari to download it, then open it with SideStore (Share → SideStore, or SideStore → My Apps → + → pick the file). Installing through SideStore lets SideStore refresh Kiln for you.

## Playing

1. Turn on **LocalDevVPN**.
2. Open **Kiln**. Tap the account button (top right) and sign in with Microsoft.
3. Tap **Browse → Modpacks**, install one, then tap **Play**.
4. Kiln opens StikDebug with the JIT script. StikDebug attaches, JIT turns on, and you're taken back to Kiln, where the game starts.

If Kiln just waits on "Waiting for JIT":
- Open StikDebug yourself, tap **Enable JIT** and pick **Kiln**.
- If StikDebug asks for a script, long-press Kiln → **Assign Script**, then choose `UniversalJIT26.js`. Kiln puts a copy in its Documents folder. On some StikDebug builds the built-in script is named `Amethyst-MeloNX.js`.

After the iPhone restarts, open StikDebug once on Wi-Fi with LocalDevVPN on. This mounts the developer disk image again.

## Tips for the 17 Pro Max

- 12 GB of RAM lets most packs run with **3–4 GB** for Java (profile → Settings → Memory). Don't go higher; iOS ends apps that use too much.
- Pick your renderer in **Settings → Launcher settings**. MobileGlues or Zink work best for 1.17+.
- Forge/NeoForge packs run their installer the first time you tap Play. When it finishes, swipe Kiln away, reopen it and tap Play again.

## Limits to know about

- Apple can change how JIT works in any iOS update. StikDebug and Amethyst have needed updates for iOS 26, so after updating iOS, check that both are on their latest versions.
- With a free Apple ID, refresh Kiln in SideStore at least every 7 days, or it won't open until you do. Open SideStore with LocalDevVPN on and tap **Refresh All**.
- Paid "signing services" can install Kiln, but their certificates can't get JIT, so the game won't start. Use SideStore with your own Apple ID.
