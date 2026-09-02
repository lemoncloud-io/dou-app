import type { JSX } from 'react';
import { useMemo } from 'react';
import { Navigate, useLocation } from 'react-router-dom';

import { useSessionAuth } from '@chatic/app-runtime';

import { CloudInviteAccept, InviteAcceptLoading, RelayInviteAccept } from './components';
import { isInviteEntry, isRelayInvite, parseInviteDeeplink } from './types';
import { useBackHandler } from '../../../hooks/useBackHandler';
import { ROUTES } from '../../../routes/paths';

/**
 * The invite-accept screen as a route (`/invite/accept`), reached from every entry path via
 * `resolveInviteAcceptRedirect`.
 *
 * Registered in `commonRoutes`, so it renders in both auth states and — unlike everything under
 * `privateRoutes` — sits outside `UnifiedLayout`. That is deliberate on both counts:
 *
 * - An invite deeplink routinely lands before the background guest login finishes. In the signed-out
 *   router, a private path would fall to the `*` catch-all and take the query string with it.
 * - No shell means no home data hooks and no bottom nav. This screen owns the whole viewport and
 *   needs none of it — but it does have to mount `useBackHandler` itself, since that normally comes
 *   with the layout.
 *
 * Beyond that this is only a router: the issuer's `relay` marker (ADR-0033) picks between the relay
 * 1:1 accept flow (invite.get / phone verification / invite.accept over the sockets) and the cloud
 * one (REST accept pipeline — ADR-0016). It deliberately calls no data hooks of its own, so a relay
 * link never fires the cloud invite lookup.
 */
export const InviteAcceptPage = (): JSX.Element => {
    // Normally the shell's job (UnifiedLayout), but this page is outside it. Imported from the file
    // rather than the hooks barrel so the pre-auth entry does not drag the rest of it along.
    useBackHandler();

    const { search } = useLocation();
    const params = useMemo(() => parseInviteDeeplink(search), [search]);
    const { isAuthenticated } = useSessionAuth();

    // Landed here without a usable invite (no code, or no `_backend`/`relay` to accept against).
    // There is nothing to show, and home is the right place to be.
    if (!isInviteEntry(params)) return <Navigate to={ROUTES.root} replace />;

    return (
        <div className="flex h-dvh w-full flex-col items-center bg-background">
            {/* No session yet: hold. Firing a relay-pinned `invite.get` before the handshake rejects
                with an unclassified failure that surfaces as a useless "generic" dialog on a
                perfectly valid invite — see useRelayInviteFlow's awaitRelaySocket. */}
            {!isAuthenticated ? (
                <InviteAcceptLoading />
            ) : isRelayInvite(params) ? (
                // `isRelayInvite` implies `isInviteEntry`, which already asserted a non-empty code.
                <RelayInviteAccept code={params.code as string} />
            ) : (
                <CloudInviteAccept params={params} />
            )}
        </div>
    );
};
