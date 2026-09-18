/**
 * Uses `unref`, which exists only in Node, so a timer doesn't keep the process from exiting (a no-op
 * in the browser).
 *
 * Placed alongside `coalescer`/`throttle` because it's a domain-agnostic timer shim — `SyncManager`'s
 * grace timer was its first consumer, and there was no reason for it to live inside that class file.
 * In practice it's what keeps jest from hanging with the process held open.
 */
export const unrefTimer = (timer: ReturnType<typeof setTimeout>): void => {
    (timer as { unref?: () => void }).unref?.();
};
