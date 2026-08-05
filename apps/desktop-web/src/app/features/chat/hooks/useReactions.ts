import { useState } from 'react';
import { useMutation } from '@tanstack/react-query';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * Turn a reaction on or off.
 *
 * The server does not toggle — it records the state it is told — so the caller has to
 * know whether it is currently reacting and send the opposite. `mine` on the folded
 * tally is that answer, which is why the toggle takes it rather than looking it up.
 *
 * The repository writes the returned event into the chat cache, so the fold picks the
 * change up without waiting for the broadcast echo. The echo carries the same
 * `chatNo` and lands on the same cache row, so the count does not flicker.
 *
 * A rejected toggle has to be said out loud. The repository rolls its optimistic write
 * back, so the chip appears and vanishes on its own; without `failedId` the reader sees
 * a flicker and no reason for it. That is not hypothetical — the dev stage answers
 * `@action[reaction] is not supported`, and the feature looked simply broken until a
 * temporary probe surfaced it (`.claude/20260804/DEBUG-11-12-00.md`).
 *
 * Keyed by message id rather than a plain boolean for the same reason as
 * `useMessageActions`: one hook instance serves a whole author block, so the flag has
 * to say which row it belongs to.
 */
export const useReactions = () => {
    const { chat: chatRepository } = useRuntimeRepositories();
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
