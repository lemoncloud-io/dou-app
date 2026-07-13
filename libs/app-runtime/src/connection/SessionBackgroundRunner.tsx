import { useRelaySessionKeepAlive } from '@chatic/web-core';

/**
 * Background session upkeep. RuntimeConnectionHost mounts this ONLY after web-core init completes, so
 * keepAlive runs with `enabled = true` — when the relay session is absent it performs a background
 * guest login. Web-core init + readiness gating is owned by RuntimeConnectionHost (a second
 * `useInitWebCore` here would drive a duplicate `initializeRelaySession`).
 */
export const SessionBackgroundRunner = () => {
    useRelaySessionKeepAlive(true);
    return null;
};
