import { AppBridgeHost } from '@chatic/bridges';
import type {
    AppMessageDataMap,
    AppMessageType,
    WebMessage,
    WebMessageData,
    WebMessageType,
} from '@chatic/app-messages';

import { toHostHandler, type ShellHandler, type ShellHandlerTable } from './handlerTable';

/**
 * How a shell → web message reaches the page: a JSON string dispatched as a `message` event, on
 * `window` or `document` per platform. Playwright does it with `page.evaluate`.
 *
 * Resolves `true` once dispatched and `false` when the page is gone (navigated or closed between
 * request and reply) — the real shell drops the reply in that case too, and the web never matches it.
 * Throws for anything else: that is the shell failing to answer, which would otherwise surface only
 * as the web's own bridge timeout.
 */
export interface ShellTransport {
    deliver(raw: string): Promise<boolean> | boolean;
}

/** One message crossing the bridge, for a caller that shows or records the traffic. */
export type ShellTraffic =
    | { direction: 'web→shell'; raw: string; message: WebMessage | undefined }
    | { direction: 'shell→web'; raw: string; message: { type: string } | undefined };

export interface ShellCoreOptions {
    transport: ShellTransport;
    /** The handshake's cache report. */
    supportedCacheTypes?: string[];
    /**
     * Whether to keep what crossed the bridge for `received`, `waitFor`, `delivered` and `unhandled`.
     * On by default, for a test that reads it back. A long-lived caller that keeps its own bounded
     * record turns it off, or every message of a session stays in memory.
     */
    retainTraffic?: boolean;
}

type Listener = (message: WebMessage) => void;

/**
 * A native shell for the web app, minus the transport: the mobile app's own `AppBridgeHost` with a
 * typed handler table in place of the native handlers.
 *
 * Each message goes to the same host the mobile app uses, so matching a reply to its request,
 * `NOT_FOUND` for a message without a handler and the WebAppReady handshake are production code; what
 * is fake is only the handlers and the transport.
 */
export class ShellCore {
    private host: AppBridgeHost;
    /** Every handler registered so far, kept so a reboot can hand them to the new host. */
    private readonly table = new Map<WebMessageType, ShellHandler<WebMessageType>>();
    private readonly log: WebMessage[] = [];
    /**
     * Types answered here, so a message nobody answers can be told from one answered on purpose. The
     * host answers the handshake and its liveness probe itself.
     */
    private readonly handled = new Set<string>(['WebAppReady', 'Ping']);
    /** Whether the current host has heard from its page, which is when it stops holding events. */
    private hostHeard = false;
    /** Requests the host answered `NOT_FOUND` — as an app build without that handler would. */
    readonly unhandled: string[] = [];
    /**
     * Failures the app's injection script reported about itself. Not a finding about the web: it means
     * the shell no longer injects what the app does, and everything on top of it is suspect.
     */
    readonly injectionErrors: string[] = [];
    /** Replies that could not be dispatched into the page for a reason other than it going away. */
    readonly deliveryErrors: string[] = [];
    private readonly listeners = new Set<Listener>();
    private readonly observers = new Set<(traffic: ShellTraffic) => void>();
    /** Types of the app → web messages dispatched into the page so far, and who waits on the next. */
    private readonly dispatched: string[] = [];
    private readonly dispatchWaiters = new Set<{ type: string; resolve: () => void }>();

    constructor(private readonly options: ShellCoreOptions) {
        this.host = this.createHost();
    }

    /** Adds or replaces handlers. A caller changes the shell's answer by registering over the default. */
    use(handlers: ShellHandlerTable): void {
        for (const type of Object.keys(handlers) as WebMessageType[]) {
            this.handle(type, handlers[type] as ShellHandler<typeof type>);
        }
    }

    handle<K extends WebMessageType>(type: K, handler: ShellHandler<K>): void {
        this.handled.add(type);
        this.table.set(type, handler as unknown as ShellHandler<WebMessageType>);
        this.host.registerHandler(type, toHostHandler(type, handler));
    }

    /** Whether a request type has a handler — what the handshake reports as answered. */
    handles(type: string): boolean {
        return this.handled.has(type);
    }

    /**
     * Whether an event pushed now goes straight to the page. The host holds events until its page
     * sends anything but a log line, and keeps sending once it has — across a reload of that page, as
     * the app's host does across a WebView reload.
     */
    get ready(): boolean {
        return this.hostHeard;
    }

    /** Pushes an app → web event, as the app does for a push tap or a resume. Held until the handshake. */
    push<K extends AppMessageType>(type: K, data: AppMessageDataMap[K]): void {
        this.host.pushEvent({ type, success: true, data });
    }

    /**
     * Starts over with a page that has not shaken hands yet, as an app relaunch does: a new host with
     * the same handlers, which holds events again until the next WebAppReady. What the shell keeps
     * across it (its cache, its settings) lives in the handlers, so it survives.
     */
    reboot(): void {
        this.host = this.createHost();
        this.hostHeard = false;
        // What `received` and `delivered` answer is about the page of this launch, not the last one.
        this.log.length = 0;
        this.dispatched.length = 0;
    }

