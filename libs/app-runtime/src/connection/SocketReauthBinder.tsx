import { useEffect, useRef } from 'react';

import { getSocketManager } from '../socket/runtime';
import { reauthenticateActiveSocket } from '../socket';
import type { SocketKind, SocketSessionDelegate } from '../socket';
import type { RuntimeBinding, RuntimeSocketSlot } from '../runtime';
import { socketRebootKey } from './socketRebootKey';

export interface SocketReauthBinderProps {
    binding: RuntimeBinding;
    delegate: SocketSessionDelegate;
}

/**
 * Only the RELAY slot is watched, and that is now a stated invariant rather than an accident.
 *
 * A same-connection identity change means the socket stays while the token under it is replaced.
 * That happens on relay (guest→social/email promotion swaps the relay token while url/deviceId/
 * wssType hold), and it must fire even while a cloud slot is the ACTIVE socket (§6-7).
 *
 * It cannot happen on cloud: **every cloud switch changes the wss URL**, because no two clouds share
 * a wss host (confirmed 2026-09-02). A URL change moves the reboot key, so SocketBinder tears the
 * slot down and `bootstrapSocketConnection` registers the new identity from scratch — there is no
 * surviving connection to re-authenticate. The cloud entry that used to sit in this list was
 * therefore inert: the binding deliberately carries no `identityToken` on the cloud slot (a535055a),
 * so the token comparison below could never move for it.
 *
 * If that invariant ever breaks, the failure is silent here (a live cloud socket keeping the OLD
 * cloud's identity), so the detection lives where it is observable instead — see the same-wss guard
 * in `SocketBinder`. The machinery to support it already exists (`reauthenticateActiveSocket` takes
 * a `cid` and calls `rebindCid` before the handshake, §8-4); what is missing is only the trigger,
 * which is an `identityToken` on the cloud slot.
 */
const SLOT_KINDS: readonly SocketKind[] = ['relay'] as const;

/**
 * Per-slot reboot key — the SAME key SocketBinder reboots on (socketRebootKey). When this key is
 * unchanged the socket is NOT rebooting, so an identity change on that slot must be
 * re-authenticated in place rather than double-registered.
 */
const slotRebootKey = (slot?: RuntimeSocketSlot): string => socketRebootKey(slot?.config);

type SlotSnapshot = { reboot: string; token: string };

const emptySnapshot = (): SlotSnapshot => ({ reboot: '', token: '' });

/**
 * Re-authenticates a live socket when its server identity changes ON THE SAME connection while the
 * socket is NOT rebooting. In practice that is the relay slot's guest→social/email promotion: the
 * relay token is swapped while url/deviceId/wssType stay, and it must fire even while a cloud slot is
 * the active socket (§6-7). Cloud is out of scope by invariant — see `SLOT_KINDS`.
 *
 * For each slot we compare the reboot key (cid/token-blind) and the identity token: a genuine reboot
 * (url/deviceId/wssType change) is handled by SocketBinder via bootstrapSocketConnection, so we skip
 * it to avoid a double register. The actual work + the feedback-loop guard (the SDK-driven refresh
 * writeback also changes the token but must NOT trigger re-auth) live in reauthenticateActiveSocket,
 * which no-ops when the token already matches the SDK's.
 */
export const SocketReauthBinder = ({ binding, delegate }: SocketReauthBinderProps) => {
    const socketManager = getSocketManager();
    const prevRef = useRef<Partial<Record<SocketKind, SlotSnapshot>>>({ relay: emptySnapshot() });
    const hasMountedRef = useRef(false);

    useEffect(() => {
        const slots: Partial<Record<SocketKind, RuntimeSocketSlot | undefined>> = {
            relay: binding.socket.relay,
        };

        const snapshotOf = (kind: SocketKind): SlotSnapshot => ({
            reboot: slotRebootKey(slots[kind]),
            token: slots[kind]?.identityToken ?? '',
        });

        // First render: the sockets are freshly bootstrapped (or absent). Seed the refs and skip.
        if (!hasMountedRef.current) {
            hasMountedRef.current = true;
            for (const kind of SLOT_KINDS) {
                prevRef.current[kind] = snapshotOf(kind);
            }
            return;
        }

        for (const kind of SLOT_KINDS) {
            const slot = slots[kind];
            const next = snapshotOf(kind);
            const prev = prevRef.current[kind] ?? emptySnapshot();
            prevRef.current[kind] = next;

            const socketChanged = prev.reboot !== next.reboot;
            const tokenChanged = prev.token !== next.token;

            // No token (slot gated off / logged out), no identity change, or a reboot (SocketBinder
            // re-registers) → skip. A genuine same-socket identity change re-authenticates this kind.
            if (!next.token || !tokenChanged || socketChanged) {
                continue;
            }

            void reauthenticateActiveSocket({
                manager: socketManager,
                delegate,
                kind,
                cid: slot?.config.cid ?? null,
            });
        }
        // Deps are binding.socket (the slot configs + tokens actually read) plus the stable manager
        // and delegate; the per-slot refs above absorb re-runs that are not a real identity change.
    }, [binding.socket, socketManager, delegate]);

    return null;
};
