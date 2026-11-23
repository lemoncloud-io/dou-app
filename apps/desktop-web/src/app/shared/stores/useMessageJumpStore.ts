import { create } from 'zustand';

export interface MessageJumpTarget {
    channelId: string;
    chatNo: number | null;
    restore: boolean;
    nonce: number;
}

export interface MessageJumpOrigin {
    cloudId: string;
    placeId: string | null;
    channelId: string;
    label: string;
    anchorChatNo: number | null;
    threadRootId: string | null;
    sameChannel: boolean;
}

export interface ReadingPosition {
    channelId: string;
    chatNo: number | null;
}

interface MessageJumpState {
    target: MessageJumpTarget | null;
    origin: MessageJumpOrigin | null;
    position: ReadingPosition | null;
    request: (channelId: string, chatNo: number | null, options?: { restore?: boolean }) => void;
    setOrigin: (origin: MessageJumpOrigin | null) => void;
    clearOrigin: () => void;
    setPosition: (position: ReadingPosition) => void;
    clear: () => void;
}

let requestCount = 0;

export const useMessageJumpStore = create<MessageJumpState>((set, get) => ({
    target: null,
    origin: null,
    position: null,
    request: (channelId, chatNo, options) => {
        requestCount += 1;
        set({ target: { channelId, chatNo, restore: options?.restore ?? false, nonce: requestCount } });
    },
    setOrigin: origin => set({ origin }),
    clearOrigin: () => set({ origin: null }),
    setPosition: position => {
        const current = get().position;
        if (current?.channelId === position.channelId && current.chatNo === position.chatNo) return;
        set({ position });
    },
    clear: () => set({ target: null }),
}));
