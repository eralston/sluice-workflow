import { randomBytes } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { app, BrowserWindow, dialog, ipcMain, nativeImage, shell } from 'electron';
import { z } from 'zod';
import stateMappingJson from '@config/state-mapping.json';
import type { StateMapping } from '@shared/contracts/history';
import type { PictureResult } from '@shared/contracts/ipc';
import { areaFavoriteSchema, CH, devlogEntrySchema, focusSchema, modeSchema, paradigmSchema, syncLevelSchema, rangeSchema, scopeHistorySchema, scopeSchema, setPatSchema, type Paradigm } from '@shared/contracts/ipc';
import { FAKE_ORG_URL, toAdoPayloads } from '@fixtures/ado';
import { scenarios } from '@fixtures/scenarios';
import crowdedOrg from '@fixtures/scenarios/crowded-org';
import sprintGaps from '@fixtures/scenarios/sprint-gaps';
import { v1Scenarios } from '@fixtures/scenarios/v1';
import { initialBounds, sizeOverride, trackBounds } from './windowState';
import { listFixtures, setFixtureParadigm } from './fixtures';
import { registerSettingsIpc, userSettings } from './userSettings';
import { registerCaptainFileIpc } from './captainFile';
import { adoSource } from './source/adoSource';
import { fixtureSource } from './source/fixtureSource';
import { FakeAdoTransport } from './ado/fake';
import { AdoError } from './ado/client';
import { encodeNetError } from '@shared/contracts/neterror';
import { HttpTransport } from './ado/http';
import { AdoService } from './ado/service';
import { AzOverlayStore, credentialStore, type CredentialStore } from './credentials/store';
import { AzSession } from './credentials/azCli';
import { currentLogFile, devlog, devLogEnabled, startDevLog, stopDevLog } from './devlog';
import { loadProfile, profileArgument } from './profile';
import { activity } from './activity';
import { EXPORT_FOLDER, PICTURE_MAX_BYTES, PICTURE_PX } from './avatars/pictures';

// One userData folder however the app is launched: e2e runs start Electron on out/main directly,
// where it can't find the app name and would fall back to a generic "Electron" folder.
// Test runs get their own (STAR_CHART_USER_DATA, set per launch by tests/e2e/launch.ts), so they never
// touch the developer's real cache and specs can run in parallel (decided 2026-10-07).
// Test seams (STAR_CHART_USER_DATA, the *_PICK_* and CAPTAIN_FILE stand-ins for dialogs) exist only in an unpackaged build.
const testMode = process.env.STAR_CHART_TEST === '1' && !app.isPackaged;
app.setPath('userData', (testMode && process.env.STAR_CHART_USER_DATA) || join(app.getPath('appData'), 'star-chart'));
// Test runs hide native scrollbars: macOS draws them by the system setting and whether a mouse is
// plugged in, which would make the pixel baselines depend on the machine (decided 2026-10-07).
if (testMode) app.commandLine.appendSwitch('hide-scrollbars');

// The art gallery (npm run gallery) is a development tool: never available in a packaged build.
const galleryMode = process.env.STAR_CHART_GALLERY === '1' && !app.isPackaged;
let mode: 'fixture' | 'ado' = 'fixture';
let paradigm: Paradigm = 'solar';
const mapping = stateMappingJson as StateMapping;
/**
 * The fixture scenario as a fake ADO org (fixtures/ado.ts), for dev and test runs only: ADO mode with
 * no network and no real data (INV-18). Its org is https://dev.azure.com/fixture-org, and its clock
 * stands at the scenario's end so the default range shows the scenario's week. v1's SDLC scenarios
 * (pod-sprint) can be named too; the demo packs can't, since the fake org's WIQL is SDLC's (17 A3).
 */
const fakeScenarios = [...scenarios, crowdedOrg, sprintGaps, ...v1Scenarios.filter((s) => !s.pack || s.pack === 'sdlc')];
const fakeScenario = fakeScenarios.find((s) => s.name === process.env.STAR_CHART_FIXTURE) ?? scenarios[0]!;
const fakeAdo = process.env.STAR_CHART_FAKE_ADO === '1' && (testMode || !app.isPackaged) ? toAdoPayloads(fakeScenario, mapping, testMode && process.env.STAR_CHART_FAKE_ME ? { me: process.env.STAR_CHART_FAKE_ME } : {}) : null;
let ado: AdoService | null = null;
let creds: CredentialStore | null = null;

