import type { Page, TestInfo } from '@playwright/test';

import type { FakeBackend, HttpFault, SocketFault } from '../fixtures/backend';
import { E2E_ENDPOINTS } from './env';

export interface ChaosEvent {
    at: number;
    kind: 'fault' | 'heal' | 'recovered';
    what: string;
}

export const CHAOS_TIMELINE_ATTACHMENT = 'chaos-timeline';

export class Chaos {
    readonly timeline: ChaosEvent[] = [];
    private readonly startedAt = Date.now();
    private lastFaultAt = 0;
    private readonly injected: { what: string; faults: { hits?: number }[] }[] = [];
    private linkDown = false;
    private watchingLoads = false;

    constructor(
        private readonly page: Page,
        private readonly backend: FakeBackend
    ) {}

    async dropSocket({ downFor = 0, endpoint }: { downFor?: number; endpoint?: string } = {}): Promise<void> {
        const name = endpoint ? `socket ${endpoint}` : 'relay socket';
        this.fault(downFor ? `${name} dropped, refused for ${downFor} ms` : `${name} dropped`);
        if (downFor) {
            await this.backend.refuseSockets(downFor, endpoint);
            setTimeout(() => this.record('heal', `${name} accepted again`), downFor);
        } else if (endpoint) {
            await this.backend.closeSocketsAt(endpoint);
        } else {
            await this.backend.dropSockets();
        }
    }

    async offline(): Promise<void> {
        this.fault('network offline');
        await this.backend.setNetworkDown(true);
        this.linkDown = true;
        this.watchLoads();
        await setLink(this.page, false);
    }

    async online(): Promise<void> {
        await this.backend.setNetworkDown(false);
        this.linkDown = false;
        await setLink(this.page, true);
        this.record('heal', 'network online');
    }

    latency(
        ms: number,
        targets: { socket?: (string | RegExp)[]; http?: (string | RegExp)[]; endpoint?: string }
    ): () => void {
        const faults: (SocketFault | HttpFault)[] = [
            ...(targets.socket ?? []).map((type): SocketFault => ({ type, delayMs: ms, endpoint: targets.endpoint })),
            ...(targets.http ?? []).map((match): HttpFault => ({ match, delayMs: ms })),
        ];
        const lifts = faults.map(fault =>
            'type' in fault ? this.backend.addSocketFault(fault) : this.backend.addHttpFault(fault)
        );
        const on = targets.endpoint ? ` @ ${targets.endpoint}` : '';
        this.inject(`+${ms} ms on ${describe([...(targets.socket ?? []), ...(targets.http ?? [])])}${on}`, faults);
        return () => {
            lifts.forEach(lift => lift());
            this.record('heal', `latency lifted (${ms} ms)`);
        };
    }

    failHttp(match: string | RegExp, fault: Omit<HttpFault, 'match' | 'hits'>): () => void {
        const what = fault.hang ? 'hangs' : `answers ${fault.status ?? 500}`;
        const entry: HttpFault = { status: fault.hang ? undefined : 500, ...fault, match };
        this.inject(`${String(match)} ${what}${timesOf(fault.times)}`, [entry]);
        return this.backend.addHttpFault(entry);
    }

    failSocket(type: string | RegExp, fault: Omit<SocketFault, 'type' | 'hits'>): () => void {
        const what = fault.drop ? 'never answered' : `refused (${fault.error ?? '500'})`;
        const entry: SocketFault = {
            error: fault.drop ? undefined : '500 INTERNAL SERVER ERROR - e2e: chaos',
            ...fault,
            type,
        };
        this.inject(`socket ${String(type)} ${what}${timesOf(fault.times)}`, [entry]);
        return this.backend.addSocketFault(entry);
    }

    async expireToken({ refreshFailures = 0 }: { refreshFailures?: number } = {}): Promise<void> {
        const faults: SocketFault[] = [
            {
                type: 'auth.update',
                endpoint: E2E_ENDPOINTS.socket,
                error: '401 UNAUTHORIZED - token expired',
                times: 1,
            },
        ];
        if (refreshFailures) {
            faults.push({
                type: 'auth.refresh',
                endpoint: E2E_ENDPOINTS.socket,
                error: '500 INTERNAL SERVER ERROR - e2e: renewal failed',
                times: refreshFailures,
            });
        }
        const more = refreshFailures ? `, next ${refreshFailures} renewal(s) refused` : '';
        this.inject(`relay credential expired${more}`, faults);
        faults.forEach(fault => this.backend.addSocketFault(fault));
        await this.backend.dropSockets();
    }

    recovered(what: string): void {
        const since = this.lastFaultAt ? `+${Date.now() - this.lastFaultAt} ms after the last fault` : 'no fault yet';
        this.record('recovered', `${what} (${since})`);
    }

    unfired(): string[] {
        return this.injected.filter(group => group.faults.every(fault => !fault.hits)).map(group => group.what);
    }

    async attachTo(testInfo: TestInfo): Promise<void> {
        if (this.timeline.length === 0) return;
        await testInfo.attach(CHAOS_TIMELINE_ATTACHMENT, {
            body: JSON.stringify(this.timeline, null, 2),
            contentType: 'application/json',
        });
    }

    private inject(what: string, faults: { hits?: number }[]): void {
        this.injected.push({ what, faults });
        this.fault(what);
    }

    private watchLoads(): void {
        if (this.watchingLoads) return;
        this.watchingLoads = true;
        this.page.on('domcontentloaded', () => {
            if (this.linkDown) void setLink(this.page, false).catch(() => undefined);
        });
    }

    private fault(what: string): void {
        this.lastFaultAt = Date.now();
        this.record('fault', what);
    }

    private record(kind: ChaosEvent['kind'], what: string): void {
        this.timeline.push({ at: Date.now() - this.startedAt, kind, what });
    }
}

const setLink = (page: Page, online: boolean): Promise<void> =>
    page.evaluate(next => {
        const state = window as unknown as { __e2eOnline?: boolean };
        if (state.__e2eOnline === undefined) {
            Object.defineProperty(Navigator.prototype, 'onLine', {
                configurable: true,
                get: () => state.__e2eOnline ?? true,
            });
        }
        state.__e2eOnline = next;
        window.dispatchEvent(new Event(next ? 'online' : 'offline'));
    }, online);

const describe = (targets: (string | RegExp)[]): string => targets.map(String).join(', ') || 'nothing';

const timesOf = (times: number | undefined): string => (times === undefined ? '' : ` ×${times}`);
