// End-to-end UI tests for Kiln's web UI using sample data and a fake native bridge.
// Run: python3 web/build.py && node web/test/run-tests.mjs
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { buildFixtures } from './fixtures.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, 'out');
fs.mkdirSync(outDir, { recursive: true });
const htmlUrl = pathToFileURL(path.join(here, '..', 'dist', 'index.html')).href;
const mockSrc = fs.readFileSync(path.join(here, 'mock-native.js'), 'utf8');

async function loadPlaywright() {
  try { return await import('playwright'); } catch (e) { return import('/opt/node22/lib/node_modules/playwright/index.mjs'); }
}
const { chromium } = await loadPlaywright();
const fx = buildFixtures();
const browser = await chromium.launch();
const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,OPTIONS' };
let failures = 0;
let currentPage = null;
let passed = 0;

function serve(req) {
  const r = fx.handle(req);
  const isText = /json|text|svg/.test(r.type);
  return { status: r.status, text: isText ? r.body.toString('utf8') : '', b64: r.body.toString('base64'), size: r.body.length };
}

async function newPage(platform, viewport = { width: 390, height: 844 }) {
  const mobile = viewport.width < 600;
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: 2, hasTouch: mobile, isMobile: mobile, colorScheme: 'dark' });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.exposeFunction('__kilnFixture', (req) => serve(req));
  if (platform !== 'web') await page.addInitScript({ content: mockSrc.replace('__PLATFORM__', platform) });
  await ctx.route(/^https?:\/\//, async (route) => {
    const req = route.request();
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const r = fx.handle({ url: req.url(), method: req.method(), headers: req.headers(), body: req.postData() });
    return route.fulfill({ status: r.status, contentType: r.type, body: r.body, headers: cors });
  });
  currentPage = page;
  return { ctx, page, errors };
}

async function step(name, fn) {
  try {
    await fn();
    passed++;
    console.log('  ✓', name);
  } catch (e) {
    failures++;
    console.log('  ✗', name, '\n     ', e.message.split('\n')[0]);
    if (currentPage) await currentPage.screenshot({ path: path.join(outDir, 'FAIL-' + name.replace(/\W+/g, '-') + '.png') }).catch(() => {});
  }
}
function expect(cond, msg) { if (!cond) throw new Error(msg); }
const shot = (page, name) => page.screenshot({ path: path.join(outDir, name + '.png'), fullPage: false });
const native = (page) => page.evaluate(() => ({
  files: [...window.__native.files.keys()],
  calls: window.__native.calls.map((c) => c.method),
  callList: window.__native.calls,
  launcher: window.__native.launcher,
}));
async function readFile(page, p) {
  return page.evaluate((p) => {
    const e = window.__native.files.get(p);
    if (!e) return null;
    return e.text != null ? e.text : atob(e.b64);
  }, p);
}
async function setKey(page) {
  await page.goto(htmlUrl + '#/settings');
  await page.fill('#set-key', 'test-key');
  await page.click('text=Save and test');
  await page.waitForSelector('text=Connected.', { timeout: 5000 });
}
async function confirmSheet(page, label) {
  const btn = page.locator('.sheet-foot button', { hasText: label });
  await btn.waitFor({ timeout: 8000 });
  await btn.click();
}

