import { useCallback, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * Turn a reaction on or off. Ported from apps/desktop-web `features/chat/hooks/useReactions.ts`
 * (ADR-0045), minus react-query — this feature's mutation hooks are plain promises.
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
 * a flicker and no reason for it. Keyed by message id rather than a plain boolean
 * because one hook instance serves the whole room — the flag has to say which row it
 * belongs to.
 */
export const useReactions = () => {
    const { chat: chatRepository } = useRuntimeRepositories();
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
