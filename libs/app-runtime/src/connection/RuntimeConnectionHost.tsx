import React from 'react';

// Concrete path, not the session barrel: the boot gate is a runtime internal (결정 6) —
// the same convention `useRelaySessionKeepAlive` already follows below.
import { useRelaySessionInit } from '../session/hooks/app/useRelaySessionInit';
// Guest keep-alive is a runtime behavior, not an app surface (ADR-0076 결정 6).
import { useRelaySessionKeepAlive } from '../session/hooks/app/useRelaySessionKeepAlive';
import { SocketBinder } from './SocketBinder';
import { SocketReauthBinder } from './SocketReauthBinder';
import { useSocketSessionDelegate } from './useSocketSessionDelegate';
import { useRuntimeSocketSlots } from '../runtime';
import type { RuntimeSocketSlots } from '../runtime';

export interface RuntimeConnectionHostProps {
    /**
     * Override for the slots this host would derive itself. Normally OMITTED — every app used to
     * repeat `const binding = useRuntimeBinding()` and hand it straight back down, which is why the
     * host derives them now (ADR-0076 G5). Kept for tests and for a host that must inject slots.
     */
    slots?: RuntimeSocketSlots;
    children?: React.ReactNode;
}

/**
 * Assembles the declarative connection host. It is the SINGLE web-core init driver: `useRelaySessionInit`
 * runs `initializeRelaySession` (transport + auth) once and gates the whole connection subtree until
 * ready — replacing the old separate `TransportBootstrap`, which independently re-triggered
 * `startWebCoreInit` (a duplicate initialization). The socket session delegate AND the socket slots
 * are owned here, so an app passes nothing but its children; socket lifecycle + SDK re-auth are
 * handled by SocketBinder + bootstrapSocketConnection.
 */
export const RuntimeConnectionHost = ({ slots, children }: RuntimeConnectionHostProps) => {
    const isSessionReady = useRelaySessionInit();
    const delegate = useSocketSessionDelegate();
    const derivedSlots = useRuntimeSocketSlots();
    const activeSlots = slots ?? derivedSlots;
    useRelaySessionKeepAlive(true);

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
