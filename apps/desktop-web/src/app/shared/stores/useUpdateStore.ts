import { create } from 'zustand';

import type { OnUpdateStatusPayload } from '@chatic/app-messages';

/** Statuses pushed over the bridge (no 'idle' — that's the store's local initial sentinel). */
type WireStatus = OnUpdateStatusPayload['status'];

export type UpdateStatus = 'idle' | WireStatus;

interface UpdateState {
    status: UpdateStatus;
    version?: string;
    /** 0–100 while downloading. */
    percent: number;
    /** User chose "Later" for the current status; cleared when the status changes. */
    dismissed: boolean;
    set: (next: { status: WireStatus; version?: string; percent?: number }) => void;
    dismiss: () => void;
}

/**
 * Desktop auto-update UI state, fed by the shell's OnUpdateStatus bridge event
 * (see useAppUpdate). Transient — not persisted; a relaunch re-checks the feed.
 */
export const useUpdateStore = create<UpdateState>(set => ({
    status: 'idle',
    version: undefined,
    percent: 0,
    dismissed: false,
    set: ({ status, version, percent }) =>
        set(state => {
            // A status change re-surfaces the banner and resets progress; same-status
            // ticks (download progress) keep the prior dismiss and percent.
            const isStatusChange = status !== state.status;
            return {
                status,
                version: version ?? state.version,
                percent: percent ?? (isStatusChange ? 0 : state.percent),
                dismissed: isStatusChange ? false : state.dismissed,
            };
        }),
    dismiss: () => set({ dismissed: true }),
}));
