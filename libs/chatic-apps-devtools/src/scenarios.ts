import type { DOMWindow } from 'jsdom';

import type { MockController, MockData, MockDeviceAnswer, MockOptions } from '@chatic/chatic-apps-sdk/mock';

import { bundleModule, openPage, settle, type PageSource } from './page';

/**
 * The scenario runner: opens a page against the library's mock of the app, plays what a user and the
 * app do to it — back, close, a theme change, hiding, refusals, a cloud change, long lists, a rate
 * limit — and reports what the page did wrong. It never reaches the app or a server: the mock answers
 * from the data the project gives it.
 */

/** What a project tells the runner, in `chatic-apps.scenarios.ts` (or `.js`). */
export interface ScenarioConfig {
    /** The cloud's data the mock answers with: the page's development data, typically. */
    data?: MockData;
    /**
     * The page's screens below its root, each with the selectors to click, from the root, to reach it.
     * Each click opens one screen, so pressing back as many times returns to the root.
     */
    screens?: Array<{
        name: string;
        open: string[];
        /** Selectors clicked on the screen once it is open, which open no screen of their own. */
        tap?: string[];
    }>;
    /** Things to tap on the root screen; each must go through, or fail with a code, without an error. */
    actions?: Array<{ name: string; click: string }>;
    /** A selector present once the page has started; the runner waits for it. */
    ready?: string;
}

export type ScenarioName =
    | 'start'
    | 'screens'
    | 'back-at-root'
    | 'close-guard'
    | 'theme'
    | 'hide-resume'
    | 'actions'
    | 'device-refused'
    | 'consent-refused'
    | 'cloud-change'
    | 'big-list'
    | 'rate-limited';

export const SCENARIOS: Readonly<Record<ScenarioName, string>> = {
    start: 'The page connects, starts without an error, and leaves Android back to the app at its root.',
    screens: 'Each screen takes Android back; back returns to the root with no stream, listener or interval left over.',
    'back-at-root': 'Android back at the root closes the page.',
    'close-guard': 'A close the user asks for twice goes through.',
    theme: "The page changes when the app's theme does (any change to the page counts).",
    'hide-resume': 'The page saves when hidden and goes on when shown again.',
    actions: 'Each action on the root screen ends without an error.',
    'device-refused': 'With the camera and microphone refused, each action still ends without an error.',
    'consent-refused':
        "The user refuses the page their cloud's data: the page goes on without an error, and does not ask again.",
    'cloud-change':
        'The cloud changes under the page: its streams end, a page that had one open changes or finishes, and it does not retry.',
    'big-list': 'Lists of thousands of rows: the page draws only part of them.',
    'rate-limited': 'A read refused with `RATE_LIMITED` is tried again later.',
};

/** What went wrong, by kind: what `verify` explains in plain words, in the reader's language. */
export type IssueKind =
    | 'threw'
    | 'reported'
    | 'not-ready'
    | 'could-not-run'
    | 'never-connected'
    | 'no-data-connect'
    | 'root-back-taken'
    | 'selector-missing'
    | 'screen-no-back'
    | 'back-closed'
    | 'back-still-taken'
    | 'stream-left'
    | 'listener-left'
    | 'interval-left'
    | 'root-back-not-closing'
    | 'close-not-closing'
    | 'theme-ignored'
    | 'no-save-on-hide'
    | 'asked-again'
    | 'cloud-streams-open'
    | 'cloud-ignored'
    | 'cloud-retries'
    | 'big-list'
    | 'no-retry';

export interface ScenarioIssue {
    kind: IssueKind;
    /** The problem in English, as `scenarios` prints it. */
    text: string;
    /** The screen it happened on, by its name in the scenario file. */
    screen?: string;
    count?: number;
    /** The error, the selector or the method it is about. */
    detail?: string;
}

export interface ScenarioResult {
    name: ScenarioName;
    /** `false` when the scenario did not apply to this page: it is then neither passed nor failed. */
    ran: boolean;
    /** Each issue's English text. */
    problems: string[];
    issues: ScenarioIssue[];
}

