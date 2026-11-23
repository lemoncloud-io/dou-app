const { app, BrowserWindow, ipcMain } = require('electron');
const { existsSync } = require('node:fs');
const path = require('node:path');

const PRELOAD = path.join(__dirname, '..', 'out', 'preload', 'index.js');
const PAGE = path.join(__dirname, 'sandbox-smoke.html');

const SENTINEL = {
    deviceId: 'smoke-device-7f3a',
    stage: 'smoke-stage',
    version: '9.9.9',
    language: 'ko',
};

const PROBE = 'smoke 한글 😀 </script>   "q" ok';

const TO_WEB_CHANNEL = 'chatic-bridge:to-web';
const TO_APP_CHANNEL = 'chatic-bridge:to-app';
const LOGIN_ITEM_CHANNEL = 'chatic-login-item';
const INVOKE_SENTINEL = { enabled: true, note: 'smoke-invoke-한글' };

const ARGUMENT_DERIVED = new Set(['stage', 'version', 'language', 'deviceId', 'electronAPI.appVersion']);

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

const poll = async (wc, expression, timeoutMs = 6000) => {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
        const value = await wc.executeJavaScript(expression).catch(() => undefined);
        if (value !== undefined && value !== null) return value;
        if (Date.now() > deadline) return undefined;
        await wait(100);
    }
};

const READ_GLOBALS = `(() =>
    window.CHATIC_APP_STAGE === undefined
        ? null
        : {
              platform: window.CHATIC_APP_PLATFORM,
              stage: window.CHATIC_APP_STAGE,
              deviceId: window.CHATIC_APP_DEVICE_ID,
              deviceModel: window.CHATIC_APP_DEVICE_MODEL,
              version: window.CHATIC_APP_CURRENT_VERSION,
              language: window.CHATIC_APP_CURRENT_LANGUAGE,
          })()`;

const READ_BRIDGE = `(() => ({
    messageHandler: typeof (window.ChaticMessageHandler || {}).postMessage,
    appVersion: (window.electronAPI || {}).appVersion ?? null,
    apiPlatform: (window.electronAPI || {}).platform ?? null,
    customUiApply: typeof ((window.electronAPI || {}).customUi || {}).apply,
    loginItemGet: typeof ((window.electronAPI || {}).loginItem || {}).get,
    loginItemSet: typeof ((window.electronAPI || {}).loginItem || {}).set,
}))()`;

const openProbeWindow = withArguments => {
    const win = new BrowserWindow({
        show: false,
        width: 800,
        height: 600,
        webPreferences: {
            preload: PRELOAD,
            additionalArguments: withArguments
                ? [
                      `--chatic-device-id=${SENTINEL.deviceId}`,
                      `--chatic-stage=${SENTINEL.stage}`,
                      `--chatic-app-version=${SENTINEL.version}`,
                      `--chatic-language=${SENTINEL.language}`,
                  ]
                : [],
            contextIsolation: true,
            nodeIntegration: false,
            sandbox: true,
            backgroundThrottling: false,
        },
    });
    return win;
};

