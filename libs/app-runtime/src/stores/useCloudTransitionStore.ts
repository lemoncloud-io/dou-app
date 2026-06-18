import { create } from 'zustand';

export type CloudTransitionStatus = 'idle' | 'switching' | 'recovering' | 'ready' | 'failed';

interface CloudTransitionState {
    status: CloudTransitionStatus;
    requestedCloudId: string | null;
    activeCloudId: string | null;
    traceId: string | null;
    lastError: string | null;
    begin: (cloudId: string, traceId: string) => void;
    markReady: (cloudId: string, traceId: string) => void;
    markRecovering: (traceId: string) => void;
    fail: (message: string, traceId: string) => void;
    reset: () => void;
}

export const useCloudTransitionStore = create<CloudTransitionState>(set => ({
    status: 'idle',
    requestedCloudId: null,
    activeCloudId: null,
    traceId: null,
    lastError: null,
    begin: (cloudId, traceId) =>
        set(state => ({
            status: 'switching',
            requestedCloudId: cloudId,
            activeCloudId: state.activeCloudId,
            traceId,
            lastError: null,
        })),
    markReady: (cloudId, traceId) =>
        set({
            status: 'ready',
            requestedCloudId: cloudId,
            activeCloudId: cloudId,
            traceId,
            lastError: null,
        }),
    markRecovering: traceId =>
        set(state => ({
            status: 'recovering',
            requestedCloudId: state.requestedCloudId,
            activeCloudId: state.activeCloudId,
            traceId,
        })),
    fail: (message, traceId) =>
        set(state => ({
            status: 'failed',
            requestedCloudId: state.requestedCloudId,
            activeCloudId: state.activeCloudId,
            traceId,
            lastError: message,
        })),
    reset: () =>
        set(state => ({
            status: 'idle',
            requestedCloudId: state.activeCloudId,
            activeCloudId: state.activeCloudId,
            traceId: null,
            lastError: null,
        })),
}));
