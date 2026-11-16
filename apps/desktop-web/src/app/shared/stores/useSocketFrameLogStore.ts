import { create } from 'zustand';

import { runtime } from '@chatic/app-runtime';

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
let started = false;

/**
 * Start recording inbound socket frames into the ring buffer. Called once from the
 * runtime host's mount effect so the log covers the whole session — the debug page reads a buffer
 * that was already filling before it was opened, which is the point of it.
 *
 * Deliberately a function rather than work done at import time. This module sits in
 * the shared stores barrel, so an import-time `runtime.connection.onServerMessage()` made every
 * module that touched any store — including tests for unrelated hooks — need a live socket
 * runtime to exist.
 *
 * Guarded rather than merely documented as call-once: each `onServerMessage` call adds
 * its own listener, so a second call would record every frame twice.
 *
 * `onServerMessage` hears every frame on the active slot and re-attaches itself across
 * reconnects and slot changes, so it can be called before the socket connects. The
 * v2 SocketMessage encodes domain+action in a single dotted
 * `type` (e.g. `chat.feed`, `chat.create:ok`) with the payload on `data` — split the
 * type for the debug display and read the chat number loosely.
 */
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
    // Marked only once the listener is attached: a call that threw (no engine yet) leaves the next
    // call free to try again.
    started = true;
};
