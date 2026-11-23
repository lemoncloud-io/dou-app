import { AppBridgeHost } from '@chatic/bridges';
import type {
    AppMessageDataMap,
    AppMessageType,
    WebMessage,
    WebMessageData,
    WebMessageType,
} from '@chatic/bridge-messages';

import { toHostHandler, type ShellHandler, type ShellHandlerTable } from './handlerTable';

export interface ShellTransport {
    deliver(raw: string): Promise<boolean> | boolean;
}

export type ShellTraffic =
    | { direction: 'web→shell'; raw: string; message: WebMessage | undefined }
    | { direction: 'shell→web'; raw: string; message: { type: string } | undefined };

export interface ShellCoreOptions {
    transport: ShellTransport;
    supportedCacheTypes?: string[];
    retainTraffic?: boolean;
}

type Listener = (message: WebMessage) => void;

export class ShellCore {
    private host: AppBridgeHost;
    private readonly table = new Map<WebMessageType, ShellHandler<WebMessageType>>();
    private readonly log: WebMessage[] = [];
    private readonly handled = new Set<string>(['WebAppReady', 'Ping']);
    private hostHeard = false;
    readonly unhandled: string[] = [];
    readonly injectionErrors: string[] = [];
    readonly deliveryErrors: string[] = [];
    private readonly listeners = new Set<Listener>();
    private readonly observers = new Set<(traffic: ShellTraffic) => void>();
    private readonly dispatched: string[] = [];
    private readonly dispatchWaiters = new Set<{ type: string; resolve: () => void }>();

    constructor(private readonly options: ShellCoreOptions) {
        this.host = this.createHost();
    }

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

    handles(type: string): boolean {
        return this.handled.has(type);
    }

    get ready(): boolean {
        return this.hostHeard;
    }

    push<K extends AppMessageType>(type: K, data: AppMessageDataMap[K]): void {
        this.host.pushEvent({ type, success: true, data });
    }

    reboot(): void {
        this.host = this.createHost();
        this.hostHeard = false;
        this.log.length = 0;
        this.dispatched.length = 0;
    }

    observe(observer: (traffic: ShellTraffic) => void): () => void {
        this.observers.add(observer);
        return () => this.observers.delete(observer);
    }

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

    received<K extends WebMessageType>(type: K): WebMessageData<K>[] {
        return this.log.filter(message => message.type === type) as unknown as WebMessageData<K>[];
    }

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
            for (const listener of [...this.listeners]) listener(message);
        }
        await this.host.handleMessage(raw);
    }

    private createHost(): AppBridgeHost {
        const host: AppBridgeHost = new AppBridgeHost({
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
