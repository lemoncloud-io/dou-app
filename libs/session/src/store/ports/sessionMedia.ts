import type { KeyValueStore } from '@chatic/storage';

import type { ISessionMedia, PortName, SessionStoragePorts } from './types';

/**
 * Which media back the session's two ports. **There is no default.** Until an entry point configures
 * them, reading either one throws.
 *
 * Any default here would be one platform's storage — this tab's `sessionStorage` — and the session
 * runs in more than one place. A runtime that was never handed its media would then keep credentials
 * wherever that default lands, and the first sign of it would be a session that silently does not
 * survive, on a device. Failing at the first read names the missing wiring instead.
 */
export class SessionMedia implements ISessionMedia {
    private configured: SessionStoragePorts | null = null;

    configure(ports: SessionStoragePorts): void {
        this.configured = ports;
    }

    of(port: PortName): KeyValueStore {
        if (!this.configured) {
            throw new Error(
                `[session] the '${port}' storage port was used before any medium was configured — ` +
                    'the entry point has to pass `storage` to initAppRuntime() before anything reads the session.'
            );
        }
        return this.configured[port];
    }
}