// The dev log (decided 2026-10-07): developer runs by default; tests only on request. A packaged build
// keeps one only when the user turns the diagnostic log on (slice 7, decided 2026-10-10). Test runs
// can stand in for a packaged build (STAR_CHART_AS_PACKAGED) to check that toggle.
const packagedLike = app.isPackaged || (testMode && process.env.STAR_CHART_AS_PACKAGED === '1');
const DIAG_KEY = 'diagnostics.log';
let devLogOn = devLogEnabled({ packaged: packagedLike, test: testMode, env: process.env });
/** Terms that must never reach the log, checked in memory (redact.ts's defence in depth). Refreshed every few seconds. */
let guardTerms: string[] = [];
let guardAt = 0;
function guard(): string[] {
  if (Date.now() - guardAt < 5000 || !ado) return guardTerms;
  guardAt = Date.now();
  const st = ado.status();
  const org = ado.cache.meta('org_key');
  const terms = new Set<string>();
  if (st.orgUrl) { terms.add(st.orgUrl); const seg = st.orgUrl.split('/').pop(); if (seg) terms.add(seg); }
  if (org) {
    for (const p of ado.cache.projects(org)) terms.add(p.name);
    for (const i of ado.cache.identities(org).values()) { terms.add(i.displayName); if (i.uniqueName) terms.add(i.uniqueName); }
  }
  // The saved PAT whatever the sign-in method, and the token in use (the az token while signed in with az).
  for (const t of [creds?.stored?.() ?? null, creds?.get()]) if (t) terms.add(t.slice(0, 8));
  const live = creds?.get();
  if (live && live.length >= 16) terms.add(live.slice(-8)); // an az token's own tail: its head is a generic JWT header
  guardTerms = [...terms].filter((t) => t.length >= 4);
  return guardTerms;
}
let hooked = false;
function startLogging(): void {
  if (!devLogOn || devlog.on) return;
  const saltFile = join(app.getPath('userData'), 'devlog-salt');
  if (!existsSync(saltFile)) writeFileSync(saltFile, randomBytes(16), { mode: 0o600 });
  // A packaged app's own folder is read-only (asar): its log lives under userData.
  const dir = process.env.STAR_CHART_DEVLOG_DIR ?? (packagedLike ? join(app.getPath('userData'), 'logs') : join(app.getAppPath(), 'logs'));
  const file = startDevLog(dir, readFileSync(saltFile), guard);
  console.log(`[star-chart] dev log: ${file}`);
  devlog.write('main', 'start', { version: app.getVersion(), platform: process.platform, fixture: fakeAdo ? 'fake-ado' : null, test: testMode });
  if (hooked) return;
  hooked = true;
  process.on('uncaughtException', (e) => devlog.write('main', 'error', { level: 'fatal', errorClass: e.name, stack: stackOf(e) }));
  process.on('unhandledRejection', (e) => devlog.write('main', 'error', { level: 'unhandled', errorClass: e instanceof Error ? e.name : typeof e, stack: e instanceof Error ? stackOf(e) : null }));
  app.on('before-quit', () => devlog.write('main', 'quit', {}));
}

/** The diagnostic log's switch (slice 7): remembered, and it starts or stops the log at once. */
function setDiagnostics(on: boolean): void {
  ado?.cache.setSetting(DIAG_KEY, on);
  devLogOn = devLogEnabled({ packaged: packagedLike, test: testMode, env: process.env, optIn: on });
  if (devLogOn) startLogging();
  else stopDevLog();
}
/** A stack as file:line only: no messages (they can hold names). */
const stackOf = (e: Error) => (e.stack ?? '').split('\n').slice(1, 6).map((l) => (/([\w.-]+\.[jt]sx?):(\d+)/.exec(l) ?? []).slice(1, 3).join(':')).filter(Boolean).join(' < ');

