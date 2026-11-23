import type { StorageLike } from '../jsonSlot';
import type { IRawSlot } from './types';

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
