import { slotKeyOf } from '@chatic/transport';
import type { ISocketManager, SocketKind } from '@chatic/transport';
import { reauthenticateActiveSocket } from '@chatic/auth';
import type { SocketSessionDelegate } from '@chatic/auth';
import type { RuntimeSocketSlots, RuntimeSocketSlot } from './types';
import { socketRebootKey } from './socketRebootKey';

/**
 * Only the RELAY slot is watched, and that is now a stated invariant rather than an accident.
 *
 * A same-connection identity change means the socket stays while the token under it is replaced.
 * That happens on relay (guest→social/email promotion swaps the relay token while url/deviceId/
 * wssType hold), and it must fire even while a cloud slot is the ACTIVE socket (§6-7).
 *
 * It cannot happen on cloud. Slots are keyed by the cloud they serve, so a switch either boots the
 * incoming cloud as a new slot — `bootstrapSocketConnection` registers its identity from scratch — or
 * lands on that cloud's background slot, and then commits the very tokens that slot registered with
 * (`cloudSession.switchTo`'s `hasLiveSlot`). Neither leaves an identity change on a live connection.
 * The cloud entry that used to sit in this list was therefore inert: no cloud slot carries an
 * `identityToken`, so the token comparison below could never move for it.
 *
 * A cloud token re-issued WITHOUT a switch keeps the same slot and is invisible here for the same
 * reason; `renewCloudSession` re-registers it explicitly. `reauthenticateActiveSocket` already
 * re-registers any slot it is pointed at; what is missing for cloud is only the trigger, which is an
 * `identityToken` on the cloud slot.
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
export class SocketReauthBinder {
    private readonly prev: Partial<Record<SocketKind, SlotSnapshot>> = { relay: emptySnapshot() };
    private seeded = false;

    constructor(private readonly manager: ISocketManager) {}

    /** Compares `slots` with the previous pass and re-authenticates a slot whose identity moved in place. */
    apply(allSlots: RuntimeSocketSlots, delegate: SocketSessionDelegate): void {
        const slots: Partial<Record<SocketKind, RuntimeSocketSlot | undefined>> = {
            relay: allSlots.relay,
        };

        const snapshotOf = (kind: SocketKind): SlotSnapshot => ({
            reboot: slotRebootKey(slots[kind]),
            token: slots[kind]?.identityToken ?? '',
        });

        // First pass: the sockets are freshly bootstrapped (or absent). Seed the snapshots and skip.
        if (!this.seeded) {
            this.seeded = true;
            for (const kind of SLOT_KINDS) {
                this.prev[kind] = snapshotOf(kind);
            }
            return;
        }

        for (const kind of SLOT_KINDS) {
            const slot = slots[kind];
            const next = snapshotOf(kind);
            const prev = this.prev[kind] ?? emptySnapshot();
            this.prev[kind] = next;

            const socketChanged = prev.reboot !== next.reboot;
            const tokenChanged = prev.token !== next.token;

            // No token (slot gated off / logged out), no identity change, or a reboot (SocketBinder
            // re-registers) → skip. A genuine same-socket identity change re-authenticates this kind.
            if (!next.token || !tokenChanged || socketChanged) {
                continue;
            }

            if (!slot) continue;
            void reauthenticateActiveSocket({
                manager: this.manager,
                delegate,
                slot: slotKeyOf(slot.config.cid),
            });
        }
    }
}
