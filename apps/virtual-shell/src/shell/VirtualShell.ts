import {
    bootHandlers,
    dispatchTarget,
    FAKE_SHELL_APP_VERSION,
    FAKE_SHELL_CACHE_TYPES,
    MemoryCache,
    ShellCore,
    type AppInjectionParams,
    type ShellPlatform,
    type ShellTraffic,
} from '@chatic/fake-shell';
import type { AppBackgroundStatus, AppMessageDataMap } from '@chatic/app-messages';

import { appStageFor, type ShellConfig } from './config';
import { APP_EVENT_TYPES, isAppEventType } from './appEvents';
import {
    DEFAULT_DEVICE_ID,
    DEFAULT_KEYBOARD_HEIGHT,
    DEVICE_PRESETS,
    findDevice,
    type DevicePreset,
    type Insets,
} from './devices';
import { redactCredentials } from './redact';
import { LogStore, type LogEntry, type LogFilter, type LogSource } from './logStore';
import { shellHandlers, storedTheme, type ShellStorage, type SignInDriver, type ThemeMode } from './shellHandlers';

export type ToolError =
    | 'INVALID_INPUT'
    | 'UNRESOLVED'
    | 'PLATFORM_MISMATCH'
    | 'NATIVE_ROUTE'
    | 'TIMEOUT'
    | 'PROD_BLOCKED';

export type ToolSuccess = { ok: true; sent: string[]; queued?: boolean };
export type ToolFailure = { ok: false; error: ToolError; message: string };

/** Every tool answers with this, so an agent reads one shape whatever it called. */
export type ToolResult<T extends object = object> = (ToolSuccess & T) | ToolFailure;

/** Who called a tool. The two are otherwise indistinguishable in the log, on purpose. */
export type Caller = 'panel' | 'api';

export interface ShellStatus {
    env: ShellConfig['env'];
    platform: ShellPlatform;
    device: string;
    theme: 'light' | 'dark';
    handshake: 'pending' | 'ready';
    capabilities: string[];
    appState: AppBackgroundStatus;
    /** What the web last reported with `SetCanGoBack` — whether an overlay is open. */
    webCanGoBack: boolean | null;
    /** Whether the frame's own history has an entry behind this one. */
    historyCanGoBack: boolean;
    /** The frame's pathname and search as the web left them — the web rewrites some (a room drops its query). */
    path: string;
    /** The app was closed by Android back on its first screen; a relaunch (or a tap, or a link) opens it. */
    exited: boolean;
    /** The keyboard's height in CSS pixels; 0 while it is down. */
    keyboardHeight: number;
    /** What the web last set the app icon's badge to (`SetBadgeCount`); `null` before it has. */
    badge: number | null;
}

/** The shell's stored state, as `storage()` shows it: read-only, credentials masked. */
export interface ShellStorageView {
    cache: Array<{ domain: string; cloud?: string; count: number; rows: unknown[] }>;
    configBag: Record<string, unknown>;
    preferences: Record<string, unknown>;
}

export interface PushNotificationInput {
    title?: string;
    body?: string;
    data?: Record<string, unknown>;
}

export interface NotificationCard extends PushNotificationInput {
    id: number;
    at: string;
}

export interface Toast {
    id: number;
    /** The message type it is about; the page words it in its own language. */
    type: string;
    /** The same in English, as the log records it. */
    text: string;
}

export type LaunchMode = 'warm' | 'cold';

/** A room the app has cached, as a push about it addresses it. */
export interface KnownRoom {
    channelId: string;
    /** `#` for the relay, else the cloud id. */
    cid: string;
    sid: string;
    /** Empty when the app stored none (a self chat, a one-to-one room). */
    name: string;
    relay: boolean;
    /** What kind of room it is, for a label when it has no name: `U:<uid>` is the self chat, `<uid>@<uid>` one-to-one. */
    kind: 'self' | 'direct' | 'group';
    /** When the app last saved it — the panel lists recently active rooms first. */
    updatedAt: number;
}

type PushNavigationData = Record<string, unknown>;
type DeepLinkResolution =
    | { kind: 'web'; path: string }
    | { kind: 'native'; state: unknown }
    | { kind: 'invalid'; error: string };

/** The mobile app's own code the shell runs, handed in so tests can call it the same way. */
export interface MobileModules {
    getSyncInjectionScript: (params: AppInjectionParams) => string;
    /** The script the app re-injects when the keyboard's height changes. */
    getSafeAreaScript: (insets: Insets, keyboardHeight: number) => string;
    resolvePushTapPath: (data: PushNavigationData | undefined | null) => string | null;
    resolveDeepLink: (url: string) => DeepLinkResolution;
}