/** The scenarios that need no screens from a scenario file. */
export const SCREENLESS_SCENARIOS: readonly ScenarioName[] = [
    'start',
    'back-at-root',
    'close-guard',
    'theme',
    'hide-resume',
    'consent-refused',
    'cloud-change',
    'rate-limited',
];

const issue = (kind: IssueKind, text: string, extra: Omit<ScenarioIssue, 'kind' | 'text'> = {}): ScenarioIssue => ({
    kind,
    text,
    ...extra,
});

export interface RunOptions {
    source: PageSource;
    /** The permissions the page's manifest asks for. */
    permissions: string[];
    config?: ScenarioConfig;
    /** The module the mock is imported from; the project's installed SDK by default. */
    mockModule?: string;
    /** Where `mockModule` resolves from: the project's folder. */
    resolveDir: string;
    /** Only these scenarios. */
    only?: ScenarioName[];
}

const DATA_PERMISSIONS = ['session', 'cloud', 'place', 'channel', 'chat', 'user', 'chatSend'];
/** How many rows a long list has in `big-list`. */
const BIG_LIST = 5000;
/** More elements than this after a long list means the page drew all of it. */
const ELEMENT_LIMIT = 2000;
/** The wait the runner asks for in `rate-limited`. */
const RETRY_AFTER_MS = 50;

interface WireMessage {
    type: string;
    data: Record<string, unknown>;
    refId?: string;
    at: number;
}

interface Session {
    window: DOMWindow;
    app: MockController;
    errors: string[];
    requests: WireMessage[];
    claim: () => boolean;
    openStreams: () => number;
    listeners: () => number;
    intervals: () => number;
    mutations: () => number;
    click: (selector: string) => Promise<boolean>;
    close: () => void;
}

interface SessionOptions {
    consent?: 'allow' | 'refuse';
    devices?: MockDeviceAnswer;
    bigLists?: boolean;
    /** Answers a request itself, instead of the mock: the reply's `data`, or an error. */
    intercept?: (message: WireMessage) => { error: { code: string; message: string; details?: unknown } } | undefined;
}

const inflate = (value: unknown): unknown => {
    if (!value || typeof value !== 'object' || !Array.isArray((value as { list?: unknown }).list)) return value;
    const page = value as { list: Array<Record<string, unknown>>; meta?: Record<string, unknown> };
    if (page.list.length === 0) return value;
    const list = Array.from({ length: BIG_LIST }, (_, index) => {
        const row = page.list[index % page.list.length];
        return { ...row, id: `${String(row.id ?? 'row')}-${index}` };
    });
    return { ...page, list, meta: { ...page.meta, total: BIG_LIST } };
};

/** The data with every list it answers made `BIG_LIST` rows long. */
const withBigLists = (data: MockData = {}): MockData => {
    const calls: Record<string, unknown> = {};
    for (const [method, answer] of Object.entries(data.calls ?? {})) {
        if (!answer) continue;
        calls[method] = (...args: never[]) =>
            Promise.resolve((answer as (...args: never[]) => unknown)(...args)).then(inflate);
    }
    const streams: Record<string, unknown> = {};
    for (const [method, open] of Object.entries(data.streams ?? {})) {
        if (!open) continue;
        streams[method] = (emit: (...event: unknown[]) => void, ...args: never[]) =>
            (open as (emit: (...event: unknown[]) => void, ...args: never[]) => unknown)(
                (...event: unknown[]) => emit(...event.map(inflate)),
                ...args
            );
    }
    return { ...data, calls: calls as MockData['calls'], streams: streams as MockData['streams'] };
};

const NOT_READY = 'The page never showed';
const MOCK_GLOBAL = '__chaticAppsRunnerMock';
const OPTIONS_GLOBAL = '__chaticAppsRunnerOptions';

