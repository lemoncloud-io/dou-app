import { type KeyValueStore, WebMedium } from '@chatic/storage';

import type { ISessionMedia, PortName, SessionStoragePorts } from './types';

/**
 * Until an entry point configures the ports, both are this tab's `sessionStorage` — the browser's
 * answer, and the one an app that never configures them (the landing site) keeps.
 * Built on first use, not at import, so loading the package touches no storage.
 */
export class SessionMedia implements ISessionMedia {
    private configured: SessionStoragePorts | null = null;
    private fallback: KeyValueStore | null = null;

    configure(ports: SessionStoragePorts): void {
        this.configured = ports;
    }

    of(port: PortName): KeyValueStore {
        if (this.configured) return this.configured[port];
        this.fallback ??= WebMedium.session();
        return this.fallback;
    }
}
