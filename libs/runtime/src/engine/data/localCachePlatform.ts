import type { DbPort } from '@chatic/data';

export interface ILocalCachePlatform {
    configure(ports: DbPort): void;
    ports(): DbPort;
}

class LocalCachePlatform implements ILocalCachePlatform {
    private configured: DbPort | null = null;

    configure(ports: DbPort): void {
        this.configured = ports;
    }

    ports(): DbPort {
        if (!this.configured) {
            throw new Error(
                '[data] the local cache ports were used before any were configured — the entry point has to pass ' +
                    '`db` to createRuntime() before the data graph is built.'
            );
        }
        return this.configured;
    }
}

export const localCachePlatform: ILocalCachePlatform = new LocalCachePlatform();
