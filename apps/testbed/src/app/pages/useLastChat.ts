import { useEffect, useState } from 'react';

import { useChatSync, useRuntimeRepositories } from '@chatic/app-runtime';
import type { DataRepositoriesV2, DomainChat } from '@chatic/data';

/**
 * Latest cached chat for a channel row's last-message preview. Testbed mirror of the web home hook:
 * `useChatSync` registers + primes the chat target (ChatSyncPlan keeps it live, unmount unregisters
 * it) and `chat.observeList` streams the cache. observeList is chat_no-descending, but we pick the
 * max chatNo defensively. Replaces the server-embedded `lastChat$`, which is no longer delivered.
 */
export const useLastChat = (channelId: string): DomainChat | undefined => {
    const repos = useRuntimeRepositories() as unknown as DataRepositoriesV2;
    const [lastChat, setLastChat] = useState<DomainChat | undefined>(undefined);

    useChatSync(channelId);

    useEffect(() => {
        if (!channelId) return;
        return repos.chat.observeList({ channelId, limit: 1 }, result => {
            const latest = (result?.list ?? []).reduce<DomainChat | undefined>(
                (max, chat) => ((chat.chatNo ?? 0) >= (max?.chatNo ?? -1) ? chat : max),
                undefined
            );
            setLastChat(latest);
        });
    }, [repos, channelId]);

    return lastChat;
};