/** The window inside the frame, as far as the shell touches it. */
type FrameWindow = Window & typeof globalThis & { ReactNativeWebView?: { postMessage: (raw: string) => void } };

const TOAST_MS = 3_000;
/** The key every web app on this origin keeps its theme under (see `index.html`'s pre-paint script). */
const WEB_THEME_KEY = 'vite-ui-theme';

const safeLocalStorage = (): Storage | null => {
    try {
        return globalThis.localStorage ?? null;
    } catch {
        return null;
    }
};
const DEFAULT_WAIT_MS = 10_000;
const CONSOLE_LEVELS = ['log', 'info', 'warn', 'error'] as const;

const statusPayload = (status: AppBackgroundStatus): AppMessageDataMap['OnBackgroundStatusChanged'] => ({
    status,
    isBackground: status === 'background',
    isForeground: status === 'active',
});

/**
 * The virtual shell: what the mobile app is to the web, run in the page that holds the web in an iframe.
 *
 * The bridge is `@chatic/fake-shell`'s `ShellCore` — the app's own `AppBridgeHost` with typed
 * handlers — and the transport is the frame, which shares this page's origin: the frame's
 * `ReactNativeWebView.postMessage` calls straight in here, and a reply is dispatched on the frame's
 * `window` (iOS) or `document` (Android) as react-native-webview does. Every tool is one method here;
 * the panel and `window.virtualShell` call the same ones.
 */
export class VirtualShell {
    readonly logs = new LogStore();
    readonly cache = new MemoryCache();
    private readonly core: ShellCore;
    private readonly storage: ShellStorage = { configBag: {}, preferences: new Map() };
    private device: DevicePreset = findDevice(DEFAULT_DEVICE_ID) as DevicePreset;
    private platform: ShellPlatform = this.device.platform;
    private deviceTheme: 'light' | 'dark' = 'light';
    private appState: AppBackgroundStatus = 'active';
    private handshake: 'pending' | 'ready' = 'pending';
    private capabilities: string[] = [];
    private webCanGoBack: boolean | null = null;
    private frameWindow: FrameWindow | null = null;
    /**
     * Which launch is current. Every relaunch takes the next number and the page draws a new frame
     * carrying it; only that frame may attach, and posts from an older one are dropped — the page of a
     * killed app cannot reach the next launch's bridge or make it stop holding events.
     */
    private launch = 1;
    /** Reported once per launch: a frame that navigated off this origin can no longer be read. */
    private leftOrigin = false;
    private exited = false;
    private keyboardHeight = 0;
    private badge: number | null = null;
    /** The user the page last asked its cache about — who is signed in, as far as the shell can tell. */
    private userId: string | null = null;
    private readonly toastedTypes = new Set<string>();
    private toastList: Toast[] = [];
    private notificationList: NotificationCard[] = [];
    private nextId = 1;
    private readonly changeListeners = new Set<() => void>();

    constructor(
        readonly config: ShellConfig,
        private readonly mobile: MobileModules,
        private readonly signIn: SignInDriver,
        /** This page's storage, which is the web's too — the frame shares this origin. */
        private readonly webStorage: Pick<Storage, 'setItem'> | null = safeLocalStorage()
    ) {
        this.core = new ShellCore({
            transport: { deliver: raw => this.deliver(raw) },
            supportedCacheTypes: [...FAKE_SHELL_CACHE_TYPES],
            // The log below is the bounded record; the core keeping its own copy would grow for hours.
            retainTraffic: false,
        });
        this.registerHandlers();
        this.core.observe(traffic => this.record(traffic));
        this.pushLaunchState();
    }

    // ------------------------------------------------------------------ frame

    /** The launch the page should draw a frame for; the frame carries it back to `attach`. */
    get launchId(): number {
        return this.launch;
    }