function createWindow(): void {
  // Reopen where the user left it. Tests keep that position but use a fixed size, and never save.
  const stateKey = galleryMode ? 'gallery' : 'app';
  // Test runs don't show their window at all (decided 2026-10-09: they were appearing centred, over
  // whatever the user was doing). `backgroundThrottling: false` below keeps a hidden window
  // animating, and Playwright still composites it, so the pixel baselines and stills are unaffected
  // — the whole suite passes hidden. `STAR_CHART_TEST_SHOW=1` shows it, pinned to the top-left, for
  // when you want to watch a run; the driver (npm run drive) always shows.
  const hidden = testMode && process.env.STAR_CHART_TEST_SHOW !== '1';
  const win = new BrowserWindow({
    ...initialBounds(stateKey, sizeOverride(testMode)),
    ...(testMode ? { x: 0, y: 0 } : {}),
    // macOS clamps a window to the screen; CI's runner display is smaller than the test size, and a
    // clamped window lays out differently (labels hide, clicks land elsewhere). Tests keep their size
    // (with the setSize below).
    enableLargerThanScreen: testMode,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#081629',
    title: galleryMode ? 'Star Chart · Art gallery' : 'Star Chart',
    show: false,
    webPreferences: {
      preload: join(__dirname, '../preload/index.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      // Test runs open several windows at once (parallel specs): a covered one must keep animating.
      backgroundThrottling: !testMode,
      additionalArguments: [...(testMode ? ['--star-chart-test'] : []), ...(galleryMode ? ['--star-chart-gallery'] : []), ...(devLogOn ? ['--star-chart-devlog'] : []), ...(testMode && process.env.STAR_CHART_TOUR_OFFER === '1' ? ['--star-chart-tour-offer'] : []), profileArgument(loadProfile(app.getPath('userData'), { pinned: process.env.STAR_CHART_PROFILE, packaged: app.isPackaged }))],
    },
  });
  // Test runs open in the background so they don't steal focus from whoever is at the keyboard.
  if (!testMode) trackBounds(win, stateKey);
  // The constructor clamps to the screen whatever enableLargerThanScreen says; a resize afterwards isn't.
  const fixed = sizeOverride(testMode);
  if (testMode && fixed) win.setSize(fixed.width, fixed.height);
  win.once('ready-to-show', () => {
    if (hidden) return; // offscreen entirely: nothing is shown, and nothing steals focus
    if (testMode) win.showInactive(); else win.show();
  });

  // No arbitrary navigation or popups; external links go through openInAdo only.
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e, url) => {
    if (!isOwnPage(url)) e.preventDefault(); // a dropped file or a stray link never takes the window away
  });

  if (process.env.ELECTRON_RENDERER_URL) void win.loadURL(process.env.ELECTRON_RENDERER_URL);
  else void win.loadFile(join(__dirname, '../renderer/index.html'));
}

/** Whether `url` is the app's own page: the dev server's origin, or the packaged index.html (any hash or query). */
function isOwnPage(url: string): boolean {
  try {
    const u = new URL(url);
    const dev = process.env.ELECTRON_RENDERER_URL;
    if (dev) return u.origin === new URL(dev).origin;
    return u.protocol === 'file:' && u.pathname === pathToFileURL(join(__dirname, '../renderer/index.html')).pathname;
  } catch {
    return false;
  }
}

