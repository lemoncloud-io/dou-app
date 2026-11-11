/**
 * Shows the desktop sub view: a modal over the main window, made of two `WebContentsView`s — the
 * shell's chrome (backdrop, card, bar) and, over it, the page. What it does is decided in
 * `desktopSubWebViewPolicy.ts`; this file only wires those decisions into electron.
 *
 * - The page view is as isolated as the main window (sandbox, context isolation, no Node) and runs
 *   in a session of its own per origin, with every permission request refused.
 * - Only the opened origin loads. Another https URL — a link, a redirect, a `window.open` — goes to
 *   the OS browser, and the view stays where it was.
 * - The page's messages travel a channel of their own and reach the view's own host only, and only
 *   from the view's main frame on the opened origin.
 * - An external site gets no manifest fetch and the bar always shows its host.
 * - Esc and the bar's close control close it as `user`. The main window starting a new page closes it
 *   without telling that page (`resetForNewHost`).
 */
import type { SubWebViewContext, SubWebViewDisplay } from '@chatic/bridge-messages';
import type { IAppBridgeHost } from '@chatic/bridges';
import {
    type BrowserWindow,
    ipcMain,
    type IpcMainEvent,
    session as electronSession,
    shell,
    WebContentsView,
} from 'electron';

import { createDesktopSubBridgeHost } from './desktopSubBridgeHost';
import {
    acceptsSubWebViewMessage,
    allowsSubWebViewFrame,
    barTitleOf,
    decideDesktopSubWebViewNavigation,
    displayOf,
    fetchesManifest,
    modalLayoutOf,
    partitionOf,
    readDesktopSubWebViewManifest,
    subWebViewBootOf,
    subWebViewWebPreferences,
} from './desktopSubWebViewPolicy';
import type { DesktopSubWebViewEntry, DesktopSubWebViewService } from './DesktopSubWebViewService';
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

/** How long the shell waits for a trusted page's manifest before showing it with the defaults. */
const MANIFEST_TIMEOUT_MS = 3000;
/** The most of a manifest the shell reads; a real one is a few hundred bytes. */
const MANIFEST_MAX_LENGTH = 64 * 1024;

export interface DesktopSubWebViewWindowDeps {
    /** Absolute path of the sub view's preload bundle. */
    preloadPath: string;
    appVersion: string;
    /** The app's language as the main window gets it (`ko`, `en`). */
    language: () => string;
    dark: () => boolean;
    logPageError: (report: { origin: string; message: string; stack?: string }) => void;
    logWarn: (message: string, detail?: unknown) => void;
}

/** What is on screen for the view that is showing. */
interface Shown {
    view: DesktopSubWebViewEntry;
    chrome: WebContentsView;
    page: WebContentsView | null;
    display: SubWebViewDisplay;
    host: IAppBridgeHost | null;
    titles: { requested?: string; document?: string; manifestName?: string };
    /** When this view last handed URLs to the OS browser, newest last, within the hand-off window. */
    handOffs: number[];
}

/**
 * At most this many URLs go to the OS browser per view in any window of this length. Electron has no
 * popup blocker, so a page could otherwise open browser tabs in a loop with no click; a person
 * following links stays far below it.
 */
const HAND_OFF_LIMIT = 3;
const HAND_OFF_WINDOW_MS = 10_000;

/**
 * The body as text, or `null` past `limit` bytes — refused on a declared length that is too long, and
 * otherwise read chunk by chunk and abandoned at the limit, so a page's server cannot make the shell
 * hold more than that in memory.
 */
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

/** Who sent an IPC message: its frame's URL, and whether that frame is the top one (it has no parent). */
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

