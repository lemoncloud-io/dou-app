export interface RingBuffer<T> {
    /** Appends an item; when full, the oldest item is overwritten. */
    push(item: T): void;
    /** Reads up to `count` oldest items without removing them (FIFO order). */
    peek(count?: number): T[];
    /** Removes and returns up to `count` oldest items (FIFO order). */
    shift(count?: number): T[];
    /** Empties the buffer. */
    clear(): void;
    /** Number of items currently stored. */
    size(): number;
}

/**
 * Fixed-capacity FIFO ring buffer. Mirrors the semantics of the mobile log
 * RingBuffer (oldest-first peek/shift, overwrite-on-full) so the debug UI can
 * treat the web and app log buffers identically.
 */
export const createRingBuffer = <T>(capacity: number): RingBuffer<T> => {
    const max = Math.max(1, capacity);
    let buffer: (T | undefined)[] = new Array(max);
    let head = 0;
    let length = 0;

    const push = (item: T): void => {
        if (length === max) {
            // Full: overwrite the oldest slot and advance head.
            buffer[head] = item;
            head = (head + 1) % max;
        } else {
            buffer[(head + length) % max] = item;
            length += 1;
        }
    };

    const peek = (count = length): T[] => {
        const takeCount = Math.max(0, Math.min(length, count));
        const entries: T[] = [];

        for (let i = 0; i < takeCount; i += 1) {
            const item = buffer[(head + i) % max];
            if (item !== undefined) entries.push(item);
        }

        return entries;
    };

    const shift = (count = length): T[] => {
        const takeCount = Math.max(0, Math.min(length, count));
        const entries: T[] = [];

        for (let i = 0; i < takeCount; i += 1) {
            const index = (head + i) % max;
            const item = buffer[index];
            if (item !== undefined) entries.push(item);
            buffer[index] = undefined;
        }

        head = (head + takeCount) % max;
        length -= takeCount;

        // Reset head when empty to keep subsequent index math simple.
        if (length === 0) head = 0;

        return entries;
    };

    const clear = (): void => {
        buffer = new Array(max);
        head = 0;
        length = 0;
    };

    return {
        push,
        peek,
        shift,
        clear,
        size: () => length,
    };
};
