import { MemoryMedium } from '../memoryMedium';
import { withTimeout } from './withTimeout.util';

import type { KeyValueStore } from '../types';
import type { NativeMedium, NativeReadResult, NativeSecureMediumOptions, NativeStorageChannel } from './types';

const UNANSWERED: NativeReadResult = { status: 'unavailable', reason: 'error', values: {} };

/**
 * `nativeSecure` — the device vault an app or desktop shell keeps, seen synchronously.
 *
 * The vault is behind the bridge, which is asynchronous, and the session is read on every request and
 * every render. So the values live in memory: `hydrate()` loads them once per page, reads answer from
 * memory, and writes go to memory at once and to the vault after. The writes of one turn of the event
 * loop travel as one `StorageSave`, carrying the last value of each key.
 *
 * **Unavailable is not empty.** When the vault cannot be read, or a write is refused, the medium
 * switches to its fallback — the tab's `sessionStorage` — for the rest of the run, carrying what it
 * held, so the person stays signed in until the app is closed. It never falls back to `localStorage`:
 * that is the copy the vault exists to replace.
 */
export class NativeSecureMedium implements NativeMedium {
    private readonly channel: NativeStorageChannel;
    private readonly fallback: KeyValueStore;
    private readonly timeoutMs: number | undefined;

    private readonly values = new MemoryMedium();
    private unavailable = false;
    /** The keys this medium put in the fallback: the fallback is a whole web storage, shared. */
    private readonly fallbackKeys = new Set<string>();

    /** Writes not sent yet: a key's last value, or `null` for a removal. */
    private readonly pending = new Map<string, string | null>();
    private pendingClear = false;
    private scheduled = false;
    /** Every send waits for the one before it, so the vault sees writes in the order they were made. */
    private chain: Promise<void> = Promise.resolve();

    constructor({ channel, fallback, timeoutMs }: NativeSecureMediumOptions) {
        this.channel = channel;
        this.fallback = fallback;
        this.timeoutMs = timeoutMs;
    }

    get status(): 'available' | 'unavailable' {
        return this.unavailable ? 'unavailable' : 'available';
    }

    async hydrate(): Promise<NativeReadResult> {
        const result = await this.bounded(this.channel.read()).catch(() => UNANSWERED);
        if (result.status === 'available') {
            for (const [key, value] of Object.entries(result.values)) this.values.set(key, value);
        } else {
            this.switchToFallback();
        }
        return result;
    }

    get(key: string): string | null {
        return this.unavailable ? this.fallback.get(key) : this.values.get(key);
    }

    set(key: string, value: string): void {
        if (this.unavailable) {
            this.fallback.set(key, value);
            this.fallbackKeys.add(key);
            return;
        }
        this.values.set(key, value);
        this.queue(key, value);
    }

    remove(key: string): void {
        if (this.unavailable) {
            this.fallback.remove(key);
            this.fallbackKeys.delete(key);
            return;
        }
        this.values.remove(key);
        this.queue(key, null);
    }

    /** Empties this medium — in the fallback, only the keys it put there. */
    clear(): void {
        if (this.unavailable) {
            this.fallbackKeys.forEach(key => this.fallback.remove(key));
            this.fallbackKeys.clear();
            return;
        }
        this.values.clear();
        this.pending.clear();
        this.pendingClear = true;
        this.schedule();
    }

    keys(): string[] {
        if (this.unavailable) return [...this.fallbackKeys].filter(key => this.fallback.get(key) !== null);
        return this.values.keys();
    }

    async flush(): Promise<void> {
        if (!this.unavailable) await this.send();
        // A send already in flight when this was called may be the one that failed, so the medium's
        // state after the wait is the answer, not this call's own send.
        if (this.unavailable) throw new Error('the vault is unavailable this run');
    }

    private queue(key: string, value: string | null): void {
        this.pending.set(key, value);
        this.schedule();
    }

    private schedule(): void {
        if (this.scheduled) return;
        this.scheduled = true;
        queueMicrotask(() => {
            this.scheduled = false;
            // A failure here already switched the medium to its fallback; `flush` is how a caller
            // that has to know hears about it.
            this.send().catch(() => undefined);
        });
    }

    private send(): Promise<void> {
        const run = this.chain.then(async () => {
            const clear = this.pendingClear;
            const writes = [...this.pending];
            this.pendingClear = false;
            this.pending.clear();
            if (!clear && writes.length === 0) return;

            if (clear && !(await this.ask(this.channel.clear()))) this.fail();
            if (writes.length === 0) return;
            const set: Record<string, string> = {};
            const remove: string[] = [];
            for (const [key, value] of writes) {
                if (value === null) remove.push(key);
                else set[key] = value;
            }
            if (!(await this.ask(this.channel.save(set, remove)))) this.fail();
        });
        // The chain itself never stays rejected, or every later send would fail with this one.
        this.chain = run.catch(() => undefined);
        return run;
    }

    private ask(answer: Promise<boolean>): Promise<boolean> {
        return this.bounded(answer).catch(() => false);
    }

    /** The channel's own timeout is the one that counts; this one only backs up a channel that has none. */
    private bounded<T>(answer: Promise<T>): Promise<T> {
        return this.timeoutMs === undefined ? answer : withTimeout(answer, this.timeoutMs);
    }

    private fail(): never {
        this.switchToFallback();
        throw new Error('the shell did not confirm the write');
    }

    private switchToFallback(): void {
        if (this.unavailable) return;
        this.unavailable = true;
        for (const key of this.values.keys()) {
            const value = this.values.get(key);
            if (value !== null) {
                this.fallback.set(key, value);
                this.fallbackKeys.add(key);
            }
        }
        this.values.clear();
        this.pending.clear();
        this.pendingClear = false;
    }
}
