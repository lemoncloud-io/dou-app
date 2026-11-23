import { MemoryStore } from '../memoryStore';
import { withTimeout } from './withTimeout.util';

import type { KeyValueStore } from '../types';
import type { NativeStore, NativeReadResult, NativeSecureStoreOptions, NativeStorageChannel } from './types';

const UNANSWERED: NativeReadResult = { status: 'unavailable', reason: 'error', values: {} };

export class NativeSecureStore implements NativeStore {
    private readonly channel: NativeStorageChannel;
    private readonly fallback: KeyValueStore;
    private readonly timeoutMs: number | undefined;

    private readonly values = new MemoryStore();
    private unavailable = false;
    private readonly fallbackKeys = new Set<string>();

    private readonly pending = new Map<string, string | null>();
    private pendingClear = false;
    private scheduled = false;
    private chain: Promise<void> = Promise.resolve();

    constructor({ channel, fallback, timeoutMs }: NativeSecureStoreOptions) {
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
        if (this.unavailable) throw new Error('the vault is unavailable this run');
    }

    offer(key: string, value: string): Promise<boolean> {
        const isFree = () =>
            !this.unavailable && !this.pendingClear && !this.pending.has(key) && this.values.get(key) === null;
        const run = this.chain.then(async () => {
            if (!isFree()) return false;
            if (!(await this.ask(this.channel.save({ [key]: value }, [])))) return false;
            if (isFree()) this.values.set(key, value);
            return true;
        });
        this.chain = run.then(
            () => undefined,
            () => undefined
        );
        return run.catch(() => false);
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
        this.chain = run.catch(() => undefined);
        return run;
    }

    private ask(answer: Promise<boolean>): Promise<boolean> {
        return this.bounded(answer).catch(() => false);
    }

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