async function startAdo(): Promise<AdoService> {
  // Tests get a fresh DB each run; the app's lives under userData, never in the project folder.
  // The fake org (npm run dev:fake-ado) keeps its own cache, apart from any real org's.
  const dbDir = testMode ? (process.env.STAR_CHART_DB_DIR ?? mkdtempSync(join(tmpdir(), 'star-chart-test-')))
    : fakeAdo ? join(app.getPath('userData'), 'fake-ado') : app.getPath('userData');
  mkdirSync(dbDir, { recursive: true });
  // The PAT is encrypted by the Keychain (safeStorage) and kept as ciphertext under userData, dev builds
  // included (decided 2026-10-07; macOS may ask once: Always Allow). Only test runs keep it in memory.
  // The Azure CLI sign-in (04 §1a) sits over it: its token is held in memory only and wins while signed in.
  const azSession = new AzSession();
  const credentials = new AzOverlayStore(await credentialStore(join(app.getPath('userData'), 'pat.bin'), testMode), azSession);
  creds = credentials;
  const service = new AdoService({
    dbDir, credentials, mapping, az: { session: azSession },
    // Pictures added by hand live beside the cache, not in it, so Purge leaves them (slice 6).
    picturesDir: join(app.getPath('userData'), 'pictures'),
    // A test can ask for a cold project list every time, to see an offline start (AC-31).
    ...(testMode && process.env.STAR_CHART_PROJECTS_TTL_MS ? { projectsTtlMs: Number(process.env.STAR_CHART_PROJECTS_TTL_MS) } : {}),
    clock: fakeAdo ? () => fakeAdo.now : Date.now,
    transportFor: (orgUrl, pat) => {
      if (fakeAdo) {
        const t = new FakeAdoTransport(fakeAdo);
        // Test runs: the URLs the fake was asked for (loaded by level: which calls each step makes),
        // and the transport itself, so a spec can take ADO away mid-run (AC-31) with no production
        // surface for it. Reached from the main process: `electronApp.evaluate`.
        if (testMode) {
          const g = globalThis as { __starChartFakeLog?: { url: string }[]; __starChartFakeTransport?: FakeAdoTransport };
          g.__starChartFakeLog = t.log;
          g.__starChartFakeTransport = t;
        }
        t.delayMs = Number(process.env.STAR_CHART_FAKE_DELAY_MS ?? 0) || 0;
        // The fake still wants a token, and only answers for its own org.
        // Tests can make some calls fail (STAR_CHART_FAKE_FAIL: a regex on the URL) to see failures shown.
        // STAR_CHART_FAKE_FAIL_STATUS picks the status: 500 by default, 403 or 404 for a refusal that
        // keeps the last known facts and marks them stale (02 §3).
        const fail = process.env.STAR_CHART_FAKE_FAIL ? new RegExp(process.env.STAR_CHART_FAKE_FAIL) : null;
        const failStatus = Number(process.env.STAR_CHART_FAKE_FAIL_STATUS ?? 500) || 500;
        t.intercept = (req) => (!pat() ? { status: 401, headers: {}, body: null } : !req.url.startsWith(`${FAKE_ORG_URL}/`) ? { status: 404, headers: {}, body: null }
          : fail?.test(req.url) ? { status: failStatus, headers: {}, body: { message: `Simulated ${failStatus} (test)` } } : undefined);
        return t;
      }
      return new HttpTransport({ orgUrl, pat, scheme: () => credentials.scheme(), refresh: () => azSession.refetch() });
    },
    send: (msg) => {
      if (testMode) ipcLog.push({ channel: CH.syncProgress, args: JSON.stringify([msg]), result: '' });
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send(CH.syncProgress, msg);
    },
    scopeUpdated: (e) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send(CH.scopeUpdated, e); },
    chooserChanged: (e) => { for (const w of BrowserWindow.getAllWindows()) w.webContents.send(CH.chooserChanged, e); },
    openExternal: (url) => shell.openExternal(url),
  });
  // First launch opens ADO mode's empty cosmos, the start of onboarding (decided 2026-10-07). Test runs
  // start in fixture mode unless a spec asks otherwise (STAR_CHART_START_MODE).
  const start = process.env.STAR_CHART_START_MODE === 'fixture' || process.env.STAR_CHART_START_MODE === 'ado' ? process.env.STAR_CHART_START_MODE : 'ado';
  mode = service.cache.setting<'fixture' | 'ado'>('mode') ?? start;
  // Solar is the default (v1, 14 §7). STAR_CHART_PARADIGM pins another (tests, and the v0 views). The
  // cache's `paradigm` setting is still written but no longer read: a developer's cache likely holds
  // Sprints, which would hide v1.
  const pin = paradigmSchema.safeParse(process.env.STAR_CHART_PARADIGM);
  // Nothing pinned: the developer toggle's last choice, kept in settings.json (23 E3, 13 Q9), else Solar.
  paradigm = pin.success ? pin.data : userSettings().get().devParadigm ?? 'solar';
  setFixtureParadigm(paradigm);
  if (mode === 'ado') service.resumeAz(); // in parallel: the window opens now, ADO calls wait for it
  return service;
}

/**
 * Test runs only: every IPC request, response, and message as JSON, so AC-25 can show the PAT
 * crossing IPC only in `auth.setPat`'s request. Read from the e2e suite with `app.evaluate`.
 */
const ipcLog: { channel: string; args: string; result: string }[] = [];
if (testMode) (globalThis as { __starChartIpcLog?: typeof ipcLog }).__starChartIpcLog = ipcLog;

