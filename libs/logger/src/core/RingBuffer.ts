/**
 * Fixed-capacity FIFO ring buffer. Mirrors the semantics of the mobile log
 * RingBuffer (oldest-first peek/shift, overwrite-on-full) so the debug UI can
 * treat the web and app log buffers identically.
 *
 * Generic and log-agnostic on purpose — `LogBuffer` is the log-shaped facade
 * built on top of it.
 */
export class RingBuffer<T> {
    private readonly max: number;
    private buffer: (T | undefined)[];
    private head = 0;
    private length = 0;

    constructor(capacity: number) {
        this.max = Math.max(1, capacity);
        this.buffer = new Array<T | undefined>(this.max);
    }

    /** Appends an item; when full, the oldest item is overwritten. */
    public push(item: T): void {
        if (this.length === this.max) {
            // Full: overwrite the oldest slot and advance head.
            this.buffer[this.head] = item;
            this.head = (this.head + 1) % this.max;
            return;
        }

        this.buffer[(this.head + this.length) % this.max] = item;
        this.length += 1;
    }

    /** Reads up to `count` oldest items without removing them (FIFO order). */
    public peek(count: number = this.length): T[] {
        const takeCount = this.clampCount(count);
        const entries: T[] = [];

        for (let i = 0; i < takeCount; i += 1) {
            const item = this.buffer[(this.head + i) % this.max];
            if (item !== undefined) entries.push(item);
        }

        return entries;
    }

    /** Removes and returns up to `count` oldest items (FIFO order). */
    public shift(count: number = this.length): T[] {
        const takeCount = this.clampCount(count);
        const entries: T[] = [];

        for (let i = 0; i < takeCount; i += 1) {
            const index = (this.head + i) % this.max;
            const item = this.buffer[index];
            if (item !== undefined) entries.push(item);
            this.buffer[index] = undefined;
        }

        this.head = (this.head + takeCount) % this.max;
        this.length -= takeCount;

        // Reset head when empty to keep subsequent index math simple.
        if (this.length === 0) this.head = 0;

        return entries;
    }

    /** Empties the buffer. */
    public clear(): void {
        this.buffer = new Array<T | undefined>(this.max);
        this.head = 0;
        this.length = 0;
    }

    /** Number of items currently stored. */
    public size(): number {
        return this.length;
    }

    private clampCount(count: number): number {
        return Math.max(0, Math.min(this.length, count));
    }
}
