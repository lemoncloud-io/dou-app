import { create } from 'zustand';

export type ChannelSyncStatus = 'idle' | 'syncing' | 'synced' | 'error';

export interface ChannelSyncStoreState {
    /** cloud별 syncedAt cursor */
    syncedAtMap: Record<string, number>;
    /** 현재 sync 상태 */
    status: ChannelSyncStatus;
    /** 에러 메시지 (status가 error일 때) */
    errorMessage: string | null;

    /** 특정 cloud의 syncedAt 조회 */
    getSyncedAt: (cloudId: string) => number;
    /** 특정 cloud의 syncedAt 저장 */
    setSyncedAt: (cloudId: string, syncedAt: number) => void;
    /** sync 상태 변경 */
    setStatus: (status: ChannelSyncStatus, errorMessage?: string) => void;
    /** 전체 초기화 */
    reset: () => void;
}

export const useChannelSyncStore = create<ChannelSyncStoreState>((set, get) => ({
    syncedAtMap: {},
    status: 'idle',
    errorMessage: null,

    getSyncedAt: (cloudId: string) => get().syncedAtMap[cloudId] ?? 0,

    setSyncedAt: (cloudId: string, syncedAt: number) =>
        set(prev => ({
            syncedAtMap: { ...prev.syncedAtMap, [cloudId]: syncedAt },
        })),

    setStatus: (status: ChannelSyncStatus, errorMessage?: string) =>
        set({ status, errorMessage: errorMessage ?? null }),

    reset: () => set({ syncedAtMap: {}, status: 'idle', errorMessage: null }),
}));
