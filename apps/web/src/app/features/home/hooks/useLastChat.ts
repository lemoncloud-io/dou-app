import { useEffect, useState } from 'react';

import { useChatSync, useRuntimeRepositories } from '@chatic/app-runtime';
import { useSessionIdentity } from '@chatic/web-core';
import type { DomainChat } from '@chatic/data';

import { isOwnSystemChat } from '../../../utils';

// Observe a few rows (not just 1) so the preview can fall through to the previous message when
// the newest rows are the current user's own system messages (e.g. the join written right after
// creating a channel). If every row in the window is hidden, the preview falls back to the
// channel description as before.
const PREVIEW_LOOKBACK = 10;

/**
 * Latest cached chat for a home row's last-message preview — the home analog of `useChats`. The
 * server no longer embeds `lastChat$` on the channel, so this composes the app-runtime primitives:
 * `useChatSync` registers + primes the chat target (ChatSyncPlan keeps it live and unregisters on
 * unmount), and `chat.observeList` streams the cache. observeList is chat_no-descending, but we pick
 * the max chatNo defensively so a different ordering can't surface an older message. Own system
 * rows are skipped, mirroring the room view (useChats) which hides them too.
 */
export const useLastChat = (channelId: string): DomainChat | undefined => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const { userId } = useSessionIdentity();
    const myUid = userId ?? '';
    const [lastChat, setLastChat] = useState<DomainChat | undefined>(undefined);

    useChatSync(channelId);

    useEffect(() => {
        if (!channelId) return;
        return chatRepository.observeList({ channelId, limit: PREVIEW_LOOKBACK }, result => {
            const latest = (result?.list ?? []).reduce<DomainChat | undefined>(
                (max, chat) =>
                    !isOwnSystemChat(chat, myUid) && (chat.chatNo ?? 0) >= (max?.chatNo ?? -1) ? chat : max,
                undefined
            );
            setLastChat(latest);
        });
    }, [chatRepository, channelId, myUid]);

    return lastChat;
};