    /** Hands every message crossing the bridge to `observer`, until the returned function is called. */
    observe(observer: (traffic: ShellTraffic) => void): () => void {
        this.observers.add(observer);
        return () => this.observers.delete(observer);
    }

    /**
     * Resolves once a message of this type from the shell has been dispatched in the page — not when it
     * was pushed, which for an event held until the handshake can be much earlier. For a scenario that
     * must keep something else back until the page has it, as a device's timing would.
     */
    delivered(type: AppMessageType, { timeout = 15_000 }: { timeout?: number } = {}): Promise<void> {
        if (this.dispatched.includes(type)) return Promise.resolve();
        return new Promise((resolve, reject) => {
            const waiter = {
                type,
                resolve: () => {
                    clearTimeout(timer);
                    resolve();
                },
            };
            const timer = setTimeout(() => {
                this.dispatchWaiters.delete(waiter);
                const sent = [...new Set(this.dispatched)].join(', ') || 'nothing';
                reject(new Error(`delivered(${type}) timed out after ${timeout}ms; the shell dispatched: ${sent}`));
            }, timeout);
            this.dispatchWaiters.add(waiter);
        });
    }

    /** Every message the page has sent so far, oldest first. */
    received<K extends WebMessageType>(type: K): WebMessageData<K>[] {
        return this.log.filter(message => message.type === type) as unknown as WebMessageData<K>[];
    }

    /**
     * Resolves with the first message of this type — one already received, or the next to arrive.
     * Rejects after `timeout` naming what the page did send, which says more than a test timeout would.
     */
    waitFor<K extends WebMessageType>(
        type: K,
        predicate: (message: WebMessageData<K>) => boolean = () => true,
        { timeout = 15_000 }: { timeout?: number } = {}
    ): Promise<WebMessageData<K>> {
        const seen = this.received(type).find(predicate);
        if (seen) return Promise.resolve(seen);
        return new Promise((resolve, reject) => {
            const settle = () => {
                this.listeners.delete(listener);
                clearTimeout(timer);
            };
            const timer = setTimeout(() => {
                settle();
                const sent = [...new Set(this.log.map(message => message.type))].join(', ');
                reject(new Error(`waitFor(${type}) timed out after ${timeout}ms; the page sent: ${sent}`));
            }, timeout);
            const listener: Listener = message => {
                if (message.type !== type) return;
                try {
                    if (!predicate(message as WebMessageData<K>)) return;
                } catch (error) {
                    settle();
                    reject(error);
                    return;
                }
                settle();
                resolve(message as WebMessageData<K>);
            };
            this.listeners.add(listener);
        });
    }

    /** A message the page posted, as the transport received it. */
    async receive(raw: string): Promise<void> {
        let message: WebMessage | undefined;
        try {
            message = JSON.parse(raw) as WebMessage;
        } catch {
            // The host decodes it again and logs a malformed message itself.
        }
        this.notify({ direction: 'web→shell', raw, message });
        if (message && message.type !== 'SendLog') this.hostHeard = true;
        if (message) {
            if (this.options.retainTraffic !== false) {
                this.log.push(message);
                if (!this.handled.has(message.type)) this.unhandled.push(message.type);
            }
            if (message.type === 'SendLog' && message.data?.tag === 'INJECTION') {
                this.injectionErrors.push(message.data.message ?? '');
            }
            // A copy: a listener that settles removes itself while the set is being walked.
            for (const listener of [...this.listeners]) listener(message);
        }
        await this.host.handleMessage(raw);
    }

    private createHost(): AppBridgeHost {
        const host: AppBridgeHost = new AppBridgeHost({
            // A host replaced by a reboot keeps answering what it was asked before — a sign-in that
            // waited on a person, a slow cache read. Its page is gone, so its replies are dropped, as a
            // killed app's are, rather than landing in the page of the next launch.
            sendToWeb: raw => {
                if (this.host === host) void this.deliver(raw);
            },
            supportedCacheTypes: this.options.supportedCacheTypes,
        });
        for (const [type, handler] of this.table) host.registerHandler(type, toHostHandler(type, handler));
        return host;
    }

    private async deliver(raw: string): Promise<void> {
        let delivered: boolean;
        try {
            delivered = await this.options.transport.deliver(raw);
        } catch (error) {
            this.deliveryErrors.push(String(error));
            return;
        }
        if (!delivered) return;
        let message: { type: string } | undefined;
        try {
            message = JSON.parse(raw) as { type: string };
        } catch {
            message = undefined;
        }
        this.notify({ direction: 'shell→web', raw, message });
        if (!message) return;
        if (this.options.retainTraffic !== false) this.dispatched.push(message.type);
        for (const waiter of [...this.dispatchWaiters]) {
            if (waiter.type !== message.type) continue;
            this.dispatchWaiters.delete(waiter);
            waiter.resolve();
        }
    }

    /** An observer that throws must not keep a message from the host, or a reply from the page. */
    private notify(traffic: ShellTraffic): void {
        for (const observer of [...this.observers]) {
            try {
                observer(traffic);
            } catch (error) {
                console.error('[fake-shell] an observer threw', error);
            }
        }
    }
}
