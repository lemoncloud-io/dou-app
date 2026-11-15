import type { ChatMediaEntry } from '@chatic/bridge-messages';

import { isPendingUploadSlot } from '../uploads/types';

import { uploadSlotKind } from './chatAttachments';
import { isEventChat, isNotifiableChat } from './chatPreview';
import { type InlineToken, tokenizeMessage } from './messageTokens';
import type { DomainChat } from './models';

/**
 * The version of the rules below. Raise it whenever `chatMediaEntries` would answer differently for a
 * row it has already answered for: each room remembers which version it was indexed under, so a room
 * indexed under an older one is indexed again the next time it is read.
 */
export const CHAT_MEDIA_ENTRIES_VERSION = 1;

/** The URLs a run of inline tokens links, in reading order — marks nest, so their children are read too. */
const inlineUrls = (tokens: readonly InlineToken[]): string[] =>
    tokens.flatMap(token => {
        if (token.type === 'url') return [token.value];
        if (token.type === 'bold' || token.type === 'italic' || token.type === 'strike') {
            return inlineUrls(token.children);
        }
        return [];
    });

/**
 * The links of a message's text: exactly the `url` runs the bubble draws as links, labelled ones
 * included. Read through the bubble's own tokenizer so an address inside code — a fence or an inline
 * span — is not a link here either, as it is not in the bubble.
 */
const messageLinks = (content: string | undefined): string[] =>
    tokenizeMessage(content ?? '').flatMap(token => {
        if (token.type === 'codeBlock') return [];
        if (token.type === 'quote') return inlineUrls(token.children);
        return inlineUrls([token]);
    });

/**
 * A message as its media index entries: one per attachment and one per distinct link, in message
 * order. This is the one place a kind is decided — the shell's SQLite and IndexedDB only store what it
 * returns, so the two stores can never disagree about what a message holds.
 *
 * - A message that is not a sent, visible message has none: unsent or failed (`chatNo` 0, `isPending`,
 *   `isFailed`), deleted (`hidden`), server-generated (`stereo: 'system'`), or an event about another
 *   message (a reaction or a revision notice). Its empty list is what removes the entries a message
 *   had before it was deleted.
 * - An attachment slot counts once it is on the server with an id. A slot still on its way has nothing
 *   to open yet; a slot the server marked failed still counts, since the sender picked it and the
 *   screen that lists it draws its state, as the message itself does.
 * - A link counts once per message however often it appears.
 * - A thread reply counts like any other message of its room.
 *
 * `idx` is the attachment's `upload$$` position, and for a link the slot count plus its order among the
 * message's distinct links — positions, not a running count, so a slot skipped above does not shift
 * the rest.
 */
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