    /**
     * Called by `inject.js` from inside the frame, before any of the web's own scripts run: what
     * react-native-webview does before content loads. The web decides once, while its entry module
     * is evaluated, whether it runs inside the app — so this has to be done by the time it returns.
     * A frame of an earlier launch, still loading while the page swaps it out, is turned away.
     */
    attach(frame: Window, launch: number | string | null): boolean {
        if (Number(launch) !== this.launch) {
            this.logs.append({ source: 'lifecycle', type: 'stale-frame', data: { launch, current: this.launch } });
            return false;
        }
        const win = frame as FrameWindow;
        const own = this.launch;
        this.frameWindow = win;
        this.handshake = 'pending';
        this.capabilities = [];
        this.leftOrigin = false;
        win.ReactNativeWebView = {
            postMessage: (raw: string) => {
                if (own === this.launch) void this.core.receive(String(raw));
            },
        };
        this.wrapConsole(win);
        // Indirect eval on the frame's own `eval`: the script is the app's own text, run in the frame's
        // global scope as the WebView runs it.
        win.eval(this.mobile.getSyncInjectionScript(this.injectionParams()));
        this.logs.append({ source: 'lifecycle', type: 'attach', data: { path: this.framePath(win) } });
        this.emit();
        return true;
    }

    // ------------------------------------------------------------------ state

    status(): ShellStatus {
        const win = this.liveFrame();
        return {
            env: this.config.env,
            platform: this.platform,
            device: this.device.id,
            theme: this.injectedTheme() === 'dark' ? 'dark' : 'light',
            handshake: this.handshake,
            capabilities: [...this.capabilities],
            appState: this.appState,
            webCanGoBack: this.webCanGoBack,
            historyCanGoBack: win ? this.historyCanGoBack(win) : false,
            path: win ? this.framePath(win) : '',
            exited: this.exited,
            keyboardHeight: this.keyboardHeight,
            badge: this.badge,
        };
    }

    get currentDevice(): DevicePreset {
        return this.device;
    }

    get hasExited(): boolean {
        return this.exited;
    }

    get toasts(): readonly Toast[] {
        return this.toastList;
    }

    get notifications(): readonly NotificationCard[] {
        return this.notificationList;
    }

    /** For the panel: called on every change to what it draws (log lines have their own subscription). */
    onChange(listener: () => void): () => void {
        this.changeListeners.add(listener);
        return () => this.changeListeners.delete(listener);
    }

    readLogs(filter?: LogFilter): LogEntry[] {
        return this.logs.query(filter);
    }

    clearLogs(): void {
        this.logs.clear();
        this.emit();
    }

    /**
     * What the shell keeps for the app — its cache by domain and cloud, the settings bag it injects at
     * boot, the older preferences — to read, not to edit. Masked as the log is: a row can hold a token.
     */
    storageView(): ShellStorageView {
        const groups = new Map<string, { domain: string; cloud?: string; rows: unknown[] }>();
        for (const type of FAKE_SHELL_CACHE_TYPES) {
            for (const { cid, row } of this.cache.entries(type)) {
                const key = `${type}|${cid}`;
                const group = groups.get(key) ?? { domain: type, ...(cid ? { cloud: cid } : {}), rows: [] };
                group.rows.push(row);
                groups.set(key, group);
            }
        }
        const decode = (raw: string): unknown => {
            try {
                return JSON.parse(raw);
            } catch {
                return raw;
            }
        };
        return redactCredentials({
            cache: [...groups.values()].map(group => ({ ...group, count: group.rows.length })),
            configBag: Object.fromEntries(
                Object.entries(this.storage.configBag).map(([key, raw]) => [key, decode(raw)])
            ),
            preferences: Object.fromEntries(this.storage.preferences),
        }) as ShellStorageView;
    }

    deviceList(): Array<Pick<DevicePreset, 'id' | 'platform' | 'width' | 'height'> & { insets: Insets }> {
        return DEVICE_PRESETS.map(({ id, platform, width, height, insets }) => ({
            id,
            platform,
            width,
            height,
            insets,
        }));
    }

    /**
     * The rooms the app has stored in its cache so far — what the push panel offers instead of asking
     * for ids. A relay room is stored under the `default` scope and marked `#` in a push, as the server
     * marks it; a cloud room carries its cloud. Rooms appear once the app has listed them.
     */
    knownRooms(): KnownRoom[] {
        const rooms = new Map<string, KnownRoom>();
        for (const { cid: scope, row } of this.cache.entries('channel')) {
            const channelId = String(row.id);
            const stored = typeof row['cid'] === 'string' ? (row['cid'] as string) : scope;
            const relay = stored === 'default' || stored === '#';
            const sid = typeof row['sid'] === 'string' ? (row['sid'] as string) : '';
            const name = typeof row['name'] === 'string' && row['name'] ? (row['name'] as string) : '';
            const kind = channelId.startsWith('U:') ? 'self' : channelId.includes('@') ? 'direct' : 'group';
            const updatedAt = typeof row['updatedAt'] === 'number' ? (row['updatedAt'] as number) : 0;
            rooms.set(`${stored}|${channelId}`, {
                channelId,
                cid: relay ? '#' : stored,
                sid,
                name,
                relay,
                kind,
                updatedAt,
            });
        }
        return [...rooms.values()].sort((a, b) => b.updatedAt - a.updatedAt || a.name.localeCompare(b.name));
    }

