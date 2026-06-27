import { useCallback, useEffect, useMemo, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChat, DomainUser } from '@chatic/data';

import type { ClientChatView } from '../types';

// Each older page widens the observe window by this much. `observeList` returns
// only the newest `limit` rows (chat_no-descending cursor paging), so to reveal
// older history the window must grow to re-include the freshly cached page.
const LOAD_MORE_SIZE = 50;

interface UseChatsParams {
    channelId: string;
    limit: number;
}

/** Build the uid → display-name map used to resolve a message owner's name. */
const nameOf = (chat: DomainChat, userMap: Map<string, DomainUser>): string =>
    userMap.get(chat.ownerId ?? '')?.name ?? chat.owner$?.name ?? chat.ownerId ?? '';

/**
 * Message stream for a channel. Observes the newest `pageLimit` rows; `loadMore`
 * fetches the next older page by cursor and widens the window so the cache
 * re-emits with the older page included (testbed's paging model). Domain rows
 * are mapped to `ClientChatView` (owner identity, parsed timestamp, flags),
 * sorted oldest → newest so the last element is the latest message.
 */
export const useChats = ({ channelId, limit }: UseChatsParams) => {
    const { chat: chatRepository, user: userRepository } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();
    const myUid = userId ?? '';

    const [chats, setChats] = useState<DomainChat[]>([]);
    const [users, setUsers] = useState<DomainUser[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [isLoadingMore, setIsLoadingMore] = useState(false);
    const [isError, setIsError] = useState(false);
    const [hasMore, setHasMore] = useState(true);
    const [pageLimit, setPageLimit] = useState(limit);

    // Reset paging/scroll guards on channel change — treat it as a fresh entry.
    useEffect(() => {
        setChats([]);
        setIsLoading(true);
        setHasMore(true);
        setPageLimit(limit);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [channelId]);

    // Widening pageLimit re-subscribes and re-reads cached older pages into view.
    useEffect(() => {
        if (!channelId) return;
        return chatRepository.observeList({ channelId, limit: pageLimit }, result => {
            setChats(result?.list ?? []);
            setIsLoading(false);
        });
    }, [chatRepository, channelId, pageLimit]);

    // Member identity for owner-name fallback (best-effort; cache stream persists).
    useEffect(() => {
        if (!channelId) return;
        return userRepository.observeList({ channelId }, result => setUsers(result?.list ?? []));
    }, [userRepository, channelId]);

    const userMap = useMemo(() => {
        const map = new Map<string, DomainUser>();
        for (const user of users) if (user.id) map.set(user.id, user);
        return map;
    }, [users]);

    // Sort oldest → newest so messages[last] is the latest (the page reads it for auto-read).
    const messages = useMemo<ClientChatView[]>(() => {
        return [...chats]
            .sort((a, b) => (a.chatNo ?? 0) - (b.chatNo ?? 0))
            .map(chat => ({
                ...chat,
                isOwner: !!chat.ownerId && chat.ownerId === myUid,
                isSystem: chat.stereo === 'system',
                ownerName: nameOf(chat, userMap),
                timestamp: new Date(chat.createdAtMs ?? chat.createdAt ?? 0),
            }));
    }, [chats, userMap, myUid]);

    const loadMore = useCallback(async () => {
        if (!channelId || isLoadingMore || !hasMore) return;
        const oldest = messages[0];
        if (!oldest?.chatNo) return;

        setIsLoadingMore(true);
        try {
            const result = await chatRepository.refreshList({
                channelId,
                cursorNo: oldest.chatNo,
                limit: LOAD_MORE_SIZE,
            });
            if (result.fetchedCount === 0) {
                setHasMore(false);
            } else {
                setPageLimit(prev => prev + LOAD_MORE_SIZE);
            }
        } catch {
            setIsError(true);
        } finally {
            setIsLoadingMore(false);
        }
    }, [chatRepository, channelId, messages, isLoadingMore, hasMore]);

    return {
        messages,
        isLoading,
        isEmpty: !isLoading && messages.length === 0,
        isLoadingMore,
        isError,
        hasMore,
        loadMore,
    };
};
