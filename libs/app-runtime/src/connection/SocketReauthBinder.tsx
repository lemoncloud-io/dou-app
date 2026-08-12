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

/** Both slots are watched independently; relay may change while cloud is the active socket. */
const SLOT_KINDS: readonly SocketKind[] = ['relay', 'cloud'] as const;

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
 * socket is NOT rebooting. Watches EACH slot independently (not just the active one), but in
 * practice only the RELAY slot can fire today:
 *   - guest→social/email promotion: web-core swaps the relay token while url/deviceId/wssType stay —
 *     and this must fire even while a cloud slot is the active socket (§6-7).
 *   - cloud: the binding deliberately carries NO `identityToken` on the cloud slot (a535055a) on the
 *     assumption that a cloud switch always changes the wss URL and therefore reboots through
 *     SocketBinder. The cloud watch below is therefore inert — if two clouds ever share a wss, a
 *     same-wss switch would keep the OLD cloud identity on the socket. Decision to support-or-drop
 *     tracked as 2026-08 session audit §5-7 (Phase 3).
 *
 * For each slot we compare the reboot key (cid/token-blind) and the identity token: a genuine reboot
 * (url/deviceId/wssType change) is handled by SocketBinder via bootstrapSocketConnection, so we skip
 * it to avoid a double register. The actual work + the feedback-loop guard (the SDK-driven refresh
 * writeback also changes the token but must NOT trigger re-auth) live in reauthenticateActiveSocket,
 * which no-ops when the token already matches the SDK's.
 */
export const SocketReauthBinder = ({ binding, delegate }: SocketReauthBinderProps) => {
    const socketManager = getSocketManager();
    const prevRef = useRef<Record<SocketKind, SlotSnapshot>>({ relay: emptySnapshot(), cloud: emptySnapshot() });
    const hasMountedRef = useRef(false);

    useEffect(() => {
        const slots: Record<SocketKind, RuntimeSocketSlot | undefined> = {
            relay: binding.socket.relay,
            cloud: binding.socket.cloud,
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
            const prev = prevRef.current[kind];
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
