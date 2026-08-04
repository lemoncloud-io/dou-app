import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * Edit and delete, for whichever message in a group the reader acts on.
 *
 * One instance per author block rather than per message: only one message can be
 * under the cursor at a time, so a mutation pair per rendered row would be dozens of
 * idle hooks per screen for a control that is used once. The message is named at call
 * time instead, and `failure` says which row the failure belongs to — and which of the
 * two operations it was, because "couldn't save that change" is the wrong thing to say
 * about a delete that did not go through.
 *
 * Both operations go straight to the chat repository, which already writes the change
 * to the local cache before the request and restores the previous record if it fails —
 * the optimistic contract this app relies on everywhere. Repeating that here would give
 * the cache two writers racing over one row.
 *
 * Delete is a soft delete on the server (`hidden: true`) even though the repository
 * drops the row locally. The two agree because `isFeedVisible` filters `hidden`, so a
 * deleted message stays gone when the cache refills from a sync.
 */
/** Which operation failed, so the row can say the right thing about it. */
export interface MessageActionFailure {
    id: string;
    kind: 'edit' | 'delete';
}

export const useMessageActions = () => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const [failure, setFailure] = useState<MessageActionFailure | null>(null);

    const edit = useMutation({
        mutationFn: ({ id, content }: { id: string; content: string }) => chatRepository.updateChat({ id, content }),
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
