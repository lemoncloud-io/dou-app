import { create } from 'zustand';
import { persist } from 'zustand/middleware';

import { RELAY_CLOUD_ID, type ChatAttachmentKind } from '@chatic/runtime';
import { deviceStore, persistStorageOver } from '../../storage';

/** What a saved message carried, snapshotted with it: the Files filter and the card's file tile read it. */
export interface SavedAttachment {
    kind: ChatAttachmentKind;
    count: number;
    /** The first file's name and size, where the message had a named one. */
    name?: string;
    size?: number;
    /** Every file is a voice file: the card names them so, as the sidebar does. */
    voice?: true;
}

/**
 * A bookmarked message, snapshotted at save time. Snapshot (not a live ref)
 * because the source row can page out of the chat cache; the saved list must
 * still render it.
 */
export interface SavedItem {
    /** The message's id (or optimistic fallback) — also the toggle key. */
    id: string;
    channelId: string;
    chatNo?: number;
    content: string;
    ownerName: string;
    /** Author identity, snapshotted so saved rows render the feed's avatar. */
    avatar?: string;
    colorSeed?: string;
    ownerId?: string;
    /**
     * Cloud the message was saved in — `RELAY_CLOUD_ID` (`'default'`) for the Default Cloud. The list is
     * one device-wide store, so this is what keeps a cloud's Saved page to its own messages. Absent on
     * items saved before it was kept (`isSavedInCloud` places those).
     */
    cloudId?: string;
    /**
     * Place the message belongs to — groups the list + drives cross-place jump. On the Default Cloud
     * this is the `'default'` sentinel, which names the cloud and is never a site id.
     */
    placeId?: string;
    /** Root chatNo string when this message is a thread reply; absent = top-level. */
    parentId?: string;
    /** When the message was sent; absent on items saved before it was kept. */
    sentAt?: number;
    /** Absent when the message carried nothing, or was saved before attachments were kept. */
    attachment?: SavedAttachment;
    savedAt: number;
}

interface SavedItemsState {
    items: Record<string, SavedItem>;
    toggle: (item: Omit<SavedItem, 'savedAt'>) => void;
    remove: (id: string) => void;
}

/**
 * Device-local "Saved items" (Slack's Later, without server sync — the backend
 * has no bookmark model). Persisted to localStorage; survives reloads, does not
 * follow the account across devices.
 */
export const useSavedItemsStore = create<SavedItemsState>()(
    persist(
        set => ({
            items: {},
            toggle: item =>
                set(state => {
                    const next = { ...state.items };
                    if (next[item.id]) delete next[item.id];
                    else next[item.id] = { ...item, savedAt: Date.now() };
                    return { items: next };
                }),
            remove: id =>
                set(state => {
                    const next = { ...state.items };
                    delete next[id];
                    return { items: next };
                }),
        }),
        { name: 'chatic-saved-items', storage: persistStorageOver(deviceStore) }
    )
);

/** Where the session is, in the shape a save records it: `getActiveServerContext()`'s fields. */
export interface SavedOriginServer {
    kind: 'relay' | 'cloud';
    cloudId?: string;
    siteId?: string | null;
}

/**
 * The cloud and place a message saved now belongs to. The home screen scopes the Default Cloud by the
 * `'default'` sentinel rather than by one of its places, so its items are tagged with that key for both.
 */
export const savedOriginOf = (server: SavedOriginServer): Pick<SavedItem, 'cloudId' | 'placeId'> =>
    server.kind === 'cloud'
        ? { cloudId: server.cloudId, placeId: server.siteId ?? undefined }
        : { cloudId: RELAY_CLOUD_ID, placeId: RELAY_CLOUD_ID };

/**
 * Whether a saved item belongs to the cloud the Saved page is showing. Opening an item jumps within the
 * active cloud — a place switch at most — so an item from another cloud must not be listed: its place
 * would be sent as a site of this cloud, and the Default Cloud's `'default'` sentinel is no site at all.
 *
 * An item that records its cloud is that cloud's. One saved before the cloud was kept can only be placed
 * roughly, because every cloud numbers its places from the same start — a place id names one in every
 * cloud. Its `'default'` place is the Default Cloud's; a real place is some cloud's, so it shows in every
 * cloud but the Default Cloud, and may open the same-numbered place of the cloud it is opened in; one with
 * no place at all opens without a switch, so it shows everywhere.
 */
export const isSavedInCloud = (item: Pick<SavedItem, 'cloudId' | 'placeId'>, cloudId: string): boolean => {
    if (item.cloudId) return item.cloudId === cloudId;
    if (!item.placeId) return true;
    return (item.placeId === RELAY_CLOUD_ID) === (cloudId === RELAY_CLOUD_ID);
};

/** The pages that take the main pane in place of a conversation. */
export type MainPanePage = 'saved' | 'threads';

interface SavedPageState {
    isOpen: boolean;
    /** Which page holds the main pane while `isOpen`. */
    page: MainPanePage;
    /** The card last opened from the page; marked when the page opens again. */
    openedId: string | null;
    open: (page?: MainPanePage) => void;
    close: () => void;
    markOpened: (id: string) => void;
}

/**
 * Whether a page — Saved items or Threads — holds the main pane (HomePage closes it when a conversation
 * opens). One store for both, so every move that leaves the Saved page leaves the Threads page too.
 */
export const useSavedPageStore = create<SavedPageState>(set => ({
    isOpen: false,
    page: 'saved',
    openedId: null,
    open: (page = 'saved') => set({ isOpen: true, page }),
    close: () => set({ isOpen: false }),
    markOpened: id => set({ openedId: id }),
}));