    /**
     * The signed-in user's id, as the page's own cache requests carry it (every one names its user);
     * `null` before the page has asked anything. What a push "from me" sets as its sender.
     */
    signedInUserId(): string | null {
        return this.userId;
    }

    /** Where a tap with this data would go — the same function the tool calls, so the same answer. */
    previewPushTap(data: Record<string, unknown>): string | null {
        return this.mobile.resolvePushTapPath(data);
    }

    /** What a link would resolve to, without opening it. */
    previewDeeplink(url: string): DeepLinkResolution {
        return this.mobile.resolveDeepLink(url.trim());
    }

    // ------------------------------------------------------------------ tools

    /** A push arriving while the app runs: the in-app banner, or the notification centre if it is away. */
    async pushReceive(input: PushNotificationInput, by: Caller): Promise<ToolResult> {
        return this.tool('push.receive', input, by, () => {
            if (!input || typeof input !== 'object' || (!input.title && !input.body && !input.data)) {
                return this.invalid('give at least one of title, body or data');
            }
            if (input.data !== undefined && (typeof input.data !== 'object' || Array.isArray(input.data))) {
                return this.invalid('data must be an object');
            }
            if (this.appState !== 'active') {
                // On a device the OS shows it and the app hears nothing until it is tapped.
                this.notificationList = [
                    { ...input, id: this.nextId++, at: new Date().toISOString() },
                    ...this.notificationList,
                ];
                return this.sentResult([]);
            }
            this.core.push('OnReceiveNotification', { notification: input });
            return this.sentResult(['OnReceiveNotification']);
        });
    }

    /** A notification tapped: the app comes to the front and goes where the push points. */
    async pushTap(
        data: Record<string, unknown>,
        opts: { launch?: LaunchMode } = {},
        by: Caller
    ): Promise<ToolResult<{ path: string | null }>> {
        opts = opts ?? {};
        return this.tool('push.tap', { data, ...opts }, by, () => {
            if (!data || typeof data !== 'object' || Array.isArray(data)) return this.invalid('data must be an object');
            const launch = opts.launch ?? 'warm';
            if (launch !== 'warm' && launch !== 'cold') return this.invalid("launch must be 'warm' or 'cold'");
            const path = this.mobile.resolvePushTapPath(data);
            return { ...this.openWith(path, launch), path };
        });
    }

    /** A link opening the app: invites, the app scheme, universal links. */
    async deeplink(url: string, opts: { launch?: LaunchMode } = {}, by: Caller): Promise<ToolResult<{ path: string }>> {
        opts = opts ?? {};
        return this.tool('deeplink', { url, ...opts }, by, () => {
            if (typeof url !== 'string' || !url.trim()) return this.invalid('url must be a non-empty string');
            const launch = opts.launch ?? 'warm';
            if (launch !== 'warm' && launch !== 'cold') return this.invalid("launch must be 'warm' or 'cold'");
            const resolution = this.mobile.resolveDeepLink(url.trim());
            if (resolution.kind === 'invalid') return { ok: false, error: 'UNRESOLVED', message: resolution.error };
            if (resolution.kind === 'native') {
                return {
                    ok: false,
                    error: 'NATIVE_ROUTE',
                    message: 'the link opens a native screen of the mobile app, which the virtual shell does not have',
                };
            }
            return { ...this.openWith(resolution.path, launch), path: resolution.path };
        });
    }

    async appBackground(by: Caller): Promise<ToolResult> {
        return this.tool('app.background', {}, by, () => {
            if (this.appState === 'background') return this.sentResult([]);
            // As React Native's AppState reports it: iOS resigns active first, Android goes straight away.
            const steps: AppBackgroundStatus[] =
                this.platform === 'ios' && this.appState === 'active' ? ['inactive', 'background'] : ['background'];
            return this.sentResult(steps.map(step => this.moveTo(step)));
        });
    }

    async appForeground(by: Caller): Promise<ToolResult> {
        return this.tool('app.foreground', {}, by, () => {
            // Bringing a closed app to the front is opening it again.
            if (this.exited) return this.sentResult(this.relaunch('foreground after exit'));
            if (this.appState === 'active') return this.sentResult([]);
            return this.sentResult([this.moveTo('active')]);
        });
    }