const probe = async withArguments => {
    const preloadErrors = [];
    const win = openProbeWindow(withArguments);
    win.webContents.on('preload-error', (_event, preloadPath, error) =>
        preloadErrors.push({ preloadPath, message: String(error && error.message) })
    );

    await win.loadFile(PAGE);

    const globals = await poll(win.webContents, READ_GLOBALS);
    const bridge = await poll(win.webContents, READ_BRIDGE, 1000);

    win.webContents.send(TO_WEB_CHANNEL, PROBE);
    const received = await poll(win.webContents, `window.__msgs.length ? window.__msgs[0] : null`, 4000);

    let toApp = null;
    const onToApp = (_event, message) => (toApp = message);
    ipcMain.on(TO_APP_CHANNEL, onToApp);
    await win.webContents.executeJavaScript(`window.ChaticMessageHandler.postMessage(${JSON.stringify(PROBE)})`);

    const invoked = await win.webContents
        .executeJavaScript(`window.electronAPI.loginItem.get().then(v => JSON.stringify(v))`)
        .catch(error => `THREW: ${error && error.message}`);

    for (let i = 0; toApp === null && i < 40; i += 1) await wait(50);
    ipcMain.off(TO_APP_CHANNEL, onToApp);
    win.destroy();

    const checks = [
        ['globals injected', globals != null, globals],
        ['stage', globals && globals.stage === SENTINEL.stage, globals && globals.stage],
        ['version', globals && globals.version === SENTINEL.version, globals && globals.version],
        ['language', globals && globals.language === SENTINEL.language, globals && globals.language],
        ['deviceId', globals && globals.deviceId === SENTINEL.deviceId, globals && globals.deviceId],
        ['deviceModel from process.platform', !!(globals && globals.deviceModel), globals && globals.deviceModel],
        ['platform literal', globals && globals.platform === 'desktop', globals && globals.platform],
        [
            'ChaticMessageHandler exposed',
            bridge && bridge.messageHandler === 'function',
            bridge && bridge.messageHandler,
        ],
        ['electronAPI.appVersion', bridge && bridge.appVersion === SENTINEL.version, bridge && bridge.appVersion],
        ['electronAPI.platform', !!(bridge && bridge.apiPlatform), bridge && bridge.apiPlatform],
        [
            'electronAPI.customUi.apply withheld off the dev channel',
            bridge && bridge.customUiApply === 'undefined',
            bridge && bridge.customUiApply,
        ],
        ['electronAPI.loginItem.get', bridge && bridge.loginItemGet === 'function', bridge && bridge.loginItemGet],
        ['electronAPI.loginItem.set', bridge && bridge.loginItemSet === 'function', bridge && bridge.loginItemSet],
        ['App->Web round trip (utf8ToBase64)', received === PROBE, received],
        ['Web->App postMessage reaches main', toApp === PROBE, toApp],
        ['Web->App invoke round trip', invoked === JSON.stringify(INVOKE_SENTINEL), invoked],
    ];

    return { checks, preloadErrors };
};

const report = (title, checks, preloadErrors) => {
    console.log(`\n=== ${title} ===`);
    for (const [name, passed, actual] of checks) {
        console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${passed ? '' : `  -> ${JSON.stringify(actual)}`}`);
    }
    if (preloadErrors.length) console.log('preload-error:', JSON.stringify(preloadErrors));
};

const run = async () => {
    if (!existsSync(PRELOAD)) {
        console.error(
            `sandbox smoke: no preload at ${PRELOAD}\nRun \`yarn build\` first (or use \`yarn test:sandbox\`).`
        );
        return 1;
    }

    ipcMain.handle(LOGIN_ITEM_CHANNEL, () => INVOKE_SENTINEL);

    const armed = await probe(true);
    report('ARMED — everything must pass', armed.checks, armed.preloadErrors);

    const control = await probe(false);
    report('CONTROL — argument-derived checks must FAIL', control.checks, control.preloadErrors);

    const names = new Set(armed.checks.map(([name]) => name));
    const orphaned = [...ARGUMENT_DERIVED].filter(name => !names.has(name));

    const armedFailures = armed.checks.filter(([, passed]) => !passed).map(([name]) => name);
    const vacuous = control.checks
        .filter(([name, passed]) => passed && ARGUMENT_DERIVED.has(name))
        .map(([name]) => name);

    console.log('');
    if (armedFailures.length) console.log(`FAILED (armed): ${armedFailures.join(', ')}`);
    if (armed.preloadErrors.length) console.log('FAILED (armed): preload threw');
    if (vacuous.length) console.log(`FAILED (vacuous assertions — they pass without arguments): ${vacuous.join(', ')}`);
    if (orphaned.length) console.log(`FAILED (ARGUMENT_DERIVED names no check has — renamed?): ${orphaned.join(', ')}`);

    const ok =
        armedFailures.length === 0 && armed.preloadErrors.length === 0 && vacuous.length === 0 && orphaned.length === 0;
    console.log(ok ? 'sandbox smoke: PASS\n' : 'sandbox smoke: FAIL\n');
    return ok ? 0 : 1;
};

app.disableHardwareAcceleration();

app.on('window-all-closed', () => undefined);

app.whenReady()
    .then(run)
    .then(code => app.exit(code))
    .catch(error => {
        console.error('sandbox smoke harness error:', error);
        app.exit(2);
    });

setTimeout(() => {
    console.error('sandbox smoke: timeout');
    app.exit(3);
}, 90_000).unref();
