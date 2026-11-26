import type { RuntimeStorePorts } from '@chatic/ports';
import type { KeyValueStore } from '@chatic/storage';

export type { RuntimeStorePorts };

let ports: RuntimeStorePorts | null = null;

export const runtimeStores = {
    device(): KeyValueStore {
        if (!ports) {
            throw new Error(
                "[runtime-core] the runtime's device store was used before it was configured — the entry point " +
                    'has to pass `storage.device` to createRuntime().'
            );
        }
        return ports.device;
    },
    configure(next: RuntimeStorePorts): void {
        ports = next;
    },
    reset(): void {
        ports = null;
    },
};
