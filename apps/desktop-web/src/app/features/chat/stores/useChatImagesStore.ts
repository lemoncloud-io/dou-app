import { create } from 'zustand';

import type { ChatImage } from '../utils';

interface ChatImagesState {
    /** Images per message, keyed by the server message id (settled rows only). */
    byMessage: Record<string, ChatImage[]>;
    setImages: (messageId: string, images: ChatImage[]) => void;
    /** "Delete file" on one image; the message loses its entry once none are left. */
    removeImage: (messageId: string, imageId: string) => void;
    clear: () => void;
}

/**
 * The debug panel's sample images, hung on real messages so the feed grid, the hover
 * actions and the viewer can be exercised on any row. `useChatImages` reads it only for
 * a message that carries no images of its own. In memory on purpose: the object URLs it
 * holds die with the page anyway.
 */
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
