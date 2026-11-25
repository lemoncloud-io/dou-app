import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { runtime } from '@chatic/runtime-react';

export const useReactions = () => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const [failedId, setFailedId] = useState<string | null>(null);

    const mutation = useMutation({
        mutationFn: ({ chatId, emoji, action }: { chatId: string; emoji: string; action: 'on' | 'off' }) =>
            chatRepository.setReaction({ chatId, emoji, action }),
    });

    const toggleReaction = (chatId: string, emoji: string, isMine: boolean) => {
        setFailedId(null);
        mutation.mutate({ chatId, emoji, action: isMine ? 'off' : 'on' }, { onError: () => setFailedId(chatId) });
    };

    return { toggleReaction, failedId };
};
