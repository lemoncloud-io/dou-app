import { create } from 'zustand';

import type { ChatImage } from '../utils';

interface ChatImagesState {
    byMessage: Record<string, ChatImage[]>;
    setImages: (messageId: string, images: ChatImage[]) => void;
    removeImage: (messageId: string, imageId: string) => void;
    clear: () => void;
}

export const useChatImagesStore = create<ChatImagesState>(set => ({
    byMessage: {},
    setImages: (messageId, images) => set(state => ({ byMessage: { ...state.byMessage, [messageId]: images } })),
    removeImage: (messageId, imageId) =>
        set(state => {
            const current = state.byMessage[messageId];
            if (!current) return state;
            const next = current.filter(image => image.id !== imageId);
            if (next.length > 0) return { byMessage: { ...state.byMessage, [messageId]: next } };
            const { [messageId]: _removed, ...rest } = state.byMessage;
            return { byMessage: rest };
        }),
    clear: () => set({ byMessage: {} }),
}));
