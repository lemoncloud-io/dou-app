import { create } from 'zustand';

import { runtime } from '@chatic/runtime-react';

const CAP = 200;

export interface SocketFrame {
    seq: number;
    at: number;
    domain: string;
    action: string;
    chatNo: number | null;
    raw: unknown;
}

interface SocketFrameLogState {
    frames: SocketFrame[];
    paused: boolean;
    setPaused: (paused: boolean) => void;
    clear: () => void;
}

export const useSocketFrameLogStore = create<SocketFrameLogState>(set => ({
    frames: [],
    paused: false,
    setPaused: paused => set({ paused }),
    clear: () => set({ frames: [] }),
}));

let seq = 0;
let started = false;

export const startSocketFrameLog = (): void => {
    if (started) return;
    runtime.connection.onServerMessage(message => {
        if (useSocketFrameLogStore.getState().paused) return;
        const m = message as { type?: string; data?: { chatNo?: number; chat_no?: number } | null };
        const type = m?.type ?? '?';
        const dot = type.indexOf('.');
        const frame: SocketFrame = {
            seq: ++seq,
            at: Date.now(),
            domain: dot >= 0 ? type.slice(0, dot) : type,
            action: dot >= 0 ? type.slice(dot + 1) : '',
            chatNo: m?.data?.chatNo ?? m?.data?.chat_no ?? null,
            raw: message,
        };
        useSocketFrameLogStore.setState(state => ({ frames: [frame, ...state.frames].slice(0, CAP) }));
    });
    started = true;
};
