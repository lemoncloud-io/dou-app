import React from 'react';

import { useInitWebCore } from '@chatic/web-core';
import { SocketBinder } from './SocketBinder';
import { SocketReauthBinder } from './SocketReauthBinder';
import { useSocketSessionDelegate } from './useSocketSessionDelegate';
import type { RuntimeBinding } from '../runtime';

export interface RuntimeAuthHostProps {
    binding: RuntimeBinding;
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
 * Like `RuntimeConnectionHost`, it is a single web-core init driver: `useInitWebCore` runs
 * `initializeRelaySession` once and gates the subtree until ready. The socket only connects once the
 * binding carries an identity token, so mounting it before login is inert.
 */
export const RuntimeAuthHost = ({ binding, children }: RuntimeAuthHostProps) => {
    const isWebCoreReady = useInitWebCore();
    const delegate = useSocketSessionDelegate();

    if (!isWebCoreReady) {
        return null;
    }

    return (
        <>
            <SocketBinder binding={binding} delegate={delegate} />
            <SocketReauthBinder binding={binding} delegate={delegate} />
            {children}
        </>
    );
};
