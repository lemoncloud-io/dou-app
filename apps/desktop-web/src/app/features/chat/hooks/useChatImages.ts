import { useChatImagesStore } from '../stores';
import type { ChatImage } from '../utils';

const NONE: ChatImage[] = [];

/**
 * The images a message carries. Reads the client-side store only — the server has no
 * image field yet (see `useChatImagesStore`); this is the seam that learns it later.
 * Returns one shared empty array so a memo'd row does not re-render for "still none".
 */
export const useChatImages = (messageId: string | undefined): ChatImage[] =>
    useChatImagesStore(s => (messageId ? (s.byMessage[messageId] ?? NONE) : NONE));
