import { useEffect, useState } from 'react';

import { useChatSync, useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainChat } from '@chatic/data';

/**
 * Latest cached chat for a home row's last-message preview — the home analog of `useChats`. The
 * server no longer embeds `lastChat$` on the channel, so this composes the app-runtime primitives:
 * `useChatSync` registers + primes the chat target (ChatSyncPlan keeps it live and unregisters on
 * unmount), and `chat.observeList` streams the cache. observeList is chat_no-descending, but we pick
 * the max chatNo defensively so a different ordering can't surface an older message.
 */
export const useLastChat = (channelId: string): DomainChat | undefined => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const [lastChat, setLastChat] = useState<DomainChat | undefined>(undefined);

    useChatSync(channelId);

    useEffect(() => {
        if (!channelId) return;
        return chatRepository.observeList({ channelId, limit: 1 }, result => {
            const latest = (result?.list ?? []).reduce<DomainChat | undefined>(
                (max, chat) => ((chat.chatNo ?? 0) >= (max?.chatNo ?? -1) ? chat : max),
                undefined
            );
            setLastChat(latest);
        });
    }, [chatRepository, channelId]);

    return lastChat;
};
