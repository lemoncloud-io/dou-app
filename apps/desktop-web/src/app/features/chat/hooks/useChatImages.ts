import { useMemo } from 'react';

import type { DomainChat } from '@chatic/runtime';

import { useChatImagesStore } from '../stores';
import { toChatImages, type ChatImage } from '../utils';

const NONE: ChatImage[] = [];

export const useChatImages = (message: Pick<DomainChat, 'id' | 'upload$$'>): ChatImage[] => {
    const { id, upload$$ } = message;
    const fromMessage = useMemo(() => (id && upload$$?.length ? toChatImages(id, upload$$) : NONE), [id, upload$$]);
    const samples = useChatImagesStore(s => (id ? (s.byMessage[id] ?? NONE) : NONE));
    return fromMessage.length > 0 ? fromMessage : samples;
};