    /** Android's system back button, judged the way the app judges it (`useWebViewNavigation`). */
    async back(by: Caller): Promise<ToolResult<{ exited?: true }>> {
        return this.tool('back', {}, by, () => {
            if (this.platform !== 'android') {
                return { ok: false, error: 'PLATFORM_MISMATCH', message: 'iOS has no system back button' };
            }
            const win = this.liveFrame();
            const navCanGoBack = win ? this.historyCanGoBack(win) : false;
            if (this.webCanGoBack || navCanGoBack) {
                this.core.push('OnBackPressed', {});
                return this.sentResult(['OnBackPressed']);
            }
            // Nothing left to go back to: Android closes the app. (The app asks for a second press within
            // a second first, with a toast; the shell closes on the first — see README.)
            this.exited = true;
            this.logs.append({ source: 'lifecycle', type: 'exit' });
            return { ...this.sentResult([]), exited: true as const };
        });
    }

    /** Quits and relaunches the app. The cache survives, as the app's SQLite does, unless asked not to. */
    async restart(opts: { clearCache?: boolean } = {}, by: Caller): Promise<ToolResult> {
        opts = opts ?? {};
        return this.tool('app.restart', opts, by, () => {
            if (opts.clearCache) this.cache.clear();
            return this.sentResult(this.relaunch(opts.clearCache ? 'restart (cache cleared)' : 'restart'));
        });
    }

    /** Becomes another phone. A relaunch: the platform, safe area and theme are fixed at boot. */
    async deviceSet(
        input: { preset?: string; platform?: ShellPlatform; theme?: 'light' | 'dark' },
        by: Caller
    ): Promise<ToolResult> {
        input = input ?? {};
        return this.tool('device.set', input, by, () => {
            const preset = input.preset === undefined ? this.device : findDevice(input.preset);
            if (!preset) {
                return this.invalid(`preset must be one of ${DEVICE_PRESETS.map(device => device.id).join(', ')}`);
            }
            if (input.platform !== undefined && input.platform !== 'ios' && input.platform !== 'android') {
                return this.invalid("platform must be 'ios' or 'android'");
            }
            if (input.theme !== undefined && input.theme !== 'light' && input.theme !== 'dark') {
                return this.invalid("theme must be 'light' or 'dark'");
            }
            this.device = preset;
            this.platform = input.platform ?? (input.preset !== undefined ? preset.platform : this.platform);
            if (input.theme) {
                this.deviceTheme = input.theme;
                this.setAppTheme(input.theme);
            }
            this.registerHandlers();
            return this.sentResult(this.relaunch('device'));
        });
    }

    /** Waits for a message of `type` to cross the bridge after `since`; the line, or `TIMEOUT`. */
    async waitFor(
        type: string,
        opts: { source?: 'web→shell' | 'shell→web'; since?: number; timeout?: number } = {}
    ): Promise<ToolResult<{ entry: LogEntry }>> {
        opts = opts ?? {};
        const sources: LogSource[] = opts.source ? [opts.source] : ['web→shell', 'shell→web'];
        const since = opts.since ?? 0;
        const timeout = opts.timeout ?? DEFAULT_WAIT_MS;
        const input = { type, ...opts };
        if (typeof type !== 'string' || !type) {
            return this.finish('waitFor', input, 'api', this.invalid('type must be a non-empty string'));
        }
        const matches = (entry: LogEntry) => entry.type === type && sources.includes(entry.source) && entry.seq > since;
        const seen = this.logs.query({ since, source: sources }).find(matches);
        if (seen) return this.finish('waitFor', input, 'api', { ok: true, sent: [], entry: seen });
        const result = await new Promise<ToolResult<{ entry: LogEntry }>>(resolve => {
            const timer = setTimeout(() => {
                stop();
                const crossed = [...new Set(this.logs.query({ since, source: sources }).map(entry => entry.type))];
                resolve({
                    ok: false,
                    error: 'TIMEOUT',
                    message: `waitFor(${type}) timed out after ${timeout}ms; crossed meanwhile: ${crossed.join(', ') || 'nothing'}`,
                });
            }, timeout);
            const stop = this.logs.subscribe(entry => {
                if (!matches(entry)) return;
                clearTimeout(timer);
                stop();
                resolve({ ok: true, sent: [], entry });
            });
        });
        return this.finish('waitFor', input, 'api', result);
    }

