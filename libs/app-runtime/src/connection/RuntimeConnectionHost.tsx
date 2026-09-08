import React from 'react';

// Concrete path, not the session barrel: the boot gate is a runtime internal (결정 6) —
// the same convention `useRelaySessionKeepAlive` already follows below.
import { useRelaySessionInit } from '../session/hooks/app/useRelaySessionInit';
// Guest keep-alive is a runtime behavior, not an app surface (ADR-0076 결정 6).
import { useRelaySessionKeepAlive } from '../session/hooks/app/useRelaySessionKeepAlive';
import { SocketBinder } from './SocketBinder';
import { SocketReauthBinder } from './SocketReauthBinder';
import { useSocketSessionDelegate } from './hooks/useSocketSessionDelegate';
import { useRuntimeSocketSlots } from './hooks/useRuntimeSocketSlots';
import type { RuntimeSocketSlots } from './types';

export interface RuntimeHostProps {
    /**
     * Override for the slots the host would derive itself. Normally OMITTED — every app used to
     * repeat `const binding = useRuntimeBinding()` and hand it straight back down, which is why the
     * host derives them now (ADR-0076 G5). Kept for tests and for a host that must inject slots.
     */
    slots?: RuntimeSocketSlots;
    children?: React.ReactNode;
}

/**
 * The one connection host. Both exported hosts are this component with one switch flipped.
 *
 * It is the SINGLE web-core init driver: `useRelaySessionInit` runs `initializeRelaySession`
 * (transport + auth) once and gates the whole connection subtree until ready — replacing the old
 * separate `TransportBootstrap`, which independently re-triggered `startWebCoreInit` (a duplicate
 * initialization). The socket session delegate AND the socket slots are owned here, so an app passes
 * nothing but its children; socket lifecycle + SDK re-auth are handled by `SocketBinder` +
 * `bootstrapSocketConnection` (which wires `onTokenRefresh` → `commitRefreshedToken`, re-minting the
 * AWS/HTTP signing credentials) and `SocketReauthBinder`.
 *
 * The socket only connects once the relay slot carries an identity token, so mounting before login
 * is inert.
 */
const ConnectionHost = ({
    slots,
    children,
    guestKeepAlive,
}: RuntimeHostProps & {
    /**
     * Whether a session-less visitor is kept alive as a GUEST in the background.
     *
     * This is the only difference between the two hosts, and it is not a preference: a console that
     * requires an explicit login must never silently acquire a guest session. Expressed as two named
     * exports rather than a prop with a default, because a forgotten prop would hand a console a
     * guest session and nothing would say so — the name is the safeguard.
     */
    guestKeepAlive: boolean;
}) => {
    const isSessionReady = useRelaySessionInit();
    const delegate = useSocketSessionDelegate();
    const derivedSlots = useRuntimeSocketSlots();
    const activeSlots = slots ?? derivedSlots;
    useRelaySessionKeepAlive(guestKeepAlive);

    if (!isSessionReady) {
        return null;
    }

    return (
        <>
            <SocketBinder slots={activeSlots} delegate={delegate} />
            <SocketReauthBinder slots={activeSlots} delegate={delegate} />
            {children}
        </>
    );
};

/**
 * The connection host for a chat app: keeps a session-less visitor alive as a guest so the socket
 * and its credentials exist before login. apps/web · apps/desktop-web · apps/testbed.
 */
export const RuntimeConnectionHost = (props: RuntimeHostProps) => <ConnectionHost {...props} guestKeepAlive />;

/**
 * The same host WITHOUT background guest login — for a surface that must not have a session until
 * someone signs in (apps/admin-v2). Everything else is identical: same init gate, same socket auth
 * loop, same in-place re-auth.
 *
 * It used to be a 51-line copy of the host above, differing by one line, and its comment claimed a
 * second difference (`RuntimeDataBinder`) that no longer exists anywhere in the repo — the data
 * binder was removed and neither host mounts one. Keeping the two as separate implementations meant
 * every change to the connection contract had to be made twice, and the second copy is exactly where
 * such a change gets forgotten.
 */
export const RuntimeAuthHost = (props: RuntimeHostProps) => <ConnectionHost {...props} guestKeepAlive={false} />;
