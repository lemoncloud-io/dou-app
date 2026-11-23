import { create } from 'zustand';

export interface MessageJumpTarget {
    channelId: string;
    chatNo: number;
    threadRootNo?: string;
    highlight?: boolean;
    block?: 'center' | 'start';
    quiet?: boolean;
    nonce: number;
}

export interface MessageJumpOptions {
    threadRootNo?: string;
    highlight?: boolean;
    block?: 'center' | 'start';
    quiet?: boolean;
}

interface MessageJumpState {
    target: MessageJumpTarget | null;
    request: (channelId: string, chatNo: number, options?: MessageJumpOptions) => void;
    clear: () => void;
}

let nonceCounter = 0;

export const useMessageJumpStore = create<MessageJumpState>(set => ({
    target: null,
    request: (channelId, chatNo, options) => {
        nonceCounter += 1;
        set({ target: { channelId, chatNo, threadRootNo: options?.threadRootNo, ...options, nonce: nonceCounter } });
    },
    clear: () => set({ target: null }),
}));

export const isJumpTargetFor = (
    target: MessageJumpTarget | null,
    channelId: string,
    threadRootNo?: string
): target is MessageJumpTarget => !!target && target.channelId === channelId && target.threadRootNo === threadRootNo;
