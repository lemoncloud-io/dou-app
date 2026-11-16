import type { LocalCachePorts } from '@chatic/data';

export interface ILocalCachePlatform {
    /**
     * Points the runtime at the platform's cache. Called by the runtime's assembly before the data
     * graph is built. Assignment, so a second call (HMR) replaces rather than accumulates.
     */
    configure(ports: LocalCachePorts): void;
    /** The ports as configured. Throws until `configure` has run: there is no cache to fall back on. */
    ports(): LocalCachePorts;
}

class LocalCachePlatform implements ILocalCachePlatform {
    private configured: LocalCachePorts | null = null;

    configure(ports: LocalCachePorts): void {
        this.configured = ports;
    }

    ports(): LocalCachePorts {
        if (!this.configured) {
            throw new Error(
                '[data] the local cache ports were used before any were configured — the entry point has to pass ' +
                    '`cache` to createRuntime() before the data graph is built.'
            );
        }
        return this.configured;
    }
}

/**
 * Where the cache's rows live, as the platform answers it. A default would be a page's IndexedDB,
 * which a native process does not have; an unwired runtime fails at the first use instead.
 */
export const localCachePlatform: ILocalCachePlatform = new LocalCachePlatform();