// One per session: the partition outlives any one view, so its handlers are set once.
const preparedSessions = new Set<string>();
const prepareSession = (partition: string): void => {
    if (preparedSessions.has(partition)) return;
    preparedSessions.add(partition);
    const ses = electronSession.fromPartition(partition);
    // Camera, microphone, notifications, geolocation and the rest are not part of the desktop page
    // protocol yet: refused, and reported as refused when a page checks.
    ses.setPermissionRequestHandler((_webContents, _permission, callback) => callback(false));
    ses.setPermissionCheckHandler(() => false);
    ses.setDevicePermissionHandler(() => false);
    // Electron picks the first device itself when a chooser event has no listener, so each one is
    // answered with "no device".
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

/**
 * Binds the sub view to `win` for as long as the window lives. Returns the function that unbinds it,
 * which also removes a view still showing.
 */
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

    /** Runs one of the chrome's scripts; a failure is logged, since it leaves the bar or the card wrong. */
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
        // The hidden page cannot take keys; the card can, so Esc still closes it.
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

    /** A fresh host per page load, so a reload starts its error count and its title again. */
    const newHost = (current: Shown, page: WebContentsView): IAppBridgeHost =>
        createDesktopSubBridgeHost(
            message => {
                // Only while the view still shows the opened origin: a reply must not reach whatever
                // a redirect might have put in its place.
                const url = page.webContents.getURL();
                if (acceptsSubWebViewMessage({ url, isMainFrame: true }, current.view.origin)) {
                    // Encoded here, where Node is: the sandboxed preload only checks and forwards it.
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
            // Never a second window: the page's own origin opens in place, anything else per the rule.
            // A failed load is reported by `did-fail-load`, which shows the card's error.
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
        // A server redirect fires here for frames too: a frame's goes by the frame rule and never
        // reaches the OS, or an embed that redirects would open the browser on its own.
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
            // -3 is an aborted load: the navigation gate refused it, or another load replaced it.
            if (isMainFrame && errorCode !== -3) showError();
        });
        contents.on('render-process-gone', () => showError());
        contents.on('before-input-event', onEscape);
        // Bluetooth's chooser is per page, not per session; without a listener the first device wins.
        contents.on('select-bluetooth-device', (event, _devices, callback) => {
            event.preventDefault();
            callback('');
        });

        win.contentView.addChildView(page);
        layout();
        // A failed load is reported by `did-fail-load`, which shows the card's error.
        void contents.loadURL(current.view.url).catch(() => undefined);
        // Adding a view moves no focus. Without this, keys — Esc, and typing — would still go to the
        // main window's page behind the modal.
        contents.focus();
    };

    const open = (view: DesktopSubWebViewEntry) => {
        const chrome = new WebContentsView({
            webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false, javascript: true },
        });
        const current: Shown = { view, chrome, page: null, display: 'standard', host: null, titles: {}, handOffs: [] };
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
        // The card holds the keys while a trusted page's manifest is read; the page takes them after.
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

        // A page that could not be put up leaves the card with its error and close control, never an
        // empty card with nothing said.
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
            // A destroyed window (the detach on `closed`) has no content view left to remove from, but
            // the views' own contents still have to be closed.
            if (!win.isDestroyed()) win.contentView.removeChildView(view);
            if (!view.webContents.isDestroyed()) view.webContents.close();
        }
        // Back to the main window's page, so typing lands where the user was.
        if (!win.isDestroyed()) win.webContents.focus();
    };

    const onMessage = (event: IpcMainEvent, data: unknown) => {
        const page = shown?.page;
        if (!shown || !page || event.sender !== page.webContents || typeof data !== 'string') return;
        if (!acceptsSubWebViewMessage(senderOf(event), shown.view.origin)) return;
        void shown.host?.handleMessage(data);
    };

    // The preload asks for its boot data over IPC rather than reading it from the command line, where
    // the context — the cloud, the place and the user's names — would be readable by any process on
    // the machine, and a 16 KiB `params` could pass Windows' command-line limit. Answered for the page
    // view's main frame only, and only while it is on the opened origin.
    const bootFor = (event: IpcMainEvent) => {
        const page = shown?.page;
        if (!shown || !page || event.sender !== page.webContents) return null;
        if (!acceptsSubWebViewMessage(senderOf(event), shown.view.origin)) return null;
        return subWebViewBootOf(contextOf(shown.view), shown.view.origin);
    };
    // Set exactly once: Electron sends the reply on the first assignment and drops any later one, and a
    // reply never set would hang the page's renderer in `sendSync`.
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
