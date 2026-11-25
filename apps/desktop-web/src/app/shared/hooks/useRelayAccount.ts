import { useCallback, useEffect, useMemo, useState } from 'react';

import type { LinkedAccountsView } from '@lemoncloud/chatic-backend-api';

import { runtime } from '@chatic/runtime-react';

export interface RelayAccount {
    name?: string;
    photo?: string;
    email?: string;
    userRole?: string;
    link$?: LinkedAccountsView;
}

export interface RelayAccountUpdate {
    name: string;
    photo?: string;
}

export const isRelayGuest = (): boolean => {
    const account = runtime.session.getRelaySessionUser() as RelayAccount | null;
    return !account || account.userRole === 'guest';
};

export const useRelayAccount = () => {
    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    const session = runtime.session.useGlobalSession();
    const account = useMemo(() => (runtime.session.getRelaySessionUser() as RelayAccount | null) ?? null, [session]);
    const [isMutating, setIsMutating] = useState(false);

    useEffect(() => {
        if (!isRelayVerified) return;
        let cancelled = false;
        void (async () => {
            try {
                const response = await runtime.session.fetchAccountProfile();
                if (cancelled) return;
                const view = ((response as unknown as { $user?: Record<string, unknown> } | undefined)?.$user ??
                    response ??
                    {}) as Record<string, unknown>;
                const patch: Record<string, unknown> = {};
                if (typeof view.name === 'string') patch.name = view.name;
                if (typeof view.photo === 'string') patch.photo = view.photo;
                if (typeof view.email === 'string') patch.email = view.email;
                if (view.link$ && typeof view.link$ === 'object') patch.link$ = view.link$;
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
            const updated = (await runtime.session.updateAccountProfile(data)) as unknown as Record<string, unknown>;
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