// ---------------- iOS (phone) ----------------
console.log('iPhone (iOS bridge)');
{
  const { ctx, page, errors } = await newPage('ios');
  await step('opens with Modrinth content before any key is set', async () => {
    await page.goto(htmlUrl);
    await page.waitForSelector('text=These come from Modrinth');
    expect(await page.locator('body.native').count() === 1, 'body should be marked native');
    await shot(page, '01-ios-first-run');
  });
  await step('saves and verifies the API key', async () => {
    await setKey(page);
    await shot(page, '02-ios-settings');
  });
  await step('home shows profiles, modpacks and trending mods', async () => {
    await page.goto(htmlUrl + '#/');
    await page.waitForSelector('.tile');
    await page.waitForSelector('.proj');
    expect(await page.locator('.tile').count() >= 4, 'expected modpack tiles');
    await shot(page, '03-ios-home');
  });
  await step('search finds a mod', async () => {
    await page.goto(htmlUrl + '#/browse/mc-mods');
    await page.waitForSelector('.proj');
    await page.fill('#browse-q', 'map');
    await page.press('#browse-q', 'Enter');
    await page.waitForSelector('text=1 result');
    expect(await page.locator('.proj').count() === 1, 'search should return one result');
    expect(await page.locator('.proj strong', { hasText: 'Pocket Map' }).count() === 1, 'Pocket Map missing');
    await shot(page, '04-ios-search');
  });
  await step('project page renders sanitized description and files', async () => {
    await page.goto(htmlUrl + '#/project/1001');
    await page.waitForSelector('h1:has-text("Lumen Engine")');
    await page.waitForSelector('.desc h2');
    expect(await page.locator('.desc script').count() === 0, 'script tags must be stripped');
    expect(await page.locator('.desc iframe').count() === 0, 'iframes must be replaced');
    const href = await page.locator('.desc a', { hasText: 'Read the wiki' }).getAttribute('href');
    expect(href === 'https://example.org/wiki', 'linkout should be unwrapped, got ' + href);
    await shot(page, '05-ios-project');
    await page.click('.tab:has-text("Files")');
    await page.waitForSelector('.citem');
    await shot(page, '06-ios-files');
  });
  await step('creates a Fabric profile and writes its version JSON', async () => {
    await page.goto(htmlUrl + '#/profiles');
    await page.click('button:has-text("New profile")');
    await page.fill('#np-name', 'Phone Fabric');
    await page.waitForSelector('#np-lv');
    await shot(page, '07-ios-new-profile');
    await confirmSheet(page, 'Create');
    await page.waitForSelector('h1:has-text("Phone Fabric")');
    const n = await native(page);
    expect(n.files.includes('versions/fabric-loader-0.16.5-1.21.1/fabric-loader-0.16.5-1.21.1.json'), 'fabric version json missing');
    const lp = n.launcher.profiles['Phone Fabric'];
    expect(lp && lp.lastVersionId === 'fabric-loader-0.16.5-1.21.1', 'launcher profile lastVersionId wrong: ' + JSON.stringify(lp));
    expect(lp.gameDir === './kiln/phone-fabric', 'gameDir wrong: ' + lp.gameDir);
  });
  await step('installs a mod with its required library', async () => {
    await page.click('a:has-text("Add content")');
    await page.waitForSelector('.addbar');
    const row = page.locator('.proj').filter({ has: page.locator('.proj-title strong', { hasText: /^Lumen Engine$/ }) });
    await row.locator('button:has-text("Install")').click();
    await page.waitForSelector('.sheet >> text=Lantern Lib');
    await shot(page, '08-ios-install-plan');
    await confirmSheet(page, 'Install 2');
    await row.locator('text=Installed').waitFor({ timeout: 8000 });
    const n = await native(page);
    const mods = n.files.filter((f) => f.startsWith('kiln/phone-fabric/mods/'));
    expect(mods.some((f) => f.includes('lumen-engine-fabric-1.21.1')), 'lumen jar missing: ' + mods);
    expect(mods.some((f) => f.includes('lantern-lib-fabric-1.21.1')), 'lantern jar missing: ' + mods);
  });
  await step('disabling a mod renames it to .disabled', async () => {
    await page.goto(htmlUrl + '#/profile/phone-fabric');
    await page.waitForSelector('.citem');
    await page.locator('.citem').filter({ has: page.locator('.ci-main strong', { hasText: /^Lumen Engine/ }) }).locator('.switch input').click();
    await page.waitForTimeout(200);
    const n = await native(page);
    expect(n.files.some((f) => f.startsWith('kiln/phone-fabric/mods/lumen-engine') && f.endsWith('.jar.disabled')), 'expected .disabled file');
    await shot(page, '09-ios-profile');
  });
  await step('finds and applies an update', async () => {
    await page.goto(htmlUrl + '#/project/1006/files?for=phone-fabric');
    await page.waitForSelector('.citem');
    const old = page.locator('.citem', { hasText: '1.9.0' });
    await old.locator('button:has-text("Install")').click();
    await page.waitForSelector('.toast >> text=Installed Quiet Menus');
    await page.goto(htmlUrl + '#/profile/phone-fabric');
    await page.click('button:has-text("Check for updates")');
    await page.waitForSelector('text=1 update available');
    await shot(page, '10-ios-updates');
    await page.click('button:has-text("Update all")');
    await page.waitForSelector('.toast >> text=Updated');
    const n = await native(page);
    const qm = n.files.filter((f) => f.includes('quiet-menus'));
    expect(qm.length === 1 && qm[0].includes('2.1.0.jar') && !qm[0].includes('beta'), 'expected stable 2.1.0 only: ' + qm);
  });
  await step('installs a Fabric modpack with overrides', async () => {
    await page.goto(htmlUrl + '#/project/2001');
    await page.waitForSelector('h1:has-text("Ember Valley")');
    await page.click('.phead-actions button:has-text("Install")');
    await confirmSheet(page, 'Install');
    await page.waitForSelector('h1:has-text("Ember Valley")', { timeout: 15000 });
    await page.waitForURL(/#\/profile\/ember-valley/, { timeout: 15000 });
    await page.waitForSelector('.citem');
    const n = await native(page);
    expect(n.files.includes('kiln/ember-valley/config/lumen.toml'), 'override config missing');
    expect(n.files.includes('kiln/ember-valley/options.txt'), 'override options missing');
    const mods = n.files.filter((f) => f.startsWith('kiln/ember-valley/mods/'));
    expect(mods.length === 4, 'expected 4 downloaded mods, got ' + mods.length);
    expect(await page.locator('.citem', { hasText: 'Clockwork Crates' }).locator('text=Get file').count() === 1, 'website-only mod should show Get file');
    const meta = JSON.parse(await readFile(page, 'kiln/ember-valley/kiln.json'));
    expect(meta.memoryMb === 3072 && meta.status === 'ready', 'pack meta wrong: ' + meta.memoryMb + ' ' + meta.status);
    expect(!n.files.some((f) => f.startsWith('kiln/_tmp/')), 'temp zip should be removed');
    await shot(page, '11-ios-modpack-profile');
  });
  await step('Play hands the profile to the launcher', async () => {
    await page.click('.phead-actions button:has-text("Play")');
    await page.waitForSelector('.toast >> text=Starting Ember Valley');
    const n = await native(page);
    const launch = n.callList.filter((c) => c.method === 'game.launch').pop();
    expect(launch && launch.params.key === 'Ember Valley', 'game.launch not called');
    expect(n.launcher.profiles['Ember Valley'].javaArgs === '-Xmx3072M', 'memory arg missing: ' + n.launcher.profiles['Ember Valley'].javaArgs);
  });
  await step('Forge pack runs the installer, then finishes after restart', async () => {
    await page.goto(htmlUrl + '#/project/2002');
    await page.waitForSelector('h1:has-text("Iron & Ash")');
    await page.click('.phead-actions button:has-text("Install")');
    await confirmSheet(page, 'Install');
    await page.waitForURL(/#\/profile\/iron-ash/, { timeout: 15000 });
    await page.waitForSelector('text=Forge is not installed yet');
    await page.click('.phead-actions button:has-text("Play")');
    await confirmSheet(page, 'Install');
    await page.waitForSelector('.toast >> text=Forge installer started');
    let n = await native(page);
    const run = n.callList.find((c) => c.method === 'loader.runInstaller');
    expect(run && run.params.path === 'kiln/_installers/forge-1.20.1-47.3.0.jar', 'installer call wrong: ' + JSON.stringify(run));
    await page.evaluate(() => {
      window.__native.files.set('versions/1.20.1-forge-47.3.0/1.20.1-forge-47.3.0.json', { text: '{"id":"1.20.1-forge-47.3.0"}' });
      window.__kilnEvent({ name: 'resume', payload: {} });
    });
    await page.waitForSelector('.toast >> text=Iron & Ash is ready to play', { timeout: 5000 });
    const meta = JSON.parse(await readFile(page, 'kiln/iron-ash/kiln.json'));
    expect(meta.versionId === '1.20.1-forge-47.3.0' && meta.status === 'ready', 'forge not finalized: ' + meta.versionId);
  });
  await step('exports a CurseForge zip', async () => {
    await page.goto(htmlUrl + '#/profile/ember-valley');
    await page.waitForSelector('.citem');
    await page.click('button[aria-label="More actions"]');
    await page.click('button:has-text("Export as CurseForge zip")');
    await page.waitForSelector('.toast >> text=Export ready to share');
    const n = await native(page);
    expect(n.files.includes('kiln/_exports/ember-valley-1.21.1.zip'), 'export zip missing');
    expect(n.calls.includes('file.share'), 'share sheet not opened');
    const manifest = await page.evaluate(async () => {
      const e = window.__native.files.get('kiln/_exports/ember-valley-1.21.1.zip');
      const r = await window.webkit.messageHandlers.kiln.postMessage({ method: 'zip.readText', params: { path: 'kiln/_exports/ember-valley-1.21.1.zip', entry: 'manifest.json' } });
      return JSON.parse(r);
    });
    expect(manifest.minecraft.modLoaders[0].id === 'fabric-0.16.5' && manifest.files.length === 5, 'manifest wrong: ' + JSON.stringify(manifest.minecraft));
  });
  await step('downloads page lists finished work', async () => {
    await page.goto(htmlUrl + '#/downloads?tab=done');
    await page.waitForSelector('.dl');
    await shot(page, '12-ios-downloads');
  });
  await step('profiles page and light theme', async () => {
    await page.goto(htmlUrl + '#/profiles');
    await page.waitForSelector('.pcard');
    await shot(page, '13-ios-profiles');
    await page.emulateMedia({ colorScheme: 'light' });
    await page.goto(htmlUrl + '#/');
    await page.waitForSelector('.tile');
    await shot(page, '14-ios-home-light');
    await page.emulateMedia({ colorScheme: 'dark' });
  });
  await step('no script errors', async () => {
    expect(!errors.length, errors.join('\n'));
  });
  await ctx.close();
}

// ---------------- Modrinth, no CurseForge key ----------------
console.log('Modrinth (no CurseForge key)');
{
  const { ctx, page, errors } = await newPage('ios');
  await step('home loads Modrinth modpacks without any key', async () => {
    await page.goto(htmlUrl);
    await page.waitForSelector('.tile');
    expect(await page.locator('.tile', { hasText: 'Moss Hollow' }).count() === 1, 'Moss Hollow tile missing');
    expect(await page.locator('text=These come from Modrinth').count() === 1, 'Modrinth notice missing');
    await shot(page, '50-mr-home');
  });
  await step('browse defaults to Modrinth and searches', async () => {
    await page.goto(htmlUrl + '#/browse/mc-mods');
    await page.waitForSelector('text=on Modrinth');
    await page.fill('#browse-q', 'lumina');
    await page.press('#browse-q', 'Enter');
    await page.waitForSelector('text=2 results on Modrinth');
    expect(await page.locator('.proj').count() === 2, 'expected Lumina and Core Lib');
    await shot(page, '51-mr-browse');
  });
  await step('Modrinth project page renders markdown safely', async () => {
    await page.goto(htmlUrl + '#/mr/AAAA0001');
    await page.waitForSelector('h1:has-text("Lumina")');
    await page.waitForSelector('.desc h2:has-text("About Lumina")');
    expect(await page.locator('.desc strong', { hasText: 'phones and tablets' }).count() === 1, 'markdown bold missing');
    expect(await page.locator('.desc script').count() === 0, 'script must be stripped');
    expect(await page.locator('text=by glowworks').count() >= 1, 'author missing');
    await shot(page, '52-mr-project');
    await page.click('.tab:has-text("Versions")');
    await page.waitForSelector('.citem:has-text("Lumina 2.2.0")');
  });
  await step('creates a Fabric profile with no CurseForge key', async () => {
    await page.goto(htmlUrl + '#/profiles');
    await page.click('button:has-text("New profile")');
    await page.fill('#np-name', 'Moss Test');
    await page.waitForSelector('#np-lv');
    await confirmSheet(page, 'Create');
    await page.waitForSelector('h1:has-text("Moss Test")');
    const n = await native(page);
    expect(n.files.includes('versions/fabric-loader-0.16.5-1.21.1/fabric-loader-0.16.5-1.21.1.json'), 'fabric json missing');
  });
  await step('installs a Modrinth mod with its required library', async () => {
    await page.click('a:has-text("Add content")');
    await page.waitForSelector('.addbar');
    await page.waitForSelector('text=on Modrinth');
    const row = page.locator('.proj').filter({ has: page.locator('.proj-title strong', { hasText: /^Lumina$/ }) });
    await row.locator('button:has-text("Install")').click();
    await page.waitForSelector('.sheet >> text=Core Lib');
    await confirmSheet(page, 'Install 2');
    await row.locator('text=Installed').waitFor({ timeout: 8000 });
    const n = await native(page);
    const mods = n.files.filter((f) => f.startsWith('kiln/moss-test/mods/'));
    expect(mods.includes('kiln/moss-test/mods/lumina-2.2.0.jar') && mods.includes('kiln/moss-test/mods/core-lib-1.5.0.jar'), 'jars missing: ' + mods);
  });
  await step('updates a Modrinth mod', async () => {
    await page.goto(htmlUrl + '#/mr/AAAA0003/files?for=moss-test');
    await page.waitForSelector('.citem:has-text("Tidy Inventory 3.0.0")');
    await page.locator('.citem').filter({ has: page.locator('strong', { hasText: /^Tidy Inventory 3\.0\.0$/ }) }).locator('button:has-text("Install")').click();
    await page.waitForSelector('.toast >> text=Installed Tidy Inventory');
    await page.goto(htmlUrl + '#/profile/moss-test');
    await page.click('button:has-text("Check for updates")');
    await page.waitForSelector('text=1 update available');
    await page.click('button:has-text("Update all")');
    await page.waitForSelector('.toast >> text=Updated');
    const n = await native(page);
    const tid = n.files.filter((f) => f.includes('tidy-inventory'));
    expect(tid.length === 1 && tid[0].endsWith('tidy-inventory-3.1.0.jar'), 'expected 3.1.0 only: ' + tid);
  });
  await step('installs a Modrinth modpack (.mrpack)', async () => {
    await page.goto(htmlUrl + '#/mr/AAAA0006');
    await page.waitForSelector('h1:has-text("Moss Hollow")');
    await page.click('.phead-actions button:has-text("Install")');
    await confirmSheet(page, 'Install');
    await page.waitForURL(/#\/profile\/moss-hollow/, { timeout: 15000 });
    await page.waitForSelector('.citem');
    const n = await native(page);
    const files = n.files.filter((f) => f.startsWith('kiln/moss-hollow/'));
    for (const want of ['mods/lumina-2.2.0.jar', 'mods/core-lib-1.5.0.jar', 'mods/tidy-inventory-3.1.0.jar', 'resourcepacks/pastel-32x-1.0.0.zip', 'mods/handmade-tweaks.jar', 'config/lumina.json5', 'options.txt']) {
      expect(files.includes('kiln/moss-hollow/' + want), 'missing ' + want + ' in ' + files);
    }
    expect(!files.some((f) => f.includes('server-only')), 'server-only file should be skipped');
    expect(await page.locator('.citem', { hasText: 'Lumina' }).count() >= 1, 'identified mod names missing');
    const meta = JSON.parse(await readFile(page, 'kiln/moss-hollow/kiln.json'));
    expect(meta.status === 'ready' && meta.loader.type === 'fabric' && meta.content.length === 5, 'pack meta wrong: ' + meta.status + ' ' + meta.content.length);
    await shot(page, '53-mr-modpack-profile');
  });
  await step('exports a .mrpack and plays', async () => {
    await page.click('button[aria-label="More actions"]');
    await page.click('button:has-text("Export as Modrinth .mrpack")');
    await page.waitForSelector('.toast >> text=Export ready to share');
    let n = await native(page);
    expect(n.files.includes('kiln/_exports/moss-hollow-1.21.1.mrpack'), 'mrpack export missing');
    const index = await page.evaluate(async () => JSON.parse(await window.webkit.messageHandlers.kiln.postMessage({ method: 'zip.readText', params: { path: 'kiln/_exports/moss-hollow-1.21.1.mrpack', entry: 'modrinth.index.json' } })));
    expect(index.dependencies['fabric-loader'] === '0.16.5' && index.files.length === 5, 'index wrong: ' + index.files.length);
    await page.click('.phead-actions button:has-text("Play")');
    await page.waitForSelector('.toast >> text=Starting Moss Hollow');
  });
  await step('iPhone points memory to the launcher settings', async () => {
    await page.goto(htmlUrl + '#/profiles');
    await page.click('.pcard:has-text("Moss Test"), a:has-text("Moss Test")');
    await page.waitForSelector('h1:has-text("Moss Test")');
    await page.click('a.tab:has-text("Settings")');
    await page.waitForSelector('text=Java memory is set for all profiles in Launcher settings');
    expect(await page.locator('#ps-mem').count() === 0, 'iOS should not show a per-profile memory picker');
  });
  await step('no script errors', async () => { expect(!errors.length, errors.join('\n')); });
  await ctx.close();
}

// ---------------- iPad / tablet layout ----------------
console.log('iPad layout');
{
  const { ctx, page, errors } = await newPage('ios', { width: 1180, height: 820 });
  await step('tablet layout with sidebar', async () => {
    await setKey(page);
    await page.goto(htmlUrl + '#/');
    await page.waitForSelector('.tile');
    expect(await page.locator('.rail .brand').isVisible(), 'sidebar brand should show');
    await shot(page, '20-ipad-home');
    await page.goto(htmlUrl + '#/project/2001');
    await page.waitForSelector('.desc h2');
    await shot(page, '21-ipad-project');
  });
  await step('no script errors', async () => { expect(!errors.length, errors.join('\n')); });
  await ctx.close();
}

// ---------------- Android ----------------
console.log('Android (Android bridge)');
{
  const { ctx, page, errors } = await newPage('android', { width: 412, height: 915 });
  await step('vanilla profile launches through KilnAndroid', async () => {
    await setKey(page);
    await page.goto(htmlUrl + '#/profiles');
    await page.click('button:has-text("New profile")');
    await page.fill('#np-name', 'Plain');
    await page.click('.segmented button:has-text("Vanilla")');
    await confirmSheet(page, 'Create');
    await page.waitForSelector('h1:has-text("Plain")');
    await page.click('.phead-actions button:has-text("Play")');
    await page.waitForSelector('.toast >> text=Starting Plain');
    const n = await native(page);
    expect(n.launcher.profiles.Plain.lastVersionId === '1.21.1', 'vanilla version wrong');
    expect(!n.launcher.profiles.Plain.javaArgs, 'vanilla should use the launcher memory: ' + n.launcher.profiles.Plain.javaArgs);
    await shot(page, '30-android-profile');
  });
  await step('modded profile asks for 4 GB automatically', async () => {
    await page.goto(htmlUrl + '#/profiles');
    await page.click('button:has-text("New profile")');
    await page.fill('#np-name', 'Modded');
    await page.waitForSelector('#np-lv');
    await confirmSheet(page, 'Create');
    await page.waitForSelector('h1:has-text("Modded")');
    await page.click('.phead-actions button:has-text("Play")');
    await page.waitForSelector('.toast >> text=Starting Modded');
    const n = await native(page);
    expect(n.launcher.profiles.Modded.javaArgs === '-Xmx4096M', 'automatic modded memory wrong: ' + n.launcher.profiles.Modded.javaArgs);
  });
  await step('memory picker offers only what the phone can spare', async () => {
    await page.click('a.tab:has-text("Settings")');
    await page.waitForSelector('#ps-mem');
    const opts = await page.$$eval('#ps-mem option', (os) => os.map((o) => o.textContent));
    expect(JSON.stringify(opts) === JSON.stringify(['Automatic', '2 GB', '3 GB', '4 GB', '6 GB']), 'memory options: ' + opts.join(', '));
    await page.selectOption('#ps-mem', '6144');
    await page.waitForSelector('.toast >> text=Saved');
    const meta = JSON.parse(await readFile(page, 'kiln/modded/kiln.json'));
    expect(meta.memoryMb === 6144, 'memory not saved: ' + meta.memoryMb);
    const n = await native(page);
    expect(n.launcher.profiles.Modded.javaArgs === '-Xmx6144M', 'chosen memory not passed: ' + n.launcher.profiles.Modded.javaArgs);
    await shot(page, '31-android-profile-settings');
  });
  await step('shares the game log', async () => {
    await page.goto(htmlUrl + '#/logs');
    await page.click('#share-game-log');
    await page.waitForSelector('.toast >> text=No game log yet');
    await page.evaluate(() => { window.__native.hasGameLog = true; });
    await page.click('#share-game-log');
    const n = await native(page);
    expect(n.calls.filter((c) => c === 'game.shareLog').length === 2, 'game.shareLog not called');
  });
  await step('no script errors', async () => { expect(!errors.length, errors.join('\n')); });
  await ctx.close();
}

// ---------------- Browser (no app) ----------------
console.log('Browser (no native bridge)');
{
  const { ctx, page, errors } = await newPage('web', { width: 390, height: 844 });
  await step('browses and records a modpack without the app', async () => {
    await setKey(page);
    await page.goto(htmlUrl + '#/browse/modpacks');
    await page.waitForSelector('.proj');
    await page.locator('.proj', { hasText: 'Quiet Isles' }).locator('button:has-text("Install")').click();
    await confirmSheet(page, 'Install');
    await page.waitForURL(/#\/profile\/quiet-isles/, { timeout: 15000 });
    await page.waitForSelector('.citem');
    expect(await page.locator('.citem').count() === 3, 'expected 3 mods in the web profile');
    await page.click('.phead-actions button:has-text("Play")');
    await page.waitForSelector('.sheet >> text=Play in the Kiln app');
    await shot(page, '40-web-play');
  });
  await step('no script errors', async () => { expect(!errors.length, errors.join('\n')); });
  await ctx.close();
}

await browser.close();
console.log(`\n${passed} passed, ${failures} failed`);
process.exit(failures ? 1 : 0);
