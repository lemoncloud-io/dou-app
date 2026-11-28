import type { SubWebViewContext, SubWebViewDisplay } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
import {
    acceptsSubWebViewMessage,
    allowsSubWebViewFrame,
    barTitleOf,
    decideDesktopSubWebViewNavigation,
    displayOf,
    fetchesManifest,
    readDesktopSubWebViewManifest,
} from '@chatic/mini-app-host';
import {
    type BrowserWindow,
    ipcMain,
    type IpcMainEvent,
    session as electronSession,
    shell,
    WebContentsView,
} from 'electron';

import { createDesktopSubBridgeHost } from './desktopSubBridgeHost';
import type { DesktopSubWebViewEntry, DesktopSubWebViewService } from './DesktopSubWebViewService';
import { modalLayoutOf, partitionOf, subWebViewBootOf, subWebViewWebPreferences } from './desktopSubWebViewSetup';
import {
    buildSubWebViewChromeHtml,
    chromeDataUrl,
    chromeErrorScript,
    chromeLayoutScript,
    chromeTitleScript,
    subWebViewChromeLabels,
} from './subWebViewChrome';
import {
    SUB_WEBVIEW_BOOT_CHANNEL,
    SUB_WEBVIEW_CLOSE_URL,
    SUB_WEBVIEW_TO_APP_CHANNEL,
    SUB_WEBVIEW_TO_WEB_CHANNEL,
} from './subWebViewContract';

const MANIFEST_TIMEOUT_MS = 3000;
const MANIFEST_MAX_LENGTH = 64 * 1024;

export interface DesktopSubWebViewWindowDeps {
    preloadPath: string;
    appVersion: string;
    language: () => string;
    dark: () => boolean;
    logPageError: (report: { origin: string; message: string; stack?: string }) => void;
    logWarn: (message: string, detail?: unknown) => void;
}

interface Shown {
    view: DesktopSubWebViewEntry;
    chrome: WebContentsView;
    page: WebContentsView | null;
    display: SubWebViewDisplay;
    host: IAppBridgeHost | null;
    titles: { requested?: string; document?: string; manifestName?: string };
    handOffs: number[];
}

const HAND_OFF_LIMIT = 3;
const HAND_OFF_WINDOW_MS = 10_000;

const readCapped = async (response: Response, limit: number): Promise<string | null> => {
    if (Number(response.headers.get('content-length')) > limit) return null;
    const reader = response.body?.getReader();
    if (!reader) return null;
    const chunks: Uint8Array[] = [];
    let size = 0;
    for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > limit) {
            void reader.cancel().catch(() => undefined);
            return null;
        }
        chunks.push(value);
    }
    return Buffer.concat(chunks).toString('utf8');
};

const senderOf = (event: IpcMainEvent) => ({
    url: event.senderFrame?.url,
    isMainFrame: event.senderFrame?.parent === null,
});

const fetchManifest = async (partition: string, origin: string): Promise<unknown> => {
    const response = await electronSession.fromPartition(partition).fetch(`${origin}/.well-known/chatic-app.json`, {
        redirect: 'error',
        signal: AbortSignal.timeout(MANIFEST_TIMEOUT_MS),
    });
    if (!response.ok) return null;
    const text = await readCapped(response, MANIFEST_MAX_LENGTH);
    return text === null ? null : JSON.parse(text);
};

const preparedSessions = new Set<string>();
const prepareSession = (partition: string): void => {
    if (preparedSessions.has(partition)) return;
    preparedSessions.add(partition);
    const ses = electronSession.fromPartition(partition);
    ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.setDevicePermissionHandler(() => false);
    ses.on('select-hid-device', (event, _details, callback) => {
        event.preventDefault();
        callback(null);
    });
    ses.on('select-usb-device', (event, _details, callback) => {
        event.preventDefault();
        callback();
    });
    ses.on('select-serial-port', (event, _ports, _webContents, callback) => {
        event.preventDefault();
        callback('');
    });
    ses.on('will-download', (_event, item) => item.cancel());
};

