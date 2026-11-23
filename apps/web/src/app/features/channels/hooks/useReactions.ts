import { useCallback, useState } from 'react';

import { runtime } from '@chatic/runtime';

export const useReactions = () => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const [failedId, setFailedId] = useState<string | null>(null);

    const toggleReaction = useCallback(
        (chatId: string, emoji: string, isMine: boolean) => {
            setFailedId(null);
            chatRepository
                .setReaction({ chatId, emoji, action: isMine ? 'off' : 'on' })
                .catch(() => setFailedId(chatId));
        },
        [chatRepository]
    );

    return { toggleReaction, failedId };
};