    /**
     * The keyboard coming up, as far as the web can tell: the app re-injects its safe-area script with
     * the keyboard's height whenever that changes, so this runs the same script in the frame. The web
     * lays out above it; typing and focus scrolling are not imitated. No message is sent.
     */
    async keyboardShow(height: number | undefined, by: Caller): Promise<ToolResult> {
        return this.tool('keyboard.show', { height }, by, () => {
            const next = height ?? DEFAULT_KEYBOARD_HEIGHT[this.platform];
            if (typeof next !== 'number' || !Number.isFinite(next) || next <= 0 || next >= this.device.height) {
                return this.invalid(`height must be a number of CSS pixels between 0 and ${this.device.height}`);
            }
            this.setKeyboard(Math.round(next));
            return { ok: true as const, sent: [] };
        });
    }

    async keyboardHide(by: Caller): Promise<ToolResult> {
        return this.tool('keyboard.hide', {}, by, () => {
            this.setKeyboard(0);
            return { ok: true as const, sent: [] };
        });
    }

    /**
     * Any app → web event, with data as given — for exploring what the web does with a message no other
     * tool makes. Nothing checks the data against the contract (`contract: 'unchecked'`), so a result
     * made this way is not a pass on its own. On prod an agent cannot call it at all: an event such as
     * a purchase success could make the web write to the real server. The panel asks a person first.
     */
    async eventsPush(type: string, data: unknown, by: Caller): Promise<ToolResult<{ contract: 'unchecked' }>> {
        return this.tool('events.push', { type, data, contract: 'unchecked' }, by, () => {
            if (this.config.env === 'prod' && by === 'api') {
                return {
                    ok: false,
                    error: 'PROD_BLOCKED',
                    message: 'events.push cannot be called through the API on prod',
                };
            }
            if (typeof type !== 'string' || !isAppEventType(type)) {
                return this.invalid('type must be one of events.types()');
            }
            this.core.push(type, data as never);
            return { ...this.sentResult([type]), contract: 'unchecked' as const };
        });
    }

    eventTypes(): string[] {
        return [...APP_EVENT_TYPES];
    }

    /** A card in the notification centre was tapped: the same as `push.tap` with its data. */
    async tapNotification(id: number): Promise<ToolResult<{ path: string | null }>> {
        const card = this.notificationList.find(notification => notification.id === id);
        this.notificationList = this.notificationList.filter(notification => notification.id !== id);
        this.emit();
        return this.pushTap(card?.data ?? {}, { launch: 'warm' }, 'panel');
    }

    // ------------------------------------------------------------------ internals

    private registerHandlers(): void {
        this.core.use(this.cache.handlers());
        this.core.use(bootHandlers(this.platform));
        this.core.use(
            shellHandlers({
                storage: this.storage,
                platform: () => this.platform,
                appState: () => this.appState,
                signIn: this.signIn,
                unsupported: (type, message) => this.markUnsupported(type, message),
            })
        );
    }

    /**
     * Sends the app to `path` the way it opens a link: warm, the event goes to the running page and the
     * app comes to the front after it (the order the app's code produces, see README); cold, the app
     * relaunches with the event held until the new page shakes hands. No path means a tap that only
     * brings the app forward.
     */
    private openWith(path: string | null, launch: LaunchMode): ToolSuccess {
        // A closed app has no running page to take a warm event: a tap or a link launches it.
        if (launch === 'cold' || this.exited) {
            const sent = this.relaunch('cold launch', () => {
                if (path !== null) this.core.push('OnNavigate', { path, replace: false });
            });
            return this.sentResult([...sent, ...(path !== null ? ['OnNavigate'] : [])]);
        }
        const sent: string[] = [];
        if (path !== null) {
            this.core.push('OnNavigate', { path, replace: false });
            sent.push('OnNavigate');
        }
        if (this.appState !== 'active') sent.push(this.moveTo('active'));
        return this.sentResult(sent);
    }

    /**
     * Throws the page away and starts a new one, as killing and reopening the app does: a new bridge
     * host that holds events until the next handshake, the launch state pushed as the app's mount
     * pushes it, then whatever `before` adds, all ahead of the new frame. Returns the types pushed.
     */
    private relaunch(reason: string, before?: () => void): string[] {
        this.core.reboot();
        this.launch += 1;
        this.keyboardHeight = 0;
        // A sign-in waiting on a person belonged to the page that is going away.
        this.signIn.cancel();
        this.frameWindow = null;
        this.handshake = 'pending';
        this.capabilities = [];
        this.webCanGoBack = null;
        this.exited = false;
        this.appState = 'active';
        this.logs.append({
            source: 'lifecycle',
            type: 'relaunch',
            data: { reason, device: this.device.id, platform: this.platform },
        });
        const sent = [this.pushLaunchState()];
        before?.();
        this.emit();
        return sent;
    }

