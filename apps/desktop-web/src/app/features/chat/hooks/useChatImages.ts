import { useMemo } from 'react';

import type { DomainChat } from '@chatic/data';

import { useChatImagesStore } from '../stores';
import { toChatImages, type ChatImage } from '../utils';

const NONE: ChatImage[] = [];

/**
 * The images a message carries — the one reader of them. A message's own `upload$$` (its uploads
 * once sent, its local previews while it is on its way) comes first. The debug panel's sample store
 * is read only for a message that has none, so the grid can still be exercised on any row.
 * Returns one shared empty array so a memo'd row does not re-render for "still none".
 */
export const useChatImages = (message: Pick<DomainChat, 'id' | 'upload$$'>): ChatImage[] => {
    const { id, upload$$ } = message;
    const fromMessage = useMemo(() => (id && upload$$?.length ? toChatImages(id, upload$$) : NONE), [id, upload$$]);
    const samples = useChatImagesStore(s => (id ? (s.byMessage[id] ?? NONE) : NONE));
    return fromMessage.length > 0 ? fromMessage : samples;
};
