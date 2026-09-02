import { useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';

import { getSocketManager } from '../socket/runtime';
import { bootstrapSocketConnection } from '../socket';
import type { ISocketManager, SocketBindingConfig, SocketKind, SocketSessionDelegate } from '../socket';
import type { RuntimeBinding } from '../runtime';
import { socketRebootKey } from './socketRebootKey';

export interface SocketBinderProps {
    binding: RuntimeBinding;
    delegate: SocketSessionDelegate;
}

/**
 * Detects the one cloud switch this design does not support: a switch to a cloud that shares the
 * PREVIOUS cloud's wss host.
 *
 * The whole reboot path rests on the invariant that a cloud switch changes the wss URL, because no
 * two clouds share a wss host (confirmed 2026-09-02). That is what makes `SocketBinder` alone
 * sufficient: a URL change moves the reboot key, the slot is rebuilt, and `bootstrapSocketConnection`
 * registers the new cloud's identity. `SocketReauthBinder` deliberately does not watch cloud for the
 * same reason (see its `SLOT_KINDS`).
 *
 * Break the invariant and nothing errors — the reboot key holds, the socket stays up, and it keeps
 * serving the OUTGOING cloud's identity while the app believes it switched. That silence is the
 * problem, so this names it. The signature is exact: the slot's `cid` is the COMMITTED cloud, which
 * only moves on a successful token exchange, while the reboot key is url/deviceId/wssType — so
 * "committed cloud moved, socket did not" has no benign reading.
 *
 * Not a throw: the session is usable and a hard failure here would take down a working app over a
 * backend topology change. Supporting the case is a small, known step if it ever arrives — put an
 * `identityToken` on the cloud slot and add cloud back to `SocketReauthBinder`, whose
 * `reauthenticateActiveSocket` already takes the `cid` and calls `rebindCid` before the handshake
 * (§8-4).
 */
const useSameWssSwitchGuard = (kind: SocketKind, rebootKey: string, cid: string | undefined): void => {
    const prevRef = useRef({ rebootKey, cid });

    useEffect(() => {
        const prev = prevRef.current;
        prevRef.current = { rebootKey, cid };

        if (kind !== 'cloud') return;
        // Both sides must name a real cloud, so this is a switch between two live clouds rather than
        // a slot turning on or off. `'default'` is the no-committed-cloud sentinel; it cannot appear
        // while the slot is bound (the slot gates on `cloud.wss`, which comes off the delegation
        // token that also supplies the committed cid), but treating it as absent keeps the guard
        // honest if that ever changes.
        const isCloud = (value: string | undefined): boolean => !!value && value !== 'default';
        if (!isCloud(prev.cid) || !isCloud(cid)) return;
        if (prev.rebootKey !== rebootKey || prev.cid === cid) return;

        logger.error('SOCKET', '[SocketBinder] same-wss cloud switch is unsupported', {
            data: { from: prev.cid, to: cid, rebootKey },
        });
    }, [kind, rebootKey, cid]);
};

/**
 * Manages ONE socket slot (relay or cloud) independently: (re)boots it via the pure
 * `bootstrapSocketConnection` on a socket-identity change, and tears just that slot down when it is
 * gated off. relay and cloud slots coexist (dual sockets) — a change to one never disturbs the other.
 *
 * Keyed on the reboot key `url|deviceId|wssType` — deliberately NOT the slot's full config (which
 * includes `cid`):
 *   1. The binding is a fresh object on every session mutation; keying on the stable string avoids
 *      re-running (and detaching an in-flight bootstrap's SDK auth subscriptions) on benign re-renders.
 *   2. A cid-only flip is an OPTIMISTIC cloud switch — rebooting then would re-freeze boundCid to the
 *      target cloud while still attached to the outgoing one, poisoning the cache (§6-9/§8-4).
 * The live config (incl. cid) is read from a ref, so a genuine reboot still passes the current cid.
 */
const useSocketSlot = (
    manager: ISocketManager,
    kind: SocketKind,
    config: SocketBindingConfig | undefined,
    delegate: SocketSessionDelegate
): void => {
    const cleanupRef = useRef<(() => void) | null>(null);
    const rebootKey = socketRebootKey(config);
    const configRef = useRef(config);
    configRef.current = config;

    useSameWssSwitchGuard(kind, rebootKey, config?.cid);

    useEffect(() => {
        // Detach the previous connection's SDK auth subscriptions before (re)booting / tearing down.
        cleanupRef.current?.();
        cleanupRef.current = null;

        const current = configRef.current;
        if (!current) {
            // Slot gated off (logged out / cloud left) → tear down just this kind; the sibling stays.
            manager.destroy(kind);
            return;
        }

        // Genuine reboot: `ensure` inside bootstrap tears down this kind's stale client (its config
        // differs) and builds a fresh one — no destroy-all, so the sibling slot is untouched.
        let active = true;
        void bootstrapSocketConnection({ manager, kind, config: current, delegate })
            .then(cleanup => {
                if (!active) {
                    cleanup();
                    return;
                }
                cleanupRef.current = cleanup;
            })
            .catch(error => {
                logger.error('SOCKET', '[SocketBinder] bootstrap failed', { error, data: { kind } });
            });

        return () => {
            active = false;
        };
        // Keyed on rebootKey (not the config object) so benign re-renders and cid-only flips do not
        // re-run this effect. `config` is read via configRef (a ref, so it needs no dependency entry).
    }, [rebootKey, manager, kind, delegate]);

    // Detach on unmount so the slot's subscriptions do not leak.
    useEffect(
        () => () => {
            cleanupRef.current?.();
            cleanupRef.current = null;
        },
        []
    );
};

/**
 * Boots the dual sockets from `binding.socket`: a relay slot (always-on once a relay token exists)
 * and a cloud slot (present only while a cloud session is active). Each is managed independently by
 * `useSocketSlot`, so relay stays connected (keeping its token alive for relay HTTP) while cloud
 * comes and goes. (multi-socket-design.md §5-1/§5-3)
 */
export const SocketBinder = ({ binding, delegate }: SocketBinderProps) => {
    const socketManager = getSocketManager();
    useSocketSlot(socketManager, 'relay', binding.socket.relay?.config, delegate);
    useSocketSlot(socketManager, 'cloud', binding.socket.cloud?.config, delegate);
    return null;
};
