import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { runtime } from '@chatic/app-runtime';

import { isEdited } from '../utils';

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
 * Both operations go straight to the chat repository, and the two no longer behave the
 * same way there. An edit is still optimistic: the repository writes it to the local
 * cache before the request and restores the previous record if it fails. A delete is
 * NOT — the repository writes nothing until the server answers, because the cache write
 * merges rather than replaces and so cannot roll a tombstone back to the exact previous
 * record. Either way, repeating the write here would give the cache two writers racing
 * over one row.
 *
 * The consequence for this surface: between the press and the server's answer nothing
 * visibly changes, and this hook does not expose the in-flight state that would let the
 * row say so. `apps/web` does (its confirm dialog stays up and spins). Until that is
 * matched here, a slow delete looks like a press that did nothing.
 *
 * Delete is a soft delete on both sides: the server maps `chat.delete` to
 * `PUT { hidden: true }` and the repository marks the cached row rather than dropping
 * it. The row therefore survives the delete and survives the next sync, and the feed
 * keeps it in place as a tombstone — `isFeedVisible` deliberately does not filter
 * `hidden`, and `MessageRow` renders "This message was deleted." for it.
 */
/** Which operation failed, so the row can say the right thing about it. */
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
            // "(edited)" is inferred from `updatedAt` passing `createdAt`, and the row
            // written after an edit was observed not to carry the moved timestamp, so
            // the label only appeared after a reload. Stamp it locally; the next sync
            // replaces it with the server's value.
            if (saved && !isEdited(saved)) await chatRepository.cacheWrite({ ...saved, updatedAt: Date.now() });
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
