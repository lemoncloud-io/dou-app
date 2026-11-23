import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

import {
    runtime,
    isInJoinWindow,
    type DomainChannel,
    type GlobalCacheContext,
    type GlobalCacheRef,
} from '@chatic/runtime';
import { logger } from '@chatic/bridges';

import { unreadOf } from '../../../utils/countUnread';
import {
    channelKindOf,
    dmLineageOf,
    resolveChannelAvatar,
    resolveChannelTitle,
    showsMemberCount,
    type ChannelAvatarGlyph,
} from '../../channels/lib';
import { usePeerCloudNames, type CloudDmPeerRef } from '../../channels/hooks/usePeerCloudNames';
import { pickDmPeerId } from '../../channels/utils/dmPeer';
import { lastChatPreview } from '../../channels/utils/lastChatPreview';
import { messageSearchText } from '../../channels/utils/messagePlainText';
import type { CloudSearchResult, GlobalSearchResults } from './useGlobalSearch';
import { useSenderProfiles, type SenderProfileRef } from '../../../hooks/useSenderProfiles';

const EMPTY_CONTEXT: GlobalCacheContext = {
    channelsByRef: {},
    sitesByRef: {},
    joinsByRef: {},
    lastChatsByRef: {},
};

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
    glyph: ChannelAvatarGlyph;
    memberNo?: number;
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
    parentId?: string;
    content: string;
    createdAt?: number;
    channelName?: string;
    placeName?: string;
    senderName?: string;
    senderThumbnail?: string;
}

export interface SearchResultRows {
    clouds: CloudSearchResult[];
    places: PlaceResultRow[];
    channels: ChannelResultRow[];
    chats: ChatResultRow[];
}

export const useSearchContext = (results: GlobalSearchResults): SearchResultRows => {
    const { t } = useTranslation();
    const { userId: uid } = runtime.session.useSessionIdentity();
    const { resolveContext } = runtime.data.useGlobalCacheSearch();
    const [context, setContext] = useState<GlobalCacheContext>(EMPTY_CONTEXT);

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
            const separator = key.indexOf(':');
            return { cid: key.slice(0, separator), channelId: key.slice(separator + 1) };
        });

        resolveContext({ cids, channelRefs: refs })
            .then(resolved => {
                if (!cancelled) setContext(resolved);
            })
            .catch(error => {
                if (cancelled) return;
                logger.error('SEARCH', 'Failed to resolve search result context', { error });
                setContext(EMPTY_CONTEXT);
            });

        return () => {
            cancelled = true;
        };
    }, [requestKey, resolveContext]);

    const senderRefs = useMemo<SenderProfileRef[]>(
        () =>
            results.messages.flatMap(chat => {
                const ref = runtime.data.globalCacheRefKey(chat.cid, chat.channelId);
                if (!isInJoinWindow(chat, context.joinsByRef[ref]?.joinedNo)) return [];
                const sid = context.channelsByRef[ref]?.sid;
                return sid && chat.ownerId ? [{ sid, userId: chat.ownerId }] : [];
            }),
        [results.messages, context.channelsByRef, context.joinsByRef]
    );

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

    const cloudPeerRows = useMemo<CloudDmPeerRef[]>(
        () =>
            results.channels.flatMap(channel => {
                if (dmLineageOf(channel) !== 'cloud') return [];
                const peerId = pickDmPeerId(channel.memberIds ?? [], uid);
                if (!peerId) return [];
                const profileNick = channel.sid ? senderProfiles.get(`${channel.sid}@${peerId}`)?.nick : undefined;
                return [{ channelId: channel.id, cid: channel.cid, peerId, profileNick }];
            }),
        [results.channels, uid, senderProfiles]
    );
    const peerCloudNames = usePeerCloudNames(cloudPeerRows);

    return useMemo(() => {
        const placeName = (cid: string, sid?: string) =>
            sid ? context.sitesByRef[runtime.data.globalCacheRefKey(cid, sid)]?.name : undefined;

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
                    peerCloudName: peerId ? peerCloudNames.get(peerId) : undefined,
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
                    unread: unreadOf(channel, context.joinsByRef[ref]),
                    lastMessage: lastChatPreview(lastChat, t) || undefined,
                    lastMessageAt: lastChat?.createdAtMs,
                    placeName: placeName(channel.cid, channel.sid),
                };
            }),
            chats: results.messages
                .filter(chat =>
                    isInJoinWindow(
                        chat,
                        context.joinsByRef[runtime.data.globalCacheRefKey(chat.cid, chat.channelId)]?.joinedNo
                    )
                )
                .map(chat => {
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
                        parentId: chat.parentId || undefined,
                        content: messageSearchText(chat.content),
                        createdAt: chat.createdAtMs,
                        channelName: owner ? display(owner, context.joinsByRef[ownerRef]?.nick).name : undefined,
                        placeName: placeName(chat.cid, owner?.sid),
                        senderName: profile?.nick,
                        senderThumbnail: profile?.thumbnail,
                    };
                }),
        };
    }, [results, context, senderProfiles, peerCloudNames, t, uid]);
};
