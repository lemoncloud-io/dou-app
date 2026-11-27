import { slotKeyOf } from '@chatic/transport';
import type { ISocketManager, SocketKind } from '@chatic/transport';
import { reauthenticateActiveSocket } from '@chatic/auth';
import type { SocketSessionDelegate } from '@chatic/auth';
import type { RuntimeSocketSlots, RuntimeSocketSlot } from './types';
import { socketRebootKey } from './socketRebootKey';

const SLOT_KINDS: readonly SocketKind[] = ['relay'] as const;

const slotRebootKey = (slot?: RuntimeSocketSlot): string => socketRebootKey(slot?.config);

type SlotSnapshot = { reboot: string; token: string };

const emptySnapshot = (): SlotSnapshot => ({ reboot: '', token: '' });

export class SocketReauthBinder {
    private readonly prev: Partial<Record<SocketKind, SlotSnapshot>> = { relay: emptySnapshot() };
    private seeded = false;

    constructor(private readonly manager: ISocketManager) {}

    apply(allSlots: RuntimeSocketSlots, delegate: SocketSessionDelegate): void {
        const slots: Partial<Record<SocketKind, RuntimeSocketSlot | undefined>> = {
            relay: allSlots.relay,
        };

        const snapshotOf = (kind: SocketKind): SlotSnapshot => ({
            reboot: slotRebootKey(slots[kind]),
            token: slots[kind]?.identityToken ?? '',
        });

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
