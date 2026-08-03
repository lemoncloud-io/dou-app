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
let unbindFrame: (() => void) | undefined;

/**
 * Start recording inbound socket frames into the ring buffer. Called once from the
 * runtime host so the log covers the whole session — the debug page reads a buffer
 * that was already filling before it was opened, which is the point of it.
 *
 * Deliberately a function rather than work done at import time. This module sits in
 * the shared stores barrel, so an import-time `getSocketManager()` made every module
 * that touched any store — including tests for unrelated hooks — need a live socket
 * runtime to exist.
 *
 * `onMessage` requires a live client and is NOT rebind-safe (unlike `onType`), so
 * calling it before the socket connects throws `Socket client not ready`. Bind through
 * `subscribeClient` instead: attach when a client appears, detach when it goes, and
 * re-attach on reconnect. The v2 SocketMessage encodes domain+action in a single dotted
 * `type` (e.g. `chat.feed`, `chat.create:ok`) with the payload on `data` — split the
 * type for the debug display and read the chat number loosely.
 */
export const startSocketFrameLog = (): void => {
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
};
