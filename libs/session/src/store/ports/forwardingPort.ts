import type { StorageLike } from '../jsonSlot';
import type { ISessionMedia, PortName } from './types';

/**
 * A port the stores hold for their lifetime. It forwards every call to whatever medium backs the port
 * now, so the stores can be built at import while the media are chosen later, at boot.
 */
export class ForwardingPort implements StorageLike {
    constructor(
        private readonly media: ISessionMedia,
        private readonly port: PortName
    ) {}

    get(key: string): string | null {
        return this.media.of(this.port).get(key);
    }

    set(key: string, value: string): void {
        this.media.of(this.port).set(key, value);
    }

    remove(key: string): void {
        this.media.of(this.port).remove(key);
    }
}
