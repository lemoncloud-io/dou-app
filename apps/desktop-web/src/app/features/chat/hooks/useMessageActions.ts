import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { runtime, isMessageEdited } from '@chatic/runtime';

export interface MessageActionFailure {
    id: string;
    kind: 'edit' | 'delete';
}

export const useMessageActions = () => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const [failure, setFailure] = useState<MessageActionFailure | null>(null);

    const edit = useMutation({
        mutationFn: async ({ id, content }: { id: string; content: string }) => {
            const saved = await chatRepository.updateChat({ id, content });
            if (saved && !isMessageEdited(saved)) await chatRepository.cacheWrite({ ...saved, updatedAt: Date.now() });
            return saved;
        },
    });
    const remove = useMutation({
        mutationFn: (id: string) => chatRepository.deleteChat({ id }),
    });

    const editMessage = (id: string, content: string) => {
        setFailure(null);
        edit.mutate({ id, content }, { onError: () => setFailure({ id, kind: 'edit' }) });
    };

    const deleteMessage = (id: string) => {
        setFailure(null);
        remove.mutate(id, { onError: () => setFailure({ id, kind: 'delete' }) });
    };

    return { editMessage, deleteMessage, failure };
};