export const attachDesktopSubWebView = (
    win: BrowserWindow,
    service: DesktopSubWebViewService,
    deps: DesktopSubWebViewWindowDeps
): (() => void) => {
    let shown: Shown | null = null;

    const contentSize = () => {
        const [width, height] = win.getContentSize();
        return { width, height };
    };

    const runInChrome = (chrome: WebContentsView, what: string, script: string) => {
        void chrome.webContents
            .executeJavaScript(script)
            .catch(error => deps.logWarn(`sub webview chrome ${what} failed`, String(error)));
    };

    const showTitle = () => {
        if (!shown) return;
        runInChrome(shown.chrome, 'title', chromeTitleScript(barTitleOf(shown.view, shown.titles)));
    };

    const layout = () => {
        if (!shown) return;
        const { card, page } = modalLayoutOf(contentSize(), shown.display);
        shown.chrome.setBounds({ x: 0, y: 0, ...contentSize() });
        runInChrome(shown.chrome, 'layout', chromeLayoutScript(card));
        shown.page?.setBounds(page);
    };

    const showError = () => {
        if (!shown) return;
        shown.page?.setVisible(false);
        const message = subWebViewChromeLabels(deps.language()).loadFailed;
        runInChrome(shown.chrome, 'error', chromeErrorScript(message));
        shown.chrome.webContents.focus();
    };

    const closeByUser = () => {
        if (shown) service.close(shown.view.viewId, 'user');
    };

    const onEscape = (event: Electron.Event, input: Electron.Input) => {
        if (input.type === 'keyDown' && input.key === 'Escape') {
            event.preventDefault();
            closeByUser();
        }
    };

    const contextOf = (view: DesktopSubWebViewEntry): SubWebViewContext => ({
        protocolVersion: 1,
        viewId: view.viewId,
        platform: 'desktop',
        appVersion: deps.appVersion,
        locale: deps.language(),
        theme: deps.dark() ? 'dark' : 'light',
        params: view.params,
    });

    const newHost = (current: Shown, page: WebContentsView): IAppBridgeHost =>
        createDesktopSubBridgeHost(
            message => {
                const url = page.webContents.getURL();
                if (acceptsSubWebViewMessage({ url, isMainFrame: true }, current.view.origin)) {
                    page.webContents.send(SUB_WEBVIEW_TO_WEB_CHANNEL, Buffer.from(message, 'utf8').toString('base64'));
                }
            },
            {
                service,
                viewId: current.view.viewId,
                origin: current.view.origin,
                getContext: () => contextOf(current.view),
                setTitle: title => {
                    current.titles.requested = title;
                    showTitle();
                },
                logPageError: deps.logPageError,
            }
        );

    const handOn = (current: Shown, url: string, decision: 'load' | 'external' | 'block') => {
        if (decision !== 'external') return;
        const now = Date.now();
        current.handOffs = current.handOffs.filter(at => now - at < HAND_OFF_WINDOW_MS);
        if (current.handOffs.length >= HAND_OFF_LIMIT) {
            deps.logWarn('openExternal dropped: too many in a row', url);
            return;
        }
        current.handOffs.push(now);
        void shell.openExternal(url).catch(error => deps.logWarn('openExternal failed', error));
    };

    const showPage = (current: Shown) => {
        const preferences = subWebViewWebPreferences({ preload: deps.preloadPath, origin: current.view.origin });
        prepareSession(preferences.partition);
        const page = new WebContentsView({ webPreferences: preferences });
        current.page = page;
        current.host = newHost(current, page);
        const contents = page.webContents;
        const origin = current.view.origin;

        contents.setWindowOpenHandler(({ url }) => {
            const decision = decideDesktopSubWebViewNavigation(url, origin);
            if (decision === 'load') void contents.loadURL(url).catch(() => undefined);
            else handOn(current, url, decision);
            return { action: 'deny' };
        });
        const gateTopLevel = (event: Electron.Event, url: string) => {
            const decision = decideDesktopSubWebViewNavigation(url, origin);
            if (decision === 'load') return;
            event.preventDefault();
            handOn(current, url, decision);
        };
        contents.on('will-navigate', (event, url) => gateTopLevel(event, url));
        contents.on('will-redirect', details => {
            if (details.isMainFrame) gateTopLevel(details, details.url);
            else if (!allowsSubWebViewFrame(details.url)) details.preventDefault();
        });
        contents.on('will-frame-navigate', event => {
            if (!event.isMainFrame && !allowsSubWebViewFrame(event.url)) event.preventDefault();
        });
        contents.on('did-start-navigation', details => {
            if (details.isMainFrame && !details.isSameDocument && shown === current && contents.getURL()) {
                current.host = newHost(current, page);
                current.titles = { manifestName: current.titles.manifestName };
                showTitle();
            }
        });
        contents.on('page-title-updated', (_event, title) => {
            current.titles.document = title;
            showTitle();
        });
        contents.on('did-fail-load', (_event, errorCode, _description, _url, isMainFrame) => {
            if (isMainFrame && errorCode !== -3) showError();
        });
        contents.on('render-process-gone', () => showError());
        contents.on('before-input-event', onEscape);
        contents.on('select-bluetooth-device', (event, _devices, callback) => {
            event.preventDefault();
            callback('');
        });

        win.contentView.addChildView(page);
        layout();
        void contents.loadURL(current.view.url).catch(() => undefined);
        contents.focus();
    };

    const open = (view: DesktopSubWebViewEntry) => {
        const chrome = new WebContentsView({
            webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: true },
        });
        const current: Shown = { view, chrome, page: null, display: 'titled', host: null, titles: {}, handOffs: [] };
        shown = current;
        chrome.setBackgroundColor('#00000000');
        chrome.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
        chrome.webContents.on('will-navigate', (event, url) => {
            event.preventDefault();
            if (url === SUB_WEBVIEW_CLOSE_URL) closeByUser();
        });
        chrome.webContents.on('before-input-event', onEscape);
        const { card } = modalLayoutOf(contentSize(), current.display);
        win.contentView.addChildView(chrome);
        chrome.setBounds({ x: 0, y: 0, ...contentSize() });
        chrome.webContents.focus();
        void chrome.webContents
            .loadURL(
                chromeDataUrl(
                    buildSubWebViewChromeHtml({
                        dark: deps.dark(),
                        language: deps.language(),
                        card,
                        title: barTitleOf(view, current.titles),
                    })
                )
            )
            .catch(error => deps.logWarn('sub webview chrome failed to load', String(error)));

        const showPageOrError = () => {
            if (shown !== current) return;
            try {
                showPage(current);
            } catch (error) {
                deps.logWarn('sub webview page could not be shown', String(error));
                showError();
            }
        };

        if (!fetchesManifest(view.trust)) {
            showPageOrError();
            return;
        }
        const partition = partitionOf(view.origin);
        prepareSession(partition);
        void fetchManifest(partition, view.origin)
            .catch(error => {
                deps.logWarn('sub webview manifest unavailable', { origin: view.origin, error: String(error) });
                return null;
            })
            .then(json => {
                if (shown !== current) return;
                const manifest = readDesktopSubWebViewManifest(json);
                current.display = displayOf(view.trust, manifest);
                current.titles.manifestName = manifest.name;
                showTitle();
                showPageOrError();
            });
    };

    const remove = () => {
        if (!shown) return;
        const { chrome, page } = shown;
        shown = null;
        for (const view of [page, chrome]) {
            if (!view) continue;
            if (!win.isDestroyed()) win.contentView.removeChildView(view);
            if (!view.webContents.isDestroyed()) view.webContents.close();
        }
        if (!win.isDestroyed()) win.webContents.focus();
    };

    const onMessage = (event: IpcMainEvent, data: unknown) => {
        const page = shown?.page;
        if (!shown || !page || event.sender !== page.webContents || typeof data !== 'string') return;
        if (!acceptsSubWebViewMessage(senderOf(event), shown.view.origin)) return;
        void shown.host?.handleMessage(data);
    };

    const bootFor = (event: IpcMainEvent) => {
        const page = shown?.page;
        if (!shown || !page || event.sender !== page.webContents) return null;
        if (!acceptsSubWebViewMessage(senderOf(event), shown.view.origin)) return null;
        return subWebViewBootOf(contextOf(shown.view), shown.view.origin);
    };
    const onBoot = (event: IpcMainEvent) => {
        let boot: ReturnType<typeof bootFor> = null;
        try {
            boot = bootFor(event);
        } catch (error) {
            deps.logWarn('sub webview boot failed', String(error));
        }
        event.returnValue = boot;
    };

    const onMainNavigation = (details: { isMainFrame: boolean; isSameDocument: boolean }) => {
        if (details.isMainFrame && !details.isSameDocument) service.resetForNewHost();
    };

    const unsubscribe = service.subscribe(event => {
        if (event.type === 'opened') open(event.view);
        else remove();
    });
    ipcMain.on(SUB_WEBVIEW_TO_APP_CHANNEL, onMessage);
    ipcMain.on(SUB_WEBVIEW_BOOT_CHANNEL, onBoot);
    win.webContents.on('did-start-navigation', onMainNavigation);
    win.on('resize', layout);

    return () => {
        unsubscribe();
        ipcMain.removeListener(SUB_WEBVIEW_TO_APP_CHANNEL, onMessage);
        ipcMain.removeListener(SUB_WEBVIEW_BOOT_CHANNEL, onBoot);
        if (!win.isDestroyed()) {
            win.webContents.removeListener('did-start-navigation', onMainNavigation);
            win.removeListener('resize', layout);
        }
        service.resetForNewHost();
        remove();
    };
};