/** Runs the scenarios that apply to the page; a scenario that does not apply reports `ran: false`. */
export const runScenarios = async (options: RunOptions): Promise<ScenarioResult[]> => {
    const config = options.config ?? {};
    const reads = options.permissions.some(permission => DATA_PERMISSIONS.includes(permission));
    const mockModule = options.mockModule ?? '@lemoncloud/chatic-apps-sdk/mock';
    const mockScript = await bundleModule(
        `import { installChaticAppsMock } from ${JSON.stringify(mockModule)};\n` +
            `window.${MOCK_GLOBAL} = installChaticAppsMock(window.${OPTIONS_GLOBAL});`,
        options.resolveDir
    );

    // Every window a scenario opened, closed when it ends however it ends.
    const opened = new Set<() => void>();

    const start = async (sessionOptions: SessionOptions = {}): Promise<Session> => {
        const requests: WireMessage[] = [];
        const pendingStreams = new Map<string, string>();
        const streams = new Set<string>();
        let claim = false;
        let mutations = 0;
        // Only what outlives a screen: listeners on the window, the document and other objects. An element's
        // own listeners go with the element.
        const listeners = new Set<string>();
        const intervals = new Set<unknown>();
        let app: MockController | null = null;

        const page = openPage(options.source, {
            beforeScripts: window => {
                const mockOptions: MockOptions = {
                    permissions: options.permissions as MockOptions['permissions'],
                    log: false,
                    data: {
                        ...(sessionOptions.bigLists ? withBigLists(config.data) : config.data),
                        consent: sessionOptions.consent ?? 'allow',
                    },
                    deviceAnswers: sessionOptions.devices
                        ? { camera: sessionOptions.devices, microphone: sessionOptions.devices }
                        : undefined,
                };
                Object.assign(window, { [OPTIONS_GLOBAL]: mockOptions });
                window.eval(mockScript);
                app = (window as unknown as Record<string, MockController>)[MOCK_GLOBAL];

                // Replies and pushes, as the page hears them: what is open, and what the app ended.
                window.addEventListener('message', event => {
                    let message: { refId?: string; success?: boolean; type?: string; data?: unknown };
                    try {
                        message = JSON.parse(String((event as MessageEvent).data));
                    } catch {
                        return;
                    }
                    const id = message.refId ? pendingStreams.get(message.refId) : undefined;
                    if (id) {
                        pendingStreams.delete(message.refId as string);
                        if (message.success) streams.add(id);
                    }
                    if (message.type === 'OnRuntimeEvent') {
                        const { subscriptionId, event: pushed } = (message.data ?? {}) as {
                            subscriptionId?: string;
                            event?: { $ended?: unknown };
                        };
                        if (subscriptionId && pushed && !Array.isArray(pushed) && pushed.$ended) {
                            streams.delete(subscriptionId);
                        }
                    }
                });

                // Requests, as the page sends them.
                const bridge = (window as unknown as { ReactNativeWebView: { postMessage(raw: string): void } })
                    .ReactNativeWebView;
                const forward = bridge.postMessage;
                (window as unknown as { ReactNativeWebView: unknown }).ReactNativeWebView = {
                    postMessage: (raw: string) => {
                        let parsed: { type?: unknown; data?: unknown; refId?: unknown };
                        try {
                            parsed = JSON.parse(raw);
                        } catch {
                            return forward(raw);
                        }
                        const message: WireMessage = {
                            type: String(parsed.type),
                            data: (parsed.data ?? {}) as Record<string, unknown>,
                            refId: typeof parsed.refId === 'string' ? parsed.refId : undefined,
                            at: Date.now(),
                        };
                        requests.push(message);
                        if (message.type === 'SetCanGoBack') claim = message.data.canGoBack === true;
                        if (message.type === 'RuntimeSubscribe' && message.refId) {
                            pendingStreams.set(message.refId, String(message.data.subscriptionId));
                        }
                        if (message.type === 'RuntimeUnsubscribe') streams.delete(String(message.data.subscriptionId));
                        const answer = sessionOptions.intercept?.(message);
                        if (answer) {
                            const reply = JSON.stringify({
                                type: `On${message.type}`,
                                success: false,
                                error: answer.error,
                                refId: message.refId,
                            });
                            setTimeout(() => window.dispatchEvent(new window.MessageEvent('message', { data: reply })));
                            return;
                        }
                        forward(raw);
                    },
                };

                // Listeners and intervals the page adds and removes from here on.
                const keyOf = new WeakMap<object, number>();
                let nextKey = 0;
                const idOf = (value: object) => {
                    if (!keyOf.has(value)) keyOf.set(value, ++nextKey);
                    return keyOf.get(value);
                };
                const proto = window.EventTarget.prototype;
                const add = proto.addEventListener;
                const remove = proto.removeEventListener;
                const keyFor = (target: object, type: string, listener: unknown, capture: unknown) =>
                    (listener && typeof listener === 'object') || typeof listener === 'function'
                        ? `${idOf(target)}:${type}:${idOf(listener as object)}:${capture ? 1 : 0}`
                        : null;
                const captureOf = (options: unknown) =>
                    typeof options === 'boolean' ? options : !!(options as { capture?: boolean } | undefined)?.capture;
                proto.addEventListener = function (this: object, type: string, listener: unknown, opts?: unknown) {
                    const key = keyFor(this, type, listener, captureOf(opts));
                    const once = typeof opts === 'object' && !!(opts as { once?: boolean } | null)?.once;
                    const lasting = !(this instanceof window.Element);
                    if (key && !once && lasting) listeners.add(key);
                    const signal = typeof opts === 'object' ? (opts as { signal?: AbortSignal } | null)?.signal : null;
                    // The original method: the runner's own listener is not the page's.
                    if (key && signal) add.call(signal, 'abort', () => listeners.delete(key), { once: true });
                    return add.call(this, type, listener as never, opts as never);
                } as typeof proto.addEventListener;
                proto.removeEventListener = function (this: object, type: string, listener: unknown, opts?: unknown) {
                    const key = keyFor(this, type, listener, captureOf(opts));
                    if (key) listeners.delete(key);
                    return remove.call(this, type, listener as never, opts as never);
                } as typeof proto.removeEventListener;
                const setInterval = window.setInterval.bind(window);
                const clearInterval = window.clearInterval.bind(window);
                window.setInterval = ((...args: Parameters<typeof setInterval>) => {
                    const id = setInterval(...args);
                    intervals.add(id);
                    return id;
                }) as typeof window.setInterval;
                window.clearInterval = ((id?: number) => {
                    intervals.delete(id);
                    clearInterval(id);
                }) as typeof window.clearInterval;

                new window.MutationObserver(records => (mutations += records.length)).observe(
                    window.document.documentElement,
                    { attributes: true, childList: true, subtree: true, characterData: true }
                );
            },
        });
        opened.add(page.close);
        if (!app) {
            page.close();
            throw new Error(`The mock did not install from ${mockModule}.`);
        }

        await settle(60);
        if (config.ready) {
            for (let waited = 0; waited < 2000 && !page.window.document.querySelector(config.ready); waited += 20) {
                await settle(20);
            }
            if (!page.window.document.querySelector(config.ready)) {
                page.errors.push(`${NOT_READY} ${config.ready}.`);
            }
        }
        await settle(60);

        return {
            window: page.window,
            app: app as MockController,
            errors: page.errors,
            requests,
            claim: () => claim,
            openStreams: () => streams.size,
            listeners: () => listeners.size,
            intervals: () => intervals.size,
            mutations: () => mutations,
            click: async selector => {
                const element = page.window.document.querySelector(selector) as HTMLElement | null;
                if (!element) return false;
                element.click();
                await settle(60);
                return true;
            },
            close: () => {
                opened.delete(page.close);
                page.close();
            },
        };
    };

    /** The page's own errors, and the ones it reported to the app, as problems. */
    const errorsOf = (session: Session): ScenarioIssue[] => [
        ...session.errors.map(error =>
            error.startsWith(NOT_READY)
                ? issue('not-ready', error, { detail: config.ready })
                : issue('threw', `The page threw: ${error}`, { detail: error })
        ),
        ...session.requests
            .filter(request => request.type === 'ReportSubWebViewError')
            .map(request =>
                issue('reported', `The page reported an error: ${String(request.data.message)}`, {
                    detail: String(request.data.message),
                })
            ),
    ];

    const pressBack = async (session: Session, times = 1) => {
        for (let i = 0; i < times; i++) {
            session.app.pressBack();
            await settle(60);
        }
    };

    const clickAll = async (session: Session, problems: ScenarioIssue[]) => {
        for (const action of config.actions ?? []) {
            if (!(await session.click(action.click))) {
                problems.push(
                    issue('selector-missing', `${action.name}: ${action.click} is not on the page.`, {
                        screen: action.name,
                        detail: action.click,
                    })
                );
            }
        }
        await settle(100);
    };

    const scenarios: Record<ScenarioName, () => Promise<ScenarioIssue[] | null>> = {
        start: async () => {
            const session = await start();
            const problems = errorsOf(session);
            if (!session.requests.some(request => request.type === 'WebAppReady')) {
                problems.push(issue('never-connected', 'The page never connected: no `connect()`.'));
            }
            if (reads && !session.requests.some(request => request.type === 'RuntimeHello')) {
                problems.push(
                    issue(
                        'no-data-connect',
                        'The manifest asks for cloud data, and the page never called `apps.data.connect()`.'
                    )
                );
            }
            if (session.claim()) {
                problems.push(
                    issue('root-back-taken', 'The page takes Android back at its root: the app cannot close it there.')
                );
            }
            session.close();
            return problems;
        },
        screens: async () => {
            if (!config.screens?.length) return null;
            const problems: ScenarioIssue[] = [];
            const session = await start();
            const before = {
                streams: session.openStreams(),
                listeners: session.listeners(),
                intervals: session.intervals(),
            };
            for (const screen of config.screens) {
                let opened = 0;
                for (const selector of screen.open) {
                    if (!(await session.click(selector))) {
                        problems.push(
                            issue('selector-missing', `${screen.name}: ${selector} is not on the page.`, {
                                screen: screen.name,
                                detail: selector,
                            })
                        );
                        break;
                    }
                    opened += 1;
                }
                if (opened === 0) continue;
                for (const selector of screen.tap ?? []) {
                    if (!(await session.click(selector))) {
                        problems.push(
                            issue('selector-missing', `${screen.name}: ${selector} is not on the page.`, {
                                screen: screen.name,
                                detail: selector,
                            })
                        );
                    }
                }
                if (!session.claim()) {
                    problems.push(
                        issue(
                            'screen-no-back',
                            `${screen.name}: the screen does not take Android back (\`apps.onBack\`): back would close the page.`,
                            { screen: screen.name }
                        )
                    );
                }
                await pressBack(session, opened);
                if (session.app.closed) {
                    problems.push(
                        issue(
                            'back-closed',
                            `${screen.name}: Android back closed the page instead of returning to the root.`,
                            { screen: screen.name }
                        )
                    );
                    break;
                }
                if (session.claim()) {
                    problems.push(
                        issue('back-still-taken', `${screen.name}: back at the root is still taken by the page.`, {
                            screen: screen.name,
                        })
                    );
                }
                const left = {
                    streams: session.openStreams() - before.streams,
                    listeners: session.listeners() - before.listeners,
                    intervals: session.intervals() - before.intervals,
                };
                const leftOver = [
                    ['stream-left', left.streams, 'stream(s) left open after back'],
                    ['listener-left', left.listeners, 'event listener(s) left after back'],
                    ['interval-left', left.intervals, 'interval(s) left after back'],
                ] as const;
                for (const [kind, count, what] of leftOver) {
                    if (count > 0) {
                        problems.push(issue(kind, `${screen.name}: ${count} ${what}.`, { screen: screen.name, count }));
                    }
                }
            }
            problems.unshift(...errorsOf(session));
            session.close();
            return problems;
        },
        'back-at-root': async () => {
            const session = await start();
            session.app.pressBack();
            await settle(100);
            const problems = errorsOf(session);
            if (!session.app.closed) {
                problems.push(
                    issue(
                        'root-back-not-closing',
                        'Android back at the root did not close the page: it took back, or walked a history.'
                    )
                );
            }
            session.close();
            return problems;
        },
        'close-guard': async () => {
            const session = await start();
            session.app.requestClose();
            await settle(100);
            if (!session.app.closed) session.app.requestClose();
            await settle(100);
            const problems = errorsOf(session);
            if (!session.app.closed) {
                problems.push(
                    issue('close-not-closing', 'A second close within three seconds did not close the page.')
                );
            }
            session.close();
            return problems;
        },
        theme: async () => {
            const session = await start();
            const before = session.mutations();
            const theme = session.window.document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
            session.app.changeContext({ theme });
            await settle(100);
            const problems = errorsOf(session);
            if (session.mutations() === before) {
                problems.push(
                    issue(
                        'theme-ignored',
                        `The theme changed to ${theme} and the page did not change: use \`onContextChange\`.`
                    )
                );
            }
            session.close();
            return problems;
        },
        'hide-resume': async () => {
            const session = await start();
            const { document } = session.window;
            let state: 'visible' | 'hidden' = 'hidden';
            Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state });
            Object.defineProperty(document, 'hidden', { configurable: true, get: () => state === 'hidden' });
            const stores = () => session.requests.filter(request => request.type === 'SetSubWebViewStorage').length;
            const usesStorage = session.requests.some(request => /SubWebViewStorage/.test(request.type));
            const saved = stores();
            document.dispatchEvent(new session.window.Event('visibilitychange'));
            await settle(100);
            const problems: ScenarioIssue[] = [];
            if (usesStorage && stores() === saved) {
                problems.push(
                    issue(
                        'no-save-on-hide',
                        'Hidden, the page did not save: the app may close it without another word.'
                    )
                );
            }
            state = 'visible';
            document.dispatchEvent(new session.window.Event('visibilitychange'));
            await settle(100);
            await clickAll(session, problems);
            problems.unshift(...errorsOf(session));
            session.close();
            return problems;
        },
        actions: async () => {
            if (!config.actions?.length) return null;
            const session = await start();
            const problems: ScenarioIssue[] = [];
            await clickAll(session, problems);
            problems.unshift(...errorsOf(session));
            session.close();
            return problems;
        },
        'device-refused': async () => {
            if (!config.actions?.length) return null;
            const session = await start({ devices: 'blocked' });
            const problems: ScenarioIssue[] = [];
            await clickAll(session, problems);
            problems.unshift(...errorsOf(session));
            session.close();
            return problems;
        },
        'consent-refused': async () => {
            if (!reads) return null;
            const session = await start({ consent: 'refuse' });
            await settle(200);
            const problems = errorsOf(session);
            const hellos = session.requests.filter(request => request.type === 'RuntimeHello').length;
            if (hellos > 1) {
                problems.push(
                    issue('asked-again', `The page asked again ${hellos - 1} time(s) after the user refused.`, {
                        count: hellos - 1,
                    })
                );
            }
            session.close();
            return problems;
        },
        'cloud-change': async () => {
            if (!reads) return null;
            const session = await start();
            const screen = config.screens?.[0];
            for (const selector of screen?.open ?? []) await session.click(selector);
            // The page hears of the change through a stream the app ends, or the next read it makes: with no
            // stream open, it cannot know yet, and only what it does next is checked.
            const before = { mutations: session.mutations(), at: Date.now(), streams: session.openStreams() };
            session.app.changeCloud();
            await settle(300);
            const problems = errorsOf(session);
            if (session.openStreams() > 0) {
                problems.push(
                    issue('cloud-streams-open', `${session.openStreams()} stream(s) still open after the change.`, {
                        count: session.openStreams(),
                    })
                );
            }
            if (before.streams > 0 && session.mutations() === before.mutations && !session.app.closed) {
                problems.push(
                    issue(
                        'cloud-ignored',
                        'The page did not react to the cloud change: show a notice or finish (`onCloudChanged`).'
                    )
                );
            }
            const retries = session.requests.filter(
                request => request.at >= before.at && /^Runtime(Hello|Call|Subscribe)$/.test(request.type)
            ).length;
            if (retries > 1) {
                problems.push(
                    issue(
                        'cloud-retries',
                        `The page sent ${retries} cloud data requests after the change: nothing answers.`,
                        { count: retries }
                    )
                );
            }
            session.close();
            return problems;
        },
        'big-list': async () => {
            if (!reads || !config.screens?.length) return null;
            const session = await start({ bigLists: true });
            const problems: ScenarioIssue[] = [];
            for (const screen of config.screens) {
                let opened = 0;
                for (const selector of screen.open) if (await session.click(selector)) opened += 1;
                await settle(100);
                const elements = session.window.document.getElementsByTagName('*').length;
                if (elements > ELEMENT_LIMIT) {
                    problems.push(
                        issue(
                            'big-list',
                            `${screen.name}: ${elements} elements for lists of ${BIG_LIST} rows — draw and keep only what shows.`,
                            { screen: screen.name, count: elements }
                        )
                    );
                }
                await pressBack(session, opened);
            }
            problems.unshift(...errorsOf(session));
            session.close();
            return problems;
        },
        'rate-limited': async () => {
            if (!reads) return null;
            let refused: string | null = null;
            const session = await start({
                intercept: message => {
                    if (refused || message.type !== 'RuntimeCall' || message.data.method === 'chat.sendChat') {
                        return undefined;
                    }
                    refused = String(message.data.method);
                    return {
                        error: {
                            code: 'RATE_LIMITED',
                            message: 'Too many reads.',
                            details: { retryAfterMs: RETRY_AFTER_MS },
                        },
                    };
                },
            });
            for (const selector of config.screens?.[0]?.open ?? []) await session.click(selector);
            await settle(RETRY_AFTER_MS * 6);
            const problems = errorsOf(session);
            if (!refused) {
                session.close();
                return null;
            }
            {
                const calls = session.requests.filter(
                    request => request.type === 'RuntimeCall' && request.data.method === refused
                ).length;
                if (calls < 2) {
                    problems.push(
                        issue('no-retry', `${refused} was refused with RATE_LIMITED and never tried again.`, {
                            detail: refused,
                        })
                    );
                }
            }
            session.close();
            return problems;
        },
    };

    const results: ScenarioResult[] = [];
    for (const name of Object.keys(SCENARIOS) as ScenarioName[]) {
        if (options.only && !options.only.includes(name)) continue;
        let problems: ScenarioIssue[] | null;
        try {
            problems = await scenarios[name]();
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            problems = [issue('could-not-run', `The scenario could not run: ${message}`, { detail: message })];
        } finally {
            [...opened].forEach(close => close());
            opened.clear();
        }
        const issues = problems ?? [];
        results.push({ name, ran: problems !== null, problems: issues.map(item => item.text), issues });
    }
    return results;
};

/** The results as the command prints them. */
export const formatScenarios = (results: ScenarioResult[]): string => {
    const lines = results.map(result => {
        if (!result.ran) return `- ${result.name}  (does not apply to this page)`;
        if (result.problems.length === 0) return `✓ ${result.name}`;
        return [`✗ ${result.name}`, ...result.problems.map(problem => `    ${problem}`)].join('\n');
    });
    const failed = results.filter(result => result.problems.length > 0).length;
    lines.push(
        '',
        failed ? `✗ ${failed} scenario(s) failed` : `✓ scenarios passed (${results.filter(r => r.ran).length} ran)`
    );
    return lines.join('\n');
};
