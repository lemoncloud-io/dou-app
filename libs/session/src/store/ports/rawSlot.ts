import type { StorageLike } from '../jsonSlot';
import type { IRawSlot } from './types';

/** A single key of a port, as a raw string. */
export class RawSlot implements IRawSlot {
    constructor(
        private readonly port: StorageLike,
        private readonly key: string
    ) {}

    read(): string | null {
        return this.port.get(this.key);
    }

    write(raw: string): void {
        this.port.set(this.key, raw);
    }

    clear(): void {
        this.port.remove(this.key);
    }
}
