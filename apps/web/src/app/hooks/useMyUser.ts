import { useEffect, useMemo } from 'react';

import { runtime, type DomainUser } from '@chatic/runtime';
import type { LinkedAccountsView, UserView } from '@lemoncloud/chatic-backend-api';

export type MyUser = DomainUser & {
    photo?: string;
    email?: string;
    link$?: LinkedAccountsView;
    userRole?: string;
};

const ACCOUNT_FIELDS = ['name', 'nick', 'photo', 'thumbnail', 'email', 'link$'] as const;

const accountFieldsOf = (view: UserView | undefined): Record<string, unknown> => {
    const patch: Record<string, unknown> = {};
    if (!view) return patch;
    for (const field of ACCOUNT_FIELDS) {
        const value = (view as unknown as Record<string, unknown>)[field];
        if (value !== undefined) patch[field] = value;
    }
    return patch;
};

export const useMyUser = (): MyUser | null => {
    const isRelayVerified = runtime.connection.useSlotVerified(runtime.connection.RELAY_SLOT);
    const session = runtime.session.useGlobalSession();
    const me = useMemo(() => (runtime.session.getRelaySessionUser() as MyUser | null) ?? null, [session]);

    useEffect(() => {
        if (!isRelayVerified) return;
        let cancelled = false;
        void (async () => {
            try {
                const response = await runtime.session.fetchAccountProfile();
                if (cancelled) return;
                const view = (response?.$user ?? (response as unknown)) as UserView | undefined;
                const patch = accountFieldsOf(view);
                if (Object.keys(patch).length) runtime.session.patchRelaySessionUser(patch);
            } catch {
                // Nothing to do and nothing to say: a missed refresh leaves the token value standing.
            }
        })();
        return () => {
            cancelled = true;
        };
    }, [isRelayVerified]);

    return me;
};

export const useIsAccountGuest = (): boolean => {
    const session = runtime.session.useGlobalSession();
    return useMemo(() => {
        const account = runtime.session.getRelaySessionUser() as MyUser | null;
        return !account || account.userRole === 'guest';
    }, [session]);
};