/** The channels that read the connection: they wait for a launch resume of the Azure CLI sign-in (04 §1a). */
const WAITS_FOR_AZ = /^starChart:(auth\.(status|setPat|azSignIn|clear)|probe|projects|favorites|epics|history|iterations|areas|sync\.start|pictures\.add)/;
function handle(channel: string, fn: (e: Electron.IpcMainInvokeEvent, ...args: unknown[]) => unknown): void {
  ipcMain.handle(channel, async (e, ...args) => {
    const t0 = Date.now();
    const short = channel.replace(/^starChart:/, '');
    try {
      if (WAITS_FOR_AZ.test(channel)) await ado?.ready();
      const r = await fn(e, ...args);
      // Arguments are summarized and redacted; setPat's never are (INV-17).
      devlog.write('main', 'ipc', { channel: short, ms: Date.now() - t0, outcome: 'ok', args: channel === CH.authSetPat || channel === CH.picturesSet ? null : args });
      if (testMode) ipcLog.push({ channel, args: channel === CH.picturesSet ? '[key, bytes]' : JSON.stringify(args), result: JSON.stringify(r) ?? '' });
      return r;
    } catch (err) {
      if (testMode) ipcLog.push({ channel, args: JSON.stringify(args), result: `error: ${err instanceof Error ? err.message : String(err)}` });
      devlog.write('main', 'ipc', { channel: short, ms: Date.now() - t0, outcome: 'error', status: err instanceof AdoError ? err.status : null, code: err instanceof AdoError ? err.code ?? null : null, errorClass: err instanceof Error ? err.name : 'unknown' });
      // A network failure carries its details across IPC inside the message (decided 2026-10-07).
      if (err instanceof AdoError) throw new Error(encodeNetError(err.message, err.detail));
      throw err;
    }
  });
}

