import type { LocalCachePorts } from '@chatic/data';

export interface ILocalCachePlatform {
    configure(ports: LocalCachePorts): void;
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

export const localCachePlatform: ILocalCachePlatform = new LocalCachePlatform();
