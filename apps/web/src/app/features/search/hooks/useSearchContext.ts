import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { runtime } from '@chatic/app-runtime';
import { isInJoinWindow } from '@chatic/data';
import type { DomainChannel, GlobalCacheContext, GlobalCacheRef } from '@chatic/data';
import { logger } from '@chatic/bridges';

import { countUnread, readCursorOf } from '../../../utils/countUnread';
import {
    channelKindOf,
    resolveChannelAvatar,
    resolveChannelTitle,
    showsMemberCount,
    type ChannelAvatarGlyph,
} from '../../channels/lib';
import { pickDmPeerId } from '../../channels/utils/dmPeer';
import { messagePlainText } from '../../channels/utils/messagePlainText';
import type { CloudSearchResult, GlobalSearchResults } from './useGlobalSearch';
import { useSenderProfiles, type SenderProfileRef } from './useSenderProfiles';

const EMPTY_CONTEXT: GlobalCacheContext = {
    channelsByRef: {},
    sitesByRef: {},
    joinsByRef: {},
    lastChatsByRef: {},
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
    /**
     * Placeholder glyph for a row with no photo, from the same `resolveChannelAvatar` call that
     * answered `thumbnail`. It travels WITH the photo because both key off the stereo: a group room
     * gets the two-person glyph, a 1:1 and a self chat the one-person one. Deciding it here rather
     * than at the row is what keeps search agreeing with the home list and the manage list.
     */
    glyph: ChannelAvatarGlyph;
    /**
     * Group member count. **Undefined for a self chat and a DM** — always 1 and always 2, so the
     * number carries no information (`showsMemberCount`). The home list hides it for the same
     * reason; a search row that showed `2` beside a 1:1 was the two surfaces disagreeing.
     */
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
     * Sender's place-profile nick — the identity a place actually shows for that person. No
     * fallback to the account cache: the account nick/name is a different, private label.
     * Undefined (unnamed) when the sender's profile for this place isn't cached.
     */
    senderName?: string;
    /** Place-profile photo only, for the same reason. */
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
 * `useChannelSync`/`useChatSync`/`useLastChats` would register a sync target per rendered row and
 * re-register on every keystroke (see docs/specs/search/web-search-page.md, "search result rows
 * don't pull their own data"). Rows therefore take a plain model and call nothing.
 *
 * Context arrives after the matches do, so rows render immediately with what the match carries
 * (name, thumbnail, member count) and the context-dependent fields fill in a beat later. A failed
 * resolve leaves those fields empty instead of discarding results the user is already reading.
 */
export const useSearchContext = (results: GlobalSearchResults): SearchResultRows => {
    const { t } = useTranslation();
    const { userId: uid } = runtime.session.useSessionIdentity();
    const { resolveContext } = runtime.data.useGlobalCacheSearch();
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
                ...results.channels.map(channel => runtime.data.globalCacheRefKey(channel.cid, channel.id)),
                ...results.messages.map(chat => runtime.data.globalCacheRefKey(chat.cid, chat.channelId)),
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

    // A message's author is addressed by (place, uid): the place comes from its channel, which only
    // the resolve above knows, so these refs are derived from the resolved context rather than from
    // the raw matches.
    const senderRefs = useMemo<SenderProfileRef[]>(
        () =>
            results.messages.flatMap(chat => {
                const ref = runtime.data.globalCacheRefKey(chat.cid, chat.channelId);
                // Same window the rows below apply — a message that will be dropped must not cost a
                // profile read (ADR-0067).
                if (!isInJoinWindow(chat, context.joinsByRef[ref]?.joinedNo)) return [];
                const sid = context.channelsByRef[ref]?.sid;
                return sid && chat.ownerId ? [{ sid, userId: chat.ownerId }] : [];
            }),
        [results.messages, context.channelsByRef, context.joinsByRef]
    );

    /**
     * The 1:1 peer of every DM in the results, addressed the same way a sender is.
     *
     * A DM row is named after the person on the other side, so without their profile the title
     * chain falls through to the server-generated `channel.name` — which is what made search show a
     * raw name where every other surface showed the peer (ADR-0039).
     *
     * `useDmPeers` cannot serve this: it takes ONE `sid`, and results span the places of the
     * searched cloud. `useSenderProfiles` is already the per-(place, user) reader on this screen, so
     * peers ride along with the message authors and the whole page keeps one subscription.
     */
    const peerRefs = useMemo<SenderProfileRef[]>(
        () =>
            results.channels.flatMap(channel => {
                if (channelKindOf(channel.stereo) !== 'dm') return [];
                const peerId = pickDmPeerId(channel.memberIds ?? [], uid);
                return channel.sid && peerId ? [{ sid: channel.sid, userId: peerId }] : [];
            }),
        [results.channels, uid]
    );

    const profileRefs = useMemo(() => [...senderRefs, ...peerRefs], [senderRefs, peerRefs]);
    const senderProfiles = useSenderProfiles(profileRefs);

    return useMemo(() => {
        const placeName = (cid: string, sid?: string) =>
            sid ? context.sitesByRef[runtime.data.globalCacheRefKey(cid, sid)]?.name : undefined;

        /**
         * The name and photo a channel row shows — the SAME two resolvers the room header, the room
         * settings, the home list and the place's chat-room management call.
         *
         * Search was the fifth surface drawing a channel and the only one not going through them:
         * it rendered `channel.name` and `channel.thumbnail` raw, so a 1:1 showed the server's
         * generated name instead of the peer, a self chat showed that name instead of its label,
         * and both showed a `channel.thumbnail` the other surfaces deliberately ignore.
         *
         * `myNick` is deliberately not supplied. It is the self-chat chain's second tier (my own
         * place-profile nick), and reading my profile once per place in the results would cost more
         * than it is worth here — the chain simply falls to the "나와의 채팅" label, which is what
         * that row should read anyway.
         */
        const display = (channel: DomainChannel, joinNick?: string) => {
            const kind = channelKindOf(channel.stereo);
            const peerId = kind === 'dm' ? pickDmPeerId(channel.memberIds ?? [], uid) : undefined;
            const peer = channel.sid && peerId ? senderProfiles.get(`${channel.sid}@${peerId}`) : undefined;

            const avatar = resolveChannelAvatar({ channel, peerThumbnail: peer?.thumbnail });

            return {
                kind,
                name: resolveChannelTitle({
                    channel,
                    uid: uid ?? undefined,
                    joinNick,
                    peerNick: peer?.nick,
                    selfLabel: t('channelList.selfChannel'),
                    unnamedLabel: t('channelList.unnamedChannel'),
                    dmUnnamedLabel: t('chat.dm.unnamedPeer'),
                }),
                thumbnail: avatar.src,
                glyph: avatar.glyph,
            };
        };

        return {
            clouds: results.clouds,
            places: results.places.map(place => ({
                cid: place.cid,
                placeId: place.id,
                name: place.name ?? '',
                thumbnail: place.thumbnail,
            })),
            channels: results.channels.map(channel => {
                const ref = runtime.data.globalCacheRefKey(channel.cid, channel.id);
                const cached = context.lastChatsByRef[ref];
                // Same window as the message rows below: a preview from before my current
                // membership must not survive into search either (ADR-0067).
                const lastChat =
                    cached && isInJoinWindow(cached, context.joinsByRef[ref]?.joinedNo) ? cached : undefined;
                const { kind, name, thumbnail, glyph } = display(channel, context.joinsByRef[ref]?.nick);

                return {
                    cid: channel.cid,
                    sid: channel.sid,
                    channelId: channel.id,
                    name,
                    thumbnail,
                    glyph,
                    memberNo: showsMemberCount(kind) ? channel.memberNo : undefined,
                    unread: countUnread({
                        headChatNo: channel.chatNo,
                        headMetaNo: channel.metaNo,
                        readNo: readCursorOf(context.joinsByRef[ref]),
                        readMetaNo: context.joinsByRef[ref]?.metaNo,
                    }),
                    // Undefined, not '': the row and its test read the absence of a preview
                    // as "nothing to show", and `messagePlainText` answers '' for no input.
                    lastMessage: lastChat ? messagePlainText(lastChat.content) : undefined,
                    lastMessageAt: lastChat?.createdAtMs,
                    placeName: placeName(channel.cid, channel.sid),
                };
            }),
            chats: results.messages
                // The cache keeps a channel's messages after I leave it (the chat sync plan has no
                // onRemove), and the global scan reads the chat table whole — so without this
                // window, messages from rooms I am no longer in surface as results, historically
                // with no channel name attached (ADR-0067).
                .filter(chat =>
                    isInJoinWindow(
                        chat,
                        context.joinsByRef[runtime.data.globalCacheRefKey(chat.cid, chat.channelId)]?.joinedNo
                    )
                )
                .map(chat => {
                    // A chat row has no sid of its own — its place comes via the owning channel, and the
                    // author's display profile is scoped to that place.
                    const ownerRef = runtime.data.globalCacheRefKey(chat.cid, chat.channelId);
                    const owner = context.channelsByRef[ownerRef];
                    const profile =
                        owner?.sid && chat.ownerId ? senderProfiles.get(`${owner.sid}@${chat.ownerId}`) : undefined;
                    return {
                        cid: chat.cid,
                        sid: owner?.sid,
                        chatId: chat.id,
                        channelId: chat.channelId,
                        chatNo: chat.chatNo,
                        // The row shows this and `SearchPage` highlights the query inside it, so a
                        // Block Kit body has to arrive flattened — a match inside a block's text is
                        // still a match the reader should be able to see.
                        content: messagePlainText(chat.content),
                        createdAt: chat.createdAtMs,
                        // The owning room, named by the same chain as a channel row — a message
                        // found in a 1:1 must not caption itself with the generated channel name.
                        channelName: owner ? display(owner, context.joinsByRef[ownerRef]?.nick).name : undefined,
                        placeName: placeName(chat.cid, owner?.sid),
                        senderName: profile?.nick,
                        senderThumbnail: profile?.thumbnail,
                    };
                }),
        };
    }, [results, context, senderProfiles, t, uid]);
};
