import { useCallback, useEffect, useMemo, useState } from 'react';

import { runtime } from '@chatic/app-runtime';

import { getRelayAccountGateway } from '../runtime/relayAccountGateway';

export interface RelayAccount {
    name?: string;
    photo?: string;
}

export interface RelayAccountUpdate {
    name: string;
    photo?: string;
}

/**
 * The ACCOUNT profile (relay token), not the active session's. Screens asking
 * "who is this account" read this; screens asking "what may I do in this
 * cloud" keep using `useRuntimeProfile`.
 *
 * Reads the relay token (no network) and refreshes it once per relay
 * verification; a missed refresh leaves the token value standing. Updates go
 * through the relay-pinned gateway and patch the token from the server echo
 * (falling back to the sent values when the echo comes back thin).
 */
export const useRelayAccount = () => {
    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    // Re-read per session signal: the session store drops its cached context
    // on every notify and rebuilds a new object, so this identity change is
    // the refresh trigger.
    const session = runtime.session.useGlobalSession();
    const account = useMemo(() => (runtime.session.getRelaySessionUser() as RelayAccount | null) ?? null, [session]);
    const [isMutating, setIsMutating] = useState(false);

    useEffect(() => {
        if (!isRelayVerified) return;
        let cancelled = false;
        // The call sits inside try/catch, not just a `.catch()` on the
        // promise: the scoped client resolves its slot OUTSIDE the promise
        // chain and throws SYNCHRONOUSLY when the slot is unbound. The token
        // value is already on screen, so skipping IS the recovery.
        void (async () => {
            try {
                const response = await getRelayAccountGateway().profile();
                if (cancelled) return;
                // `user.profile` answers with a wrapper ($user + $site); tolerate
                // a flat user view the same way. `$site` is deliberately ignored
                // — this hook is the ACCOUNT profile.
                const view = ((response as { $user?: Record<string, unknown> } | undefined)?.$user ??
                    response ??
                    {}) as Record<string, unknown>;
                const patch: Record<string, unknown> = {};
                if (typeof view.name === 'string') patch.name = view.name;
                if (typeof view.photo === 'string') patch.photo = view.photo;
                if (Object.keys(patch).length) runtime.session.patchRelaySessionUser(patch);
            } catch {
                // Nothing to do and nothing to say: a missed refresh leaves the
                // token value standing.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isRelayVerified]);

    const updateAccount = useCallback(async (data: RelayAccountUpdate): Promise<unknown> => {
        setIsMutating(true);
        try {
            const updated = (await getRelayAccountGateway().update(data as never)) as Record<string, unknown>;
            runtime.session.patchRelaySessionUser({
                name: (updated.name as string | undefined) ?? data.name,
                ...(data.photo !== undefined ? { photo: (updated.photo as string | undefined) ?? data.photo } : {}),
            });
            return updated;
        } finally {
            setIsMutating(false);
        }
    }, []);

    return { account, isRelayVerified, updateAccount, isMutating };
};
