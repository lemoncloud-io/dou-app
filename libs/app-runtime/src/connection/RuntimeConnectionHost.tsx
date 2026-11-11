import React, { useEffect, useSyncExternalStore } from 'react';

// Concrete path, not the session barrel: the boot gate is a runtime internal (Decision 6) —
// the same convention `useRelaySessionKeepAlive` already follows below.
import { useRelaySessionInit } from '../session/hooks/app/useRelaySessionInit';
// Guest keep-alive is a runtime behavior, not an app surface (ADR-0076 Decision 6).
import { useRelaySessionKeepAlive } from '../session/hooks/app/useRelaySessionKeepAlive';
import { useConnectionController } from './hooks/useConnectionController';
import type { ConnectionController } from '@chatic/runtime-core';

export interface RuntimeHostProps {
    children?: React.ReactNode;
}

/**
 * Binds the sockets for as long as it is mounted. A component of its own, rendered before the
 * children, so that its effects run before any of theirs in the same commit — the order the two binder
 * components it replaced gave them:
 *
 * - on mount, the socket half starts, and its first pass binds before a child's effect runs;
 * - on every later change, the controller announces the due pass, this component re-renders in the
 *   same commit as the screens that read the same change, and its effect runs the pass before theirs.
 *   Without it the pass would run in the controller's own microtask, after React had already committed
 *   the children and run their effects against the active slot the change was about to move.
 */
const ConnectionSockets = ({ controller }: { controller: ConnectionController }) => {
    const passVersion = useSyncExternalStore(
        controller.subscribeSocketPass,
        controller.getSocketPassVersion,
        controller.getSocketPassVersion
    );
    useEffect(() => controller.startSockets(), [controller]);
    useEffect(() => controller.flushSockets(), [controller, passVersion]);
    return null;
};

/**
 * The one connection host. Both exported hosts are this component with one switch flipped.
 *
 * It is the SINGLE session init driver: `useRelaySessionInit` runs `initializeRelaySession` once
 * and gates the whole connection subtree until ready — replacing the old separate
 * `TransportBootstrap`, which ran a duplicate initialization. What keeps the connections in line with
 * the session is not here: it is runtime-core's connection controller, which this host only starts
 * and stops. An app passes nothing but its children.
 *
 * - The controller's background half (the background clouds' tokens and receive loops) starts on
 *   mount, before the session is ready, as it always has: before a relay session there is nothing to
 *   prepare or receive for.
 * - Its socket half starts once the session is ready. The socket only connects once the relay slot
 *   carries an identity token, so mounting before login is inert.
 */
const ConnectionHost = ({
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
    const controller = useConnectionController();
    useRelaySessionKeepAlive(guestKeepAlive);
    useEffect(() => controller.startBackground(), [controller]);

    if (!isSessionReady) {
        return null;
    }

    return (
        <>
            <ConnectionSockets controller={controller} />
            {children}
        </>
    );
};

/**
 * The connection host for a chat app: keeps a session-less visitor alive as a guest so the socket
 * and its credentials exist before login. apps/web · apps/desktop-web.
 */
export const RuntimeConnectionHost = (props: RuntimeHostProps) => <ConnectionHost {...props} guestKeepAlive />;

/**
 * The same host WITHOUT background guest login — for a surface that must not have a session until
 * someone signs in (apps/admin). Everything else is identical: same init gate, same socket auth
 * loop, same in-place re-auth.
 *
 * It used to be a 51-line copy of the host above, differing by one line, and its comment claimed a
 * second difference (`RuntimeDataBinder`) that no longer exists anywhere in the repo — the data
 * binder was removed and neither host mounts one. Keeping the two as separate implementations meant
 * every change to the connection contract had to be made twice, and the second copy is exactly where
 * such a change gets forgotten.
 */
export const RuntimeAuthHost = (props: RuntimeHostProps) => <ConnectionHost {...props} guestKeepAlive={false} />;
