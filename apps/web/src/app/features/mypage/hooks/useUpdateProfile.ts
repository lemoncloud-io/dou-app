import { useMutation } from '@tanstack/react-query';

import type { UserView } from '@lemoncloud/chatic-backend-api';
import { patchRelaySessionUser } from '@chatic/app-runtime';

import { getRelayAccountGateway } from '../../../runtime/relayAccountGateway';

interface UpdateProfileData {
    name?: string;
    photo?: string;
}

/**
 * Updates the ACCOUNT profile — the relay account's own name/photo — through `user.update` pinned to
 * the RELAY slot, then writes the result back into the relay token so every reader of `useMyUser`
 * reflects it immediately.
 *
 * Relay-pinned rather than active-pinned because this screen edits the account, not the connected
 * cloud's delegated record: on the active facade the same call lands on whichever cloud is selected,
 * a different uid on a different backend. Read and write therefore share one scope — the relay token
 * — which is the invariant the previous data-layer attempt could not hold (ADR-0045 decision 5,
 * reverted; apps/web/docs/feature/place/relay-default-place-scoping.md §6).
 *
 * The token patch is not an optimistic guess: it applies the SERVER's response, and it is the only
 * fan-out step there is. Deliberately no repository/cache write — the cache is partitioned by the
 * ACTIVE cloud, so a relay row written while a cloud is active could never be read back.
 *
 * `photo` is omitted by the caller when unchanged, so an absent field here means "leave it alone".
 */
export const useUpdateProfile = () => {
    return useMutation({
        mutationFn: async (data: UpdateProfileData) => {
            const updated = await getRelayAccountGateway().update<UserView>(data as never);
            // Prefer the server's echo; fall back to what we sent so the header still updates when
            // the response comes back thin.
            const view = (updated ?? {}) as unknown as Record<string, unknown>;
            patchRelaySessionUser({
                name: (view.name as string | undefined) ?? data.name,
                ...(data.photo !== undefined ? { photo: (view.photo as string | undefined) ?? data.photo } : {}),
            });
            return data;
        },
    });
};
