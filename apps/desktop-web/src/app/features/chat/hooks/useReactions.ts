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
 */
export const useReactions = () => {
    const { chat: chatRepository } = useRuntimeRepositories();

    const mutation = useMutation({
        mutationFn: ({ chatId, emoji, action }: { chatId: string; emoji: string; action: 'on' | 'off' }) =>
            chatRepository.setReaction({ chatId, emoji, action }),
    });

    return {
        toggleReaction: (chatId: string, emoji: string, isMine: boolean) =>
            mutation.mutate({ chatId, emoji, action: isMine ? 'off' : 'on' }),
    };
};
