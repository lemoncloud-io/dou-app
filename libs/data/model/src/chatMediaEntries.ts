import type { ChatMediaEntry } from '@chatic/bridge-messages';

import { isPendingUploadSlot } from './uploads';

import { uploadSlotKind } from './chatAttachments';
import { isEventChat, isNotifiableChat } from './chatPreview';
import { type InlineToken, tokenizeMessage } from './messageTokens';
import type { DomainChat } from './models';

export const CHAT_MEDIA_ENTRIES_VERSION = 1;

const inlineUrls = (tokens: readonly InlineToken[]): string[] =>
    tokens.flatMap(token => {
        if (token.type === 'url') return [token.value];
        if (token.type === 'bold' || token.type === 'italic' || token.type === 'strike') {
            return inlineUrls(token.children);
        }
        return [];
    });

const messageLinks = (content: string | undefined): string[] =>
    tokenizeMessage(content ?? '').flatMap(token => {
        if (token.type === 'codeBlock') return [];
        if (token.type === 'quote') return inlineUrls(token.children);
        return inlineUrls([token]);
    });

export const chatMediaEntries = (chat: DomainChat): ChatMediaEntry[] => {
    if (!chat.chatNo || chat.chatNo <= 0 || chat.isPending || chat.isFailed || chat.hidden) return [];
    if (!isNotifiableChat(chat) || isEventChat(chat)) return [];

    const slots = chat.upload$$ ?? [];
    const entries: ChatMediaEntry[] = [];
    slots.forEach((slot, index) => {
        if (isPendingUploadSlot(slot) || !slot.id) return;
        entries.push({ kind: uploadSlotKind(slot), idx: index, ref: slot.id });
    });

    const links = Array.from(new Set(messageLinks(chat.content)));
    links.forEach((url, order) => entries.push({ kind: 'link', idx: slots.length + order, ref: url }));
    return entries;
};
