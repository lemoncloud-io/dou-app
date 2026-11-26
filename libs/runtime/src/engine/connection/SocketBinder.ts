import { logger } from '@chatic/logger';

import { hasLiveJoinedSession, RELAY_SLOT, kindOf, slotKeyOf } from '@chatic/transport';
import type { ISocketManager, SlotKey, SocketBindingConfig } from '@chatic/transport';
import { bootstrapSocketConnection, notifySocketLogout } from '@chatic/auth';
import type { SocketSessionDelegate } from '@chatic/auth';
import type { RuntimeSocketSlots } from './types';
import { socketRebootKey } from './socketRebootKey';

interface BootedSlot {
    rebootKey: string;
    delegate: SocketSessionDelegate;
    detached: boolean;
    cleanup: (() => void) | null;
}

interface DesiredSlots {
    configs: Map<SlotKey, SocketBindingConfig>;
    active: SlotKey | null;
}

const desiredSlotsOf = (slots: RuntimeSocketSlots): DesiredSlots => {
    const configs = new Map<SlotKey, SocketBindingConfig>();
    for (const slot of [slots.relay, ...(slots.background ?? []), slots.cloud]) {
        if (slot) configs.set(slotKeyOf(slot.config.cid), slot.config);
    }
    return { configs, active: slots.cloud ? slotKeyOf(slots.cloud.config.cid) : null };
};

const slotsSignature = (slots: RuntimeSocketSlots): string => {
    const desired = desiredSlotsOf(slots);
    const bound = [...desired.configs]
        .map(([key, config]) => `${key}=${socketRebootKey(config)}`)
        .sort()
        .join(';');
    return `${bound}|active=${desired.active ?? ''}`;
};

const detach = (booted: BootedSlot): void => {
    booted.detached = true;
    booted.cleanup?.();
    booted.cleanup = null;
};

const reconcileSlots = (
    manager: ISocketManager,
    booted: Map<SlotKey, BootedSlot>,
    desired: DesiredSlots,
    delegate: SocketSessionDelegate
): void => {
    for (const [key, config] of desired.configs) {
        const rebootKey = socketRebootKey(config);
        const current = booted.get(key);
        if (current && current.rebootKey === rebootKey && current.delegate === delegate) continue;

        if (current) detach(current);
        const next: BootedSlot = { rebootKey, delegate, detached: false, cleanup: null };
        booted.set(key, next);
        void bootstrapSocketConnection({ manager, config, delegate })
            .then(cleanup => {
                if (next.detached) {
                    cleanup();
                    return;
                }
                next.cleanup = cleanup;
            })
            .catch(error => {
                if (!next.detached && booted.get(key) === next) booted.delete(key);
                logger.error('SOCKET', '[SocketBinder] bootstrap failed', {
                    error,
                    data: { cid: key, kind: kindOf(key), active: desired.active === key },
                });
            });
    }

    manager.setActiveSlot(desired.active);

    const relayKept = desired.configs.has(RELAY_SLOT);
    for (const key of manager.getSlotKeys()) {
        if (desired.configs.has(key) || !relayKept || kindOf(key) !== 'cloud') continue;
        if (hasLiveJoinedSession(key)) notifySocketLogout(key, manager);
    }

    for (const [key, current] of [...booted]) {
        if (desired.configs.has(key)) continue;
        detach(current);
        booted.delete(key);
    }
    for (const key of manager.getSlotKeys()) {
        if (!desired.configs.has(key)) manager.destroy(key);
    }
};

export class SocketBinder {
    private readonly booted = new Map<SlotKey, BootedSlot>();
    private last: { signature: string; delegate: SocketSessionDelegate } | null = null;

    constructor(private readonly manager: ISocketManager) {}

    apply(slots: RuntimeSocketSlots, delegate: SocketSessionDelegate): void {
        const signature = slotsSignature(slots);
        if (this.last && this.last.signature === signature && this.last.delegate === delegate) return;
        reconcileSlots(this.manager, this.booted, desiredSlotsOf(slots), delegate);
        this.last = { signature, delegate };
    }

    detachAll(): void {
        for (const current of this.booted.values()) detach(current);
        this.booted.clear();
        this.last = null;
    }
}
