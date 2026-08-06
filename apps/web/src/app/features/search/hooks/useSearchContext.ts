import { useEffect, useMemo, useState } from 'react';

import { globalCacheProfileKey, globalCacheRefKey, useGlobalCacheSearch } from '@chatic/app-runtime';
import type { GlobalCacheContext, GlobalCacheRef } from '@chatic/data';
import { logger } from '@chatic/bridges';

import { countUnread, readCursorOf } from '../../home/lib';
import type { CloudSearchResult, GlobalSearchResults } from './useGlobalSearch';

const EMPTY_CONTEXT: GlobalCacheContext = {
    channelsByRef: {},
    sitesByRef: {},
    joinsByRef: {},
    lastChatsByRef: {},
    profilesByRef: {},
    usersByRef: {},
};

/** One place result row — the cache row already carries everything it shows. */
export interface PlaceResultRow {
    cid: string;
    placeId: string;
    name: string;
    thumbnail?: string;
}

export interface ChannelResultRow {
    cid: string;
    sid?: string;
    channelId: string;
    name: string;
    thumbnail?: string;
    memberNo?: number;
    /** Cached `(chatNo - metaNo) - readNo`; 0 when this cloud has no join row cached. */
    unread: number;
    lastMessage?: string;
    lastMessageAt?: number;
    placeName?: string;
}

export interface ChatResultRow {
    cid: string;
    sid?: string;
    chatId: string;
    channelId: string;
    chatNo: number;
    content: string;
    createdAt?: number;
    channelName?: string;
    placeName?: string;
    /**
     * Sender's place-profile nick — the identity other members actually see. Falls back to the
     * account NAME (never the account nick) and then to the owner embedded on the message.
     */
    senderName?: string;
    /** Place-profile photo only: an account-level image is not this person's identity here. */
    senderThumbnail?: string;
}

export interface SearchResultRows {
    clouds: CloudSearchResult[];
    places: PlaceResultRow[];
    channels: ChannelResultRow[];
    chats: ChatResultRow[];
}

/**
 * Turns raw search matches into flat display rows, filling in what the matched row itself cannot
 * carry: the owning place/channel names, my unread count and the newest cached message.
 *
 * These come from `resolveContext`, a batch read, rather than from per-row hooks: the home row's
 * `useChannelSync`/`useChatSync`/`useLastChat` would register a sync target per rendered row and
 * re-register on every keystroke (see docs/specs/search/web-search-page.md, "검색 결과 행은 데이터를
 * 당겨오지 않는다"). Rows therefore take a plain model and call nothing.
 *
 * Context arrives after the matches do, so rows render immediately with what the match carries
 * (name, thumbnail, member count) and the context-dependent fields fill in a beat later. A failed
 * resolve leaves those fields empty instead of discarding results the user is already reading.
 */
export const useSearchContext = (results: GlobalSearchResults): SearchResultRows => {
    const { resolveContext } = useGlobalCacheSearch();
    const [context, setContext] = useState<GlobalCacheContext>(EMPTY_CONTEXT);

    // Serialized so the effect re-runs on a changed result SET, not on every new array identity
    // (the search hook rebuilds its arrays whenever the cloud catalog re-renders).
    const requestKey = useMemo(() => {
        const cids = [
            ...new Set([
                ...results.places.map(place => place.cid),
                ...results.channels.map(channel => channel.cid),
                ...results.messages.map(chat => chat.cid),
            ]),
        ].sort();
        const channelRefs = [
            ...new Set([
                ...results.channels.map(channel => globalCacheRefKey(channel.cid, channel.id)),
                ...results.messages.map(chat => globalCacheRefKey(chat.cid, chat.channelId)),
            ]),
        ].sort();
        return JSON.stringify({ cids, channelRefs });
    }, [results]);

    useEffect(() => {
        const { cids, channelRefs } = JSON.parse(requestKey) as { cids: string[]; channelRefs: string[] };
        if (cids.length === 0 && channelRefs.length === 0) {
            setContext(EMPTY_CONTEXT);
            return;
        }

        let cancelled = false;
        const refs: GlobalCacheRef[] = channelRefs.map(key => {
            // Only the first separator splits: a cid never contains ':' but ids are opaque.
            const separator = key.indexOf(':');
            return { cid: key.slice(0, separator), channelId: key.slice(separator + 1) };
        });

        resolveContext({ cids, channelRefs: refs })
            .then(resolved => {
                if (!cancelled) setContext(resolved);
            })
            .catch(error => {
                if (cancelled) return;
                // Rows stay on screen with the context-dependent fields blank — losing a place
                // name is a smaller failure than losing the results.
                logger.error('SEARCH', 'Failed to resolve search result context', { error });
                setContext(EMPTY_CONTEXT);
            });

        return () => {
            cancelled = true;
        };
    }, [requestKey, resolveContext]);

    return useMemo(() => {
        const placeName = (cid: string, sid?: string) =>
            sid ? context.sitesByRef[globalCacheRefKey(cid, sid)]?.name : undefined;

        return {
            clouds: results.clouds,
            places: results.places.map(place => ({
                cid: place.cid,
                placeId: place.id,
                name: place.name ?? '',
                thumbnail: place.thumbnail,
            })),
            channels: results.channels.map(channel => {
                const ref = globalCacheRefKey(channel.cid, channel.id);
                const lastChat = context.lastChatsByRef[ref];
                return {
                    cid: channel.cid,
                    sid: channel.sid,
                    channelId: channel.id,
                    name: channel.name ?? '',
                    thumbnail: channel.thumbnail,
                    memberNo: channel.memberNo,
                    unread: countUnread({
                        headChatNo: channel.chatNo,
                        headMetaNo: channel.metaNo,
                        readNo: readCursorOf(context.joinsByRef[ref]),
                    }),
                    lastMessage: lastChat?.content,
                    lastMessageAt: lastChat?.createdAtMs,
                    placeName: placeName(channel.cid, channel.sid),
                };
            }),
            chats: results.messages.map(chat => {
                // A chat row has no sid of its own — its place comes via the owning channel, and the
                // sender's display profile is scoped to that place.
                const owner = context.channelsByRef[globalCacheRefKey(chat.cid, chat.channelId)];
                // Same chain the room uses (ChannelRoomPage.tsx:613, useChats' nameOf): the place
                // profile is the best label but it is only cached for rooms already opened, so fall
                // back to the member identity and then to the owner embedded on the message itself.
                const senderId = chat.ownerId;
                const profile =
                    owner?.sid && senderId
                        ? context.profilesByRef[globalCacheProfileKey(chat.cid, owner.sid, senderId)]
                        : undefined;
                const user = senderId ? context.usersByRef[globalCacheRefKey(chat.cid, senderId)] : undefined;
                // `user.nick` is deliberately NOT in this chain: the place profile's nick is the
                // identity a place shows, and the account nick is a different (private) label.
                // The room resolves it the same way (useChats' nameOf reads `name`, not `nick`).
                const senderName = profile?.nick || user?.name || chat.owner$?.name;
                return {
                    cid: chat.cid,
                    sid: owner?.sid,
                    chatId: chat.id,
                    channelId: chat.channelId,
                    chatNo: chat.chatNo,
                    content: chat.content ?? '',
                    createdAt: chat.createdAtMs,
                    channelName: owner?.name,
                    placeName: placeName(chat.cid, owner?.sid),
                    senderName,
                    // Profile photo only — same as the room, which shows `ownerProfile?.thumbnail`
                    // and otherwise the default avatar.
                    senderThumbnail: profile?.thumbnail,
                };
            }),
        };
    }, [results, context]);
};
