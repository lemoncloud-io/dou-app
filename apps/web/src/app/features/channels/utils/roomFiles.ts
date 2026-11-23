import {
    chatMediaItems,
    type ChatFileSlot,
    type DomainChat,
    type MediaItem,
    type RoomMediaItem,
} from '@chatic/runtime';

import { hiddenMediaKey } from '../lib/localMediaPrefs';

export type ChatMediaKind = RoomMediaItem['kind'];

export type RoomFilesTab = 'media' | 'file' | 'audio' | 'link';
export const ROOM_FILES_TABS: readonly RoomFilesTab[] = ['media', 'file', 'audio', 'link'];
export const TAB_KINDS: Record<RoomFilesTab, readonly ChatMediaKind[]> = {
    media: ['image', 'video'],
    file: ['file'],
    audio: ['audio'],
    link: ['link'],
};

export const parseRoomFilesTab = (value: string | null | undefined): RoomFilesTab =>
    ROOM_FILES_TABS.includes(value as RoomFilesTab) ? (value as RoomFilesTab) : 'media';

export const SELECTION_EXPORT_MAX = 10;

export interface RoomFileEntry {
    key: string;
    kind: ChatMediaKind;
    idx: number;
    chatNo: number;
    chatId: string;
    chat: DomainChat;
    ref: string;
    file?: ChatFileSlot;
    media?: MediaItem;
    senderName: string;
    sentAt: number;
}

export const toRoomFileEntry = (item: RoomMediaItem, cid: string): RoomFileEntry | undefined => {
    const chat = item.chat;
    const base = {
        key: hiddenMediaKey(chat.channelId, item.chatNo, item.idx),
        kind: item.kind,
        idx: item.idx,
        chatNo: item.chatNo,
        chatId: item.chatId,
        chat,
        ref: item.ref,
        senderName: chat.owner$?.name ?? chat.ownerId ?? '',
        sentAt: chat.createdAtMs ?? 0,
    };
    if (item.kind === 'link') return base;
    const split = chatMediaItems(chat.cid || cid, chat.upload$$);
    if (item.kind === 'image' || item.kind === 'video') {
        const at = split.mediaSlots.indexOf(item.idx);
        const media = at >= 0 ? split.media[at] : undefined;
        return media ? { ...base, media } : undefined;
    }
    const at = split.fileSlots.indexOf(item.idx);
    const file = at >= 0 ? split.files[at] : undefined;
    return file ? { ...base, file } : undefined;
};

export const mergeNewestFirst = (
    pages: ReadonlyArray<{ items: readonly RoomFileEntry[]; next: number | null | undefined }>
): RoomFileEntry[] => {
    const floor = Math.max(
        0,
        ...pages
            .filter(page => page.next !== null)
            .map(page => (page.items.length ? page.items[page.items.length - 1]!.chatNo : Number.POSITIVE_INFINITY))
    );
    return pages
        .flatMap(page => page.items)
        .filter(entry => entry.chatNo >= floor)
        .sort((a, b) => b.chatNo - a.chatNo || a.idx - b.idx);
};

export const groupByMonth = (
    entries: readonly RoomFileEntry[],
    locale: string
): Array<{ key: string; label: string; entries: RoomFileEntry[] }> => {
    const format = new Intl.DateTimeFormat(locale, { year: 'numeric', month: 'long' });
    const groups: Array<{ key: string; label: string; entries: RoomFileEntry[] }> = [];
    for (const entry of entries) {
        const date = new Date(entry.sentAt);
        const key = `${date.getFullYear()}-${date.getMonth()}`;
        const last = groups[groups.length - 1];
        if (last?.key === key) last.entries.push(entry);
        else groups.push({ key, label: format.format(date), entries: [entry] });
    }
    return groups;
};

export const matchesRoomFileSearch = (entry: RoomFileEntry, query: string): boolean => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    const haystack = [entry.senderName, entry.kind === 'link' ? entry.ref : (entry.file?.name ?? entry.media?.name)]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
    return haystack.includes(needle);
};

export const selectionActionState = (count: number) => ({
    save: count > 0 && count <= SELECTION_EXPORT_MAX,
    share: count === 1,
    delete: count > 0,
    overLimit: count > SELECTION_EXPORT_MAX,
});
