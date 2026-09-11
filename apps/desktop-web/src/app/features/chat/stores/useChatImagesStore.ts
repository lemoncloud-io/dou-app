import { create } from 'zustand';

import type { ChatImage } from '../utils';

interface ChatImagesState {
    /** Images per message, keyed by the server message id (settled rows only). */
    byMessage: Record<string, ChatImage[]>;
    setImages: (messageId: string, images: ChatImage[]) => void;
    /** "파일 삭제" on one image; the message loses its entry once none are left. */
    removeImage: (messageId: string, imageId: string) => void;
    clear: () => void;
}

/**
 * Client-side home of message images until the server has an upload API.
 *
 * Nothing on the wire carries images yet, so this is the only source `useChatImages`
 * reads — filled today by the debug panel's sample images, so the feed, the grid and
 * the viewer can be exercised on real messages. In memory on purpose: the object URLs
 * it holds die with the page anyway.
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