    /** The app's `useAppStateHandler` reports the state it mounts in, so every launch starts with it. */
    private pushLaunchState(): string {
        this.core.push('OnBackgroundStatusChanged', statusPayload(this.appState));
        return 'OnBackgroundStatusChanged';
    }

    private moveTo(status: AppBackgroundStatus): string {
        this.appState = status;
        this.core.push('OnBackgroundStatusChanged', statusPayload(status));
        return 'OnBackgroundStatusChanged';
    }

    /**
     * `queued` when the bridge is holding what was pushed — until the page's first message, as the
     * host decides. A page reloaded inside the frame has not shaken hands again yet, but the host keeps
     * sending to it, as the app's does across a WebView reload; so this asks the host, not `handshake`.
     */
    private sentResult(sent: string[]): ToolSuccess {
        return this.core.ready ? { ok: true, sent } : { ok: true, sent, queued: true };
    }

    private invalid(message: string): ToolFailure {
        return { ok: false, error: 'INVALID_INPUT', message };
    }

    private async tool<T extends ToolResult<object>>(
        name: string,
        input: unknown,
        by: Caller,
        run: () => T
    ): Promise<T> {
        try {
            return this.finish(name, input, by, run());
        } catch (error) {
            // A tool that broke still leaves its line, so the log says what was asked when it broke.
            this.logs.append({ source: 'tool', type: name, data: { by, input, error } });
            this.emit();
            throw error;
        }
    }

    private finish<T extends ToolResult<object>>(name: string, input: unknown, by: Caller, result: T): T {
        this.logs.append({ source: 'tool', type: name, data: { by, input, result } });
        this.emit();
        return result;
    }

    private record(traffic: ShellTraffic): void {
        if (traffic.direction === 'web→shell') {
            const message = traffic.message;
            if (!message) {
                this.logs.append({ source: 'web→shell', data: traffic.raw });
                return;
            }
            this.logs.append({ source: 'web→shell', type: message.type, refId: message.refId, data: message.data });
            const uid = (message.data as { uid?: unknown } | undefined)?.uid;
            if (typeof uid === 'string' && uid) this.userId = uid;
            if (message.type === 'SetBadgeCount') {
                const count = (message.data as { count?: unknown } | undefined)?.count;
                if (typeof count === 'number') this.badge = count;
                this.emit();
            }
            if (message.type === 'SetCanGoBack') {
                this.webCanGoBack = !!(message.data as { canGoBack?: boolean } | undefined)?.canGoBack;
                this.emit();
            }
            if (!this.core.handles(message.type)) {
                this.markUnsupported(message.type, `Not supported in the virtual shell: ${message.type}`);
            }
            return;
        }
        const message = traffic.message as
            | { type: string; refId?: string; data?: unknown; error?: unknown; success?: boolean }
            | undefined;
        if (!message) {
            this.logs.append({ source: 'shell→web', data: traffic.raw });
            return;
        }
        // Ready before the reply's line is written: `waitFor('OnWebAppReady')` resolves on that line,
        // and whoever it wakes reads `status().handshake` next.
        if (message.type === 'OnWebAppReady') {
            this.handshake = 'ready';
            this.capabilities = [
                ...((message.data as { supportedWebMessages?: string[] } | undefined)?.supportedWebMessages ?? []),
            ];
        }
        this.logs.append({
            source: 'shell→web',
            type: message.type,
            refId: message.refId,
            data: message.success === false ? { error: message.error } : message.data,
        });
        if (message.type === 'OnWebAppReady') {
            this.logs.append({
                source: 'lifecycle',
                type: 'handshake',
                data: { capabilities: this.capabilities.length },
            });
            this.emit();
        }
    }

    /** A request the shell does not imitate — logged every time, shown once per type. */
    private markUnsupported(type: string, text: string): void {
        this.logs.append({ source: 'unsupported', type, data: { message: text } });
        if (this.toastedTypes.has(type)) return;
        this.toastedTypes.add(type);
        const toast = { id: this.nextId++, type, text };
        this.toastList = [...this.toastList, toast];
        setTimeout(() => {
            this.toastList = this.toastList.filter(item => item.id !== toast.id);
            this.emit();
        }, TOAST_MS);
        this.emit();
    }

