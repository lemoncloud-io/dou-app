import { app, type BrowserWindow, powerMonitor } from 'electron';
import { disableCustomUi } from './customUiBundle';
import { reloadForCustomUiChange } from './menus';
import { isCustomUiActive, isCustomUiUrl, isTrustedUrl, resolveWebUrl } from './webUrl';

const ERROR_STRINGS = {
    ko: { title: '연결할 수 없습니다', body: '데스크톱 웹을 불러오지 못했습니다.', retry: '다시 시도' },
    en: { title: 'Unable to connect', body: 'The desktop web could not be loaded.', retry: 'Retry' },
} as const;

const renderErrorHtml = (code: number, desc: string): string => {
    const sanitize = (value: string): string => String(value).replace(/[<>"]/g, '');
    const target = sanitize(resolveWebUrl());
    const safeDesc = sanitize(desc);
    const lang = app.getLocale().startsWith('ko') ? 'ko' : 'en';
    const strings = ERROR_STRINGS[lang];
    return `<!doctype html><html lang="${lang}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>
  html,body{margin:0;height:100%;background:#0b0d10;color:#e6e8eb;font-family:-apple-system,BlinkMacSystemFont,system-ui,sans-serif}
  .wrap{height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:32px;box-sizing:border-box;text-align:center}
  h1{font-size:17px;margin:0;font-weight:600}
  p{font-size:13px;line-height:1.6;color:#7a8089;margin:0;max-width:380px;word-break:break-all}
  code{color:#9aa0a6}
  a{margin-top:8px;display:inline-block;padding:10px 22px;border-radius:8px;background:#8fbf2e;color:#0b0d10;font-weight:600;font-size:14px;text-decoration:none}
</style></head><body><div class="wrap">
  <h1>${strings.title}</h1>
  <p>${strings.body}<br><code>${target}</code><br>(${code} ${safeDesc})</p>
  <a href="${target}">${strings.retry}</a>
</div></body></html>`;
};

const fallbackToRemoteWeb = (win: BrowserWindow, reason: string): void => {
    console.warn('[shell] custom UI failed, falling back to remote web', reason);
    disableCustomUi();
    reloadForCustomUiChange(win);
};

const bundleFailed = (url?: string): boolean => (url === undefined ? isCustomUiActive() : isCustomUiUrl(url));

let recoveryWindow: BrowserWindow | null = null;
let onErrorPage = false;
let resetLoadRetries: () => void = () => undefined;
let powerResumeBound = false;

const reloadWeb = (win: BrowserWindow): void => {
    if (!win.isDestroyed()) void win.loadURL(resolveWebUrl());
};

const showErrorPage = (win: BrowserWindow, code: number, desc: string): void => {
    if (win.isDestroyed()) return;
    onErrorPage = true;
    if (!win.isVisible()) win.show();
    void win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(renderErrorHtml(code, desc))}`);
};

const recoverFromHang = (win: BrowserWindow): void => {
    if (bundleFailed()) {
        fallbackToRemoteWeb(win, 'renderer unresponsive');
        return;
    }
    reloadWeb(win);
};

const bindPowerResume = (): void => {
    if (powerResumeBound) return;
    powerResumeBound = true;
    powerMonitor.on('resume', () => {
        if (!onErrorPage || !recoveryWindow || recoveryWindow.isDestroyed()) return;
        resetLoadRetries();
        void recoveryWindow.loadURL(resolveWebUrl());
    });
};

export const bindLoadRecovery = (win: BrowserWindow): void => {
    recoveryWindow = win;
    onErrorPage = false;

    const RETRYABLE_LOAD_ERRORS = new Set([-102, -106, -105, -118]);
    const RETRY_DELAYS_MS = [1000, 2000, 4000, 8000, 15000, 15000, 15000, 15000];
    let loadRetries = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let unresponsiveTimer: ReturnType<typeof setTimeout> | undefined;
    const CRASH_RELOAD_LIMIT = 3;
    const CRASH_RELOAD_DELAY_MS = 1000;
    let crashReloads = 0;
    let crashTimer: ReturnType<typeof setTimeout> | undefined;
    resetLoadRetries = () => {
        loadRetries = 0;
    };
    win.webContents.on('did-fail-load', (_event, errorCode, errorDesc, validatedURL, isMainFrame) => {
        if (errorCode === -3) return;
        if (!isMainFrame || !isTrustedUrl(validatedURL)) return;
        if (bundleFailed(validatedURL)) {
            fallbackToRemoteWeb(win, `load failed (${errorCode} ${errorDesc})`);
            return;
        }
        if (RETRYABLE_LOAD_ERRORS.has(errorCode) && loadRetries < RETRY_DELAYS_MS.length) {
            const delay = RETRY_DELAYS_MS[loadRetries];
            loadRetries += 1;
            if (retryTimer) clearTimeout(retryTimer);
            retryTimer = setTimeout(() => reloadWeb(win), delay);
            return;
        }
        showErrorPage(win, errorCode, errorDesc);
    });
    win.webContents.on('did-finish-load', () => {
        if (isTrustedUrl(win.webContents.getURL())) {
            loadRetries = 0;
            if (!isCustomUiActive()) crashReloads = 0;
            onErrorPage = false;
        }
    });
    win.webContents.on('render-process-gone', (_event, details) => {
        if (details.reason === 'clean-exit') return;
        console.warn('[shell] renderer process gone', details);
        if (crashReloads < CRASH_RELOAD_LIMIT) {
            crashReloads += 1;
            loadRetries = 0;
            if (crashTimer) clearTimeout(crashTimer);
            crashTimer = setTimeout(() => reloadWeb(win), CRASH_RELOAD_DELAY_MS);
            return;
        }
        if (bundleFailed()) {
            crashReloads = 0;
            fallbackToRemoteWeb(win, `renderer ${details.reason}`);
            return;
        }
        showErrorPage(win, 0, `renderer ${details.reason}`);
    });
    win.webContents.on('unresponsive', () => {
        console.warn('[shell] renderer unresponsive');
        if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
        unresponsiveTimer = setTimeout(() => recoverFromHang(win), 15_000);
    });
    win.webContents.on('responsive', () => {
        if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
        unresponsiveTimer = undefined;
    });
    win.on('closed', () => {
        if (retryTimer) clearTimeout(retryTimer);
        if (unresponsiveTimer) clearTimeout(unresponsiveTimer);
        if (crashTimer) clearTimeout(crashTimer);
    });

    bindPowerResume();
};
