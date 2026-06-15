import { create } from 'zustand';

import { useWebSocketV2Store } from '@chatic/socket';

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

// Self-subscribe once: push every inbound envelope into the ring buffer.
useWebSocketV2Store.subscribe(
    s => s.lastMessage,
    msg => {
        if (!msg || useSocketFrameLogStore.getState().paused) return;
        // WSSEnvelope: { type=domain, action, payload, meta:{ref} } — read loosely.

        const m = msg as any;
        const frame: SocketFrame = {
            seq: ++seq,
            at: Date.now(),
            domain: m?.type ?? '?',
            action: m?.action ?? '',
            chatNo: m?.payload?.chatNo ?? m?.payload?.chat_no ?? null,
            raw: m,
        };
        useSocketFrameLogStore.setState(state => ({ frames: [frame, ...state.frames].slice(0, CAP) }));
    }
);
