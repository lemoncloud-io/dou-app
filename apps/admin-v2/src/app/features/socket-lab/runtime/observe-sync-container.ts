/**
 * `runtime/observe-sync-container.ts`
 * - Observe 탭 전용 읽기 전용 WS 컨테이너 (스테이지당 1개, Probe 컨테이너와 분리)
 * - DeviceSyncPlan pull로 관측 디바이스 상태를 주기 동기화. auth.update 없이 device.save 등록만 수행.
 */
import {
    createClientSocketV2,
    createDeviceRuntime,
    type ClientSocketState,
    type DeviceSocketRuntime,
    type DeviceView,
} from '@lemoncloud/chatic-sockets-lib';

import type { UsersStage } from '../api/userApi';
import { createShortDeviceId } from '../demo-model';

export type ObserveSyncEvent =
    | { type: 'state'; state: ClientSocketState }
    | { type: 'update'; deviceId: string; view: DeviceView }
    | { type: 'sync'; at: number };

export interface ObserveSyncContainer {
    readonly stage: UsersStage;
    getState(): ClientSocketState;
    subscribe(listener: (event: ObserveSyncEvent) => void): () => void;
    connect(): Promise<void>;
    /** 관측 대상 전체 교체 — diff로 start/stopSync 반영 */
    setTargets(deviceIds: string[]): void;
    dispose(): Promise<void>;
}

const SYNC_INTERVAL_MS = 5000;

export const getObserveWsUrl = (stage: UsersStage): string => {
    const ws = `${import.meta.env.VITE_WS_ENDPOINT ?? ''}`.trim();
    if (!ws) return '';
    if (stage !== 'd1' && !ws.includes('cht-d1')) return '';
    return `${ws.replace('cht-d1', `cht-${stage}`)}?v2`;
};

export const diffTargets = (desired: Set<string>, applied: Set<string>): { start: string[]; stop: string[] } => ({
    start: [...desired].filter(id => !applied.has(id)),
    stop: [...applied].filter(id => !desired.has(id)),
});

export const createObserveSyncContainer = (stage: UsersStage): ObserveSyncContainer => {
    const wsUrl = getObserveWsUrl(stage);
    const observerId = `admin-observer-${createShortDeviceId()}`;
    const observerSeed = { id: observerId, name: observerId, platform: 'web' as const, status: 'green' as const };

    const listeners = new Set<(event: ObserveSyncEvent) => void>();
    const emit = (event: ObserveSyncEvent) => listeners.forEach(fn => fn(event));

    let runtime: DeviceSocketRuntime | null = null;
    let state: ClientSocketState = 'idle';
    let disposed = false;
    const desired = new Set<string>();
    const applied = new Set<string>();
    const cleanups: Array<() => void> = [];

    const applyTargets = () => {
        const rt = runtime;
        if (!rt) return;
        const { start, stop } = diffTargets(desired, applied);
        start.forEach(id => {
            rt.startDeviceSync(id, SYNC_INTERVAL_MS);
            applied.add(id);
        });
        stop.forEach(id => {
            rt.stopSync({ type: 'device', id });
            applied.delete(id);
        });
    };

    const connect = async (): Promise<void> => {
        if (runtime || disposed || !wsUrl) return;
        const client = createClientSocketV2({
            url: wsUrl,
            requestTimeoutMs: 5000,
            device: observerSeed,
            keepAlive: false,
            reconnect: false,
        });

        const $request = client.request.bind(client);
        client.request = (async (type: unknown, data?: unknown, options?: unknown) => {
            const result = await $request(type as never, data as never, options as never);
            const typeName = typeof type === 'string' ? type : `${(type as { type?: string })?.type ?? ''}`;
            if (typeName === 'device.read') {
                emit({ type: 'sync', at: Date.now() });
                const view = result as DeviceView | undefined;
                const id = `${view?.id ?? (data as { id?: string } | null)?.id ?? ''}`.trim();
                if (id && view) emit({ type: 'update', deviceId: id, view });
            }
            return result;
        }) as typeof client.request;

        const next = createDeviceRuntime({
            client,
            keepAliveOptions: { intervalMs: 30000, timeoutMs: 5000 },
            reconnectOptions: { minDelayMs: 500, maxDelayMs: 10000 },
            rotationOptions: { maxLifetimeMs: 110 * 60 * 1000, refreshBeforeMs: 10 * 60 * 1000 },
            devicePlanOptions: {
                intervalMs: SYNC_INTERVAL_MS,
                sendSyncHint: false,
                idleBackoff: { factor: 1, maxMs: SYNC_INTERVAL_MS },
            },
        });

        cleanups.push(
            client.onState(event => {
                state = event.next;
                emit({ type: 'state', state });
            })
        );

        runtime = next;
        try {
            await next.start();
            state = client.state;
            emit({ type: 'state', state });
            await next.device.save(observerSeed).catch(() => undefined);
            applyTargets();
        } catch {
            runtime = null;
            cleanups.splice(0).forEach(fn => fn());
            await next.stop().catch(() => undefined);
            state = 'closed';
            emit({ type: 'state', state });
        }
    };

    return {
        stage,
        getState: () => state,
        subscribe(listener) {
            listeners.add(listener);
            return () => listeners.delete(listener);
        },
        connect,
        setTargets: deviceIds => {
            desired.clear();
            deviceIds.forEach(id => {
                const t = `${id ?? ''}`.trim();
                if (t) desired.add(t);
            });
            applyTargets();
        },
        dispose: async () => {
            disposed = true;
            const current = runtime;
            runtime = null;
            cleanups.splice(0).forEach(fn => fn());
            applied.clear();
            if (current) await current.stop().catch(() => undefined);
            state = 'closed';
        },
    };
};
