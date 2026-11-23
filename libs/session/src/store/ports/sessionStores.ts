import type { KeyValueStore } from '@chatic/storage';

import type { ISessionStores, PortName, SessionStoragePorts } from './types';

export class SessionStores implements ISessionStores {
    private configured: SessionStoragePorts | null = null;

    configure(ports: SessionStoragePorts): void {
        this.configured = ports;
    }

    of(port: PortName): KeyValueStore {
        if (!this.configured) {
            throw new Error(
                `[session] the '${port}' storage port was used before any store was configured — ` +
                    'the entry point has to pass `storage` to createRuntime() before anything reads the session.'
            );
        }
        return this.configured[port];
    }
}