function registerIpc(service: AdoService): void {
  /**
   * Pictures added by hand (slice 6): choose a file in a native dialog (test runs name one in
   * STAR_CHART_PICK_FILE instead), cut it to a small centered square, and keep it for that captain.
   * The file's path and bytes stay in this process; the renderer only learns whether it took.
   */
  const addPicture = async (captainKey: string, win: BrowserWindow | null): Promise<PictureResult> => {
    if (!service.status().connected) return { ok: false, reason: 'notConnected' };
    let file = testMode ? process.env.STAR_CHART_PICK_FILE : undefined;
    if (!file) {
      const opts: Electron.OpenDialogOptions = { title: 'Choose a picture', properties: ['openFile'], filters: [{ name: 'Pictures', extensions: ['png', 'jpg', 'jpeg', 'gif', 'webp'] }] };
      const chosen = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
      if (chosen.canceled || !chosen.filePaths[0]) return { ok: false, reason: 'cancelled' };
      file = chosen.filePaths[0];
    }
    let bytes: Buffer;
    try { bytes = readFileSync(file); } catch { return { ok: false, reason: 'unreadable' }; }
    const { ok, reason } = keepPicture(captainKey, bytes);
    return { ok, ...(reason ? { reason } : {}) }; // the picture itself comes with the next history load (see pictures.set for the other way)
  };
  /** Cut a picture's bytes to a small centered square and keep it for that captain (also what a dropped or pasted picture takes). */
  const keepPicture = (captainKey: string, bytes: Buffer): PictureResult => {
    if (!service.status().connected) return { ok: false, reason: 'notConnected' };
    if (bytes.length > PICTURE_MAX_BYTES) return { ok: false, reason: 'tooBig' };
    const img = nativeImage.createFromBuffer(bytes);
    const { width, height } = img.getSize();
    if (img.isEmpty() || !width || !height) return { ok: false, reason: 'unreadable' };
    const side = Math.min(width, height);
    const square = img.crop({ x: Math.floor((width - side) / 2), y: Math.floor((height - side) / 2), width: side, height: side });
    service.setPicture(captainKey, square.resize({ width: PICTURE_PX, height: PICTURE_PX, quality: 'best' }).toPNG());
    devlog.write('main', 'picture-added', {}); // no name, no id: that someone added one is all the log needs
    return { ok: true, avatar: service.pictureOf(captainKey) ?? undefined };
  };
  /** A folder for the pictures to go to or come from: chosen in a native dialog (test runs name it in STAR_CHART_PICK_DIR). */
  const pickFolder = async (title: string, win: BrowserWindow | null, create: boolean): Promise<string | null> => {
    const fixed = testMode ? process.env.STAR_CHART_PICK_DIR : undefined;
    if (fixed) return fixed;
    const opts: Electron.OpenDialogOptions = { title, properties: ['openDirectory', ...(create ? ['createDirectory' as const] : [])] };
    const chosen = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    return chosen.canceled || !chosen.filePaths[0] ? null : chosen.filePaths[0];
  };
  const projectKey = (v: unknown) => {
    if (typeof v !== 'string' || !v.startsWith('proj:')) throw new Error('bad project key');
    return v;
  };
  const areaKey = (v: unknown) => {
    if (typeof v !== 'string' || !/^area:[^:]+:[^:]+:\d+$/.test(v)) throw new Error('bad area key');
    return v;
  };
  // The data behind the chart (decided 2026-10-07): each handler asks the active source.
  const sources = { fixture: fixtureSource, ado: adoSource(service) };
  const src = () => sources[mode];

  handle(CH.modeGet, () => mode);
  handle(CH.paradigmGet, () => paradigm);
  handle(CH.paradigmSet, (_e, p: unknown) => {
    paradigm = paradigmSchema.parse(p);
    setFixtureParadigm(paradigm);
    devlog.write('main', 'paradigm', { paradigm });
  });
  handle(CH.modeSet, (_e, m: unknown, transient?: unknown) => {
    mode = modeSchema.parse(m);
    devlog.write('main', 'mode', { mode });
    // A transient mode (the guided tour's fixture, 23 E7) is never saved: a quit or crash boots into the saved one.
    if (transient !== true) service.cache.setSetting('mode', mode);
    // Switching to ADO: ask `az` again if it was how you connected (the launch resume only ran for a launch in ADO mode).
    if (mode === 'ado' && service.status().method !== 'az') service.resumeAz();
  });
  handle(CH.fixturesList, () => {
    if (mode !== 'fixture') throw new Error('fixtures.list is fixture-mode only');
    return listFixtures();
  });

  // Connection: works in either mode, so ADO can be set up before switching.
  handle(CH.authStatus, () => service.status());
  handle(CH.authSetPat, (_e, orgUrl: unknown, pat: unknown) => {
    const [u, p] = setPatSchema.parse([orgUrl, pat]);
    return service.setPat(u, p);
  });
  handle(CH.authClear, () => service.clear());
  handle(CH.authAzAvailable, () => service.azAvailable());
  handle(CH.authAzSignIn, (_e, orgUrl: unknown) => service.azSignIn(z.string().max(300).parse(orgUrl)));
  handle(CH.probeRun, () => service.probe());
  handle(CH.cacheStats, () => service.stats());
  handle(CH.cachePurge, () => service.purge());
  // The diagnostic log (slice 7): whether it's on, the switch, and a Finder window on its file. Only
  // "on" and "shown" cross IPC: never the file's path or its contents.
  handle(CH.diagnosticsGet, () => ({ on: devlog.on, packaged: packagedLike }));
  handle(CH.diagnosticsSet, (_e, on: unknown) => { setDiagnostics(z.boolean().parse(on)); return { on: devlog.on, packaged: packagedLike }; });
  handle(CH.diagnosticsShow, () => {
    const file = currentLogFile();
    if (!file) return false;
    if (!testMode) shell.showItemInFolder(file);
    return true;
  });
  handle(CH.picturesAdd, (e, captainKey: unknown) => addPicture(z.string().max(200).parse(captainKey), BrowserWindow.fromWebContents(e.sender)));
  handle(CH.picturesRemove, (_e, captainKey: unknown) => service.removePicture(z.string().max(200).parse(captainKey)));
  handle(CH.picturesSet, (_e, captainKey: unknown, bytes: unknown) => {
    if (!ArrayBuffer.isView(bytes)) return { ok: false, reason: 'unreadable' } satisfies PictureResult;
    return keepPicture(z.string().max(200).parse(captainKey), Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength));
  });
  handle(CH.picturesExport, async (e) => {
    if (!service.status().connected) return { ok: false, reason: 'notConnected', count: 0 };
    const dir = await pickFolder('Choose where to copy the pictures', BrowserWindow.fromWebContents(e.sender), true);
    if (!dir) return { ok: false, reason: 'cancelled', count: 0 };
    try { return { ok: true, count: service.exportPictures(join(dir, EXPORT_FOLDER)) }; } catch { return { ok: false, reason: 'unreadable', count: 0 }; }
  });
  handle(CH.picturesImport, async (e) => {
    if (!service.status().connected) return { ok: false, reason: 'notConnected', count: 0 };
    const dir = await pickFolder('Choose a folder of exported pictures', BrowserWindow.fromWebContents(e.sender), false);
    if (!dir) return { ok: false, reason: 'cancelled', count: 0 };
    try { const pictures = service.importPictures(dir); return { ok: true, count: Object.keys(pictures).length, pictures }; } catch { return { ok: false, reason: 'unreadable', count: 0 }; }
  });

  handle(CH.projectsList, (_e, cacheOnly: unknown) => src().projects(cacheOnly === true));
  handle(CH.projectsRecent, () => src().recentProjects());
  handle(CH.projectsSetPinned, (_e, keys: unknown) => service.setPinned(z.array(z.string()).parse(keys).map(projectKey) as never));
  handle(CH.areasTree, (_e, k: unknown) => src().areaTree(projectKey(k)));
  handle(CH.favoritesList, (_e, k: unknown) => src().favorites(projectKey(k)));
  handle(CH.iterationsList, (_e, k: unknown) => src().iterations(projectKey(k)));
  handle(CH.favoritesSave, (_e, f: unknown) => service.saveFavorite(areaFavoriteSchema.parse(f)));
  handle(CH.favoritesRemove, (_e, k: unknown) => service.removeFavorite(areaKey(k)));
  handle(CH.favoritesReorder, (_e, k: unknown, order: unknown) => service.reorderFavorites(projectKey(k), z.array(z.string()).parse(order).map(areaKey)));
  handle(CH.epicsList, (_e, k: unknown) => src().epics(projectKey(k)));
  handle(CH.epicsSearch, (_e, k: unknown, q: unknown) => src().searchEpics(projectKey(k), z.string().max(200).parse(q)));
  handle(CH.syncStart, (_e, scope: unknown, range: unknown, level: unknown) =>
    src().startSync(scopeSchema.parse(scope), rangeSchema.parse(range), level === undefined || level === null ? undefined : syncLevelSchema.parse(level)));
  handle(CH.syncCancel, (_e, jobId: unknown) => service.cancelSync(z.string().parse(jobId)));
  handle(CH.syncFocus, (_e, a: unknown) => { const f = focusSchema.parse(a); return src().focus(f.scope, f.sceneKey); });
  handle(CH.historyRange, () => src().range());
  handle(CH.historyLoad, (_e, scope: unknown, range: unknown) => scopeHistorySchema.parse(src().load(scopeSchema.parse(scope), rangeSchema.parse(range))));
  handle(CH.openInAdo, (_e, key: unknown) => {
    // Main resolves URLs from keys and allowlists the ADO origin (03 §6). Fixtures have no URLs.
    if (typeof key !== 'string') throw new Error('bad key');
    return src().openInAdo(key);
  });
}

