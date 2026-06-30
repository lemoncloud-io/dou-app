import { create } from 'zustand';

import { getSocketManager } from '@chatic/app-runtime';

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

/**
 * Global ring buffer of inbound socket frames for the debug tools. Lives in a
 * store (not component state) so the log survives tab switches and keeps
 * capturing even while the debug page is not on screen. Capture starts the
 * first time this module is imported (i.e. when the debug page is opened).
 */
export const useSocketFrameLogStore = create<SocketFrameLogState>(set => ({
    frames: [],
    paused: false,
    setPaused: paused => set({ paused }),
    clear: () => set({ frames: [] }),
}));

let seq = 0;

// Self-subscribe to the v2 socket manager: push every inbound envelope into the ring buffer.
// `onMessage` requires a live client and is NOT rebind-safe (unlike `onType`), so calling it at
// import time — before the socket connects — throws `Socket client not ready` and crashes the
// renderer. Bind through `subscribeClient` instead: attach the listener when a client appears,
// detach when it goes, and re-attach on reconnect. The v2 SocketMessage encodes domain+action in
// a single dotted `type` (e.g. `chat.feed`, `chat.create:ok`) with the payload on `data` — split
// the type for the debug display and read the chat number loosely.
let unbindFrame: (() => void) | undefined;
getSocketManager().subscribeClient(client => {
    unbindFrame?.();
    unbindFrame = undefined;
    if (!client) return;
    unbindFrame = getSocketManager().onMessage(({ message }) => {
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
});
