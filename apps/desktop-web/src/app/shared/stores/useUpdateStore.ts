import { create } from 'zustand';

import type { OnUpdateStatusPayload } from '@chatic/bridge-messages';

type WireStatus = OnUpdateStatusPayload['status'];

export type UpdateStatus = 'idle' | WireStatus;

interface UpdateState {
    status: UpdateStatus;
    version?: string;
    percent: number;
    dismissed: boolean;
    set: (next: { status: WireStatus; version?: string; percent?: number }) => void;
    dismiss: () => void;
}

export const useUpdateStore = create<UpdateState>(set => ({
    status: 'idle',
    version: undefined,
    percent: 0,
    dismissed: false,
    set: ({ status, version, percent }) =>
        set(state => {
            const isStatusChange = status !== state.status;
            const isNewVersion = version !== undefined && version !== state.version;
            return {
                status,
                version: version ?? state.version,
                percent: percent ?? (isStatusChange ? 0 : state.percent),
                dismissed: isStatusChange || isNewVersion ? false : state.dismissed,
            };
        }),
    dismiss: () => set({ dismissed: true }),
}));