app.whenReady().then(async () => {
  ado = await startAdo();
  devLogOn = devLogEnabled({ packaged: packagedLike, test: testMode, env: process.env, optIn: ado.cache.setting<boolean>(DIAG_KEY) === true });
  startLogging();
  // Request activity goes to every window (the status bar's chips); batched per frame-ish tick.
  let pending: unknown[] = [];
  let flushTimer: NodeJS.Timeout | null = null;
  activity.setSink((e) => {
    pending.push(e);
    flushTimer ??= setTimeout(() => {
      const batch = pending;
      pending = [];
      flushTimer = null;
      for (const w of BrowserWindow.getAllWindows()) for (const ev of batch) w.webContents.send(CH.activity, ev);
    }, 16);
  });
  devlog.write('main', 'mode', { mode, storage: creds?.kind ?? null, outcome: ado.status().connected ? 'connected' : 'not-connected' });
  // Renderer entries (inputs, navigation, errors): validated, then redacted like everything else.
  ipcMain.on(CH.devlog, (_e, entry: unknown) => {
    const parsed = devlogEntrySchema.safeParse(entry);
    if (parsed.success) devlog.write('renderer', parsed.data.kind, parsed.data.fields ?? {});
  });
  registerIpc(ado);
  registerCaptainFileIpc(testMode); // 23 E2: the captain file's two dialogs
  registerSettingsIpc(); // userData/settings.json (v1, 14 §2.9): the viewer survives Purge
  createWindow();
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  ado?.cache.close();
  app.quit();
});