    private async deliver(raw: string): Promise<boolean> {
        // A tick later, as a reply crossing from native code arrives: never inside the page's own call.
        await new Promise(resolve => setTimeout(resolve, 0));
        const win = this.liveFrame();
        if (!win) return false;
        const target = dispatchTarget(this.platform) === 'window' ? win : win.document;
        target.dispatchEvent(new win.MessageEvent('message', { data: raw }));
        return true;
    }

    private liveFrame(): FrameWindow | null {
        const win = this.frameWindow;
        if (!win || win.closed) return null;
        return win;
    }

    private framePath(win: Window): string {
        try {
            return `${win.location.pathname}${win.location.search}`;
        } catch {
            return '';
        }
    }

    /**
     * The frame's stand-in for the WebView's own `canGoBack`: the Navigation API where the browser has
     * it, else the index react-router writes into each history entry (0 is the first screen).
     */
    private historyCanGoBack(win: Window): boolean {
        try {
            const navigation = (win as Window & { navigation?: { canGoBack?: boolean } }).navigation;
            if (typeof navigation?.canGoBack === 'boolean') return navigation.canGoBack;
            const idx = (win.history.state as { idx?: number } | null)?.idx;
            return typeof idx === 'number' && idx > 0;
        } catch {
            // The frame went to another origin (an external link without a target, a redirect); its
            // history is no longer this page's to read. Said once, rather than taking the page down.
            if (!this.leftOrigin) {
                this.leftOrigin = true;
                this.logs.append({ source: 'lifecycle', type: 'frame-left-origin' });
            }
            return false;
        }
    }

    private wrapConsole(win: FrameWindow): void {
        for (const level of CONSOLE_LEVELS) {
            const original = win.console[level].bind(win.console);
            win.console[level] = (...args: unknown[]) => {
                original(...args);
                this.logs.append({ source: 'console', type: level, data: args });
            };
        }
    }

    /**
     * Sets the app's theme as picking it in the app's settings does: the copy the app keeps and injects
     * at boot, and the web's own. The web reads its stored copy (`vite-ui-theme`, shared by every web
     * app on the origin) ahead of the injected one, so changing only the injection shows nothing once
     * the web has ever saved a theme.
     */
    private setAppTheme(theme: 'light' | 'dark'): void {
        this.storage.preferences.set('theme', theme);
        try {
            this.webStorage?.setItem(WEB_THEME_KEY, theme);
        } catch {
            // Storage refused (blocked site data): the injected theme still applies to a web that saved none.
        }
    }

    private setKeyboard(height: number): void {
        this.keyboardHeight = height;
        const win = this.liveFrame();
        // The frame's own `eval`, as at boot: the app's script, in the frame's global scope.
        if (win) win.eval(this.mobile.getSafeAreaScript(this.device.insets, height));
        this.emit();
    }

    private injectedTheme(): ThemeMode {
        return storedTheme(this.storage) ?? this.deviceTheme;
    }

    private injectionParams(): AppInjectionParams {
        const ios = this.platform === 'ios';
        // A platform forced away from its preset reports a generic phone of that platform.
        const own = this.device.platform === this.platform;
        return {
            insets: this.device.insets,
            keyboardHeight: 0,
            theme: this.injectedTheme(),
            configBag: { ...this.storage.configBag },
            deviceInfo: {
                runId: `virtual-shell-${Date.now().toString(36)}`,
                platform: this.platform,
                applicationName: 'DoU Virtual Shell',
                stage: appStageFor(this.config.env),
                consoleEnabled: false,
                uniqueId: 'virtual-shell-device:virtual-shell-install',
                deviceModel: own ? this.device.model : ios ? 'iPhone17,1' : 'Pixel 7',
                osVersion: own ? this.device.osVersion : ios ? '26.0' : '15',
                appVersion: FAKE_SHELL_APP_VERSION,
                buildNumber: '1',
                // The device language, as the app reports it; the browser's stands in for the phone's.
                appLanguage: (globalThis.navigator?.language ?? 'en').slice(0, 2),
                installationId: 'virtual-shell-device',
                uniqueDeviceId: 'virtual-shell-device',
                firebaseInstallationId: '',
                latestVersion: FAKE_SHELL_APP_VERSION,
                shouldUpdate: false,
            },
        };
    }

    private emit(): void {
        for (const listener of [...this.changeListeners]) listener();
    }
}
