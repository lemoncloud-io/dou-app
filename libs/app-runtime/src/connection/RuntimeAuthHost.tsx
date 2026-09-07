import React from 'react';

import { useRelaySessionInit } from '../session';
import { SocketBinder } from './SocketBinder';
import { SocketReauthBinder } from './SocketReauthBinder';
import { useSocketSessionDelegate } from './useSocketSessionDelegate';
import { useRuntimeSocketSlots } from '../runtime';
import type { RuntimeSocketSlots } from '../runtime';

export interface RuntimeAuthHostProps {
    /** Override for the slots this host derives itself. See `RuntimeConnectionHostProps.slots`. */
    slots?: RuntimeSocketSlots;
    children?: React.ReactNode;
}

/**
 * Auth-only connection host: a stripped-down `RuntimeConnectionHost` that keeps a session's tokens
 * fresh WITHOUT chat data sync or guest keep-alive. It mounts the SDK-backed socket auth loop
 * (`SocketBinder` → `bootstrapSocketConnection` wires `onTokenRefresh` → `commitRefreshedToken`,
 * which re-mints the AWS/HTTP signing credentials in web-core) plus in-place re-auth
 * (`SocketReauthBinder`).
 *
 * Deliberately omitted vs `RuntimeConnectionHost`:
 * - `useRelaySessionKeepAlive` — no background guest login; hosts that require an explicit login
 *   (e.g. admin consoles) must not silently acquire a guest session.
 * - `RuntimeDataBinder` — no chat/channel data scope; this host is purely for token lifecycle.
 *
 * Like `RuntimeConnectionHost`, it is a single web-core init driver: `useRelaySessionInit` runs
 * `initializeRelaySession` once and gates the subtree until ready. The socket only connects once the
 * relay slot carries an identity token, so mounting it before login is inert.
 */
export const RuntimeAuthHost = ({ slots, children }: RuntimeAuthHostProps) => {
    const isSessionReady = useRelaySessionInit();
    const delegate = useSocketSessionDelegate();
    const derivedSlots = useRuntimeSocketSlots();
    const activeSlots = slots ?? derivedSlots;

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
