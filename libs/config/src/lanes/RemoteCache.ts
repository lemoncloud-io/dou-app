/**
 * Last-known-good remote payload, and the two rows that read it.
 *
 * **This ships empty on purpose.** Rows 1 and 4 are registered in the precedence table from day
 * one with nothing behind them. A lane added later would change what every key resolves to, and
 * that change would happen quietly on devices already in people's hands — so the rows exist now
 * and simply supply nothing until an adapter arrives. When one does, neither the policy nor the
 * resolver changes by a line (ADR-0079 결정 10).
 */
export interface RemotePayload {
    /** Outside the range this client understands, the whole payload is ignored. */
    schemaVersion: number;
    /** How long this response stays usable. */
    ttlSec: number;
    entries: Readonly<Record<string, { value: unknown; enforced?: boolean }>>;
}

export interface IRemoteConfigAdapter {
    fetch(): Promise<RemotePayload>;
}

/** The schema versions this build can read. A payload outside the range is dropped whole. */
export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;

export class RemoteCache {
    private payload: RemotePayload | null = null;
    private fetchedAt = 0;

    constructor(private readonly now: () => number = () => Date.now()) {}

    /** Replaces the cache. A payload this build does not understand is ignored entirely. */
    accept(payload: RemotePayload): boolean {
        if (!SUPPORTED_SCHEMA_VERSIONS.includes(payload.schemaVersion as 1)) return false;
        this.payload = payload;
        this.fetchedAt = this.now();
        return true;
    }

    clear(): void {
        this.payload = null;
        this.fetchedAt = 0;
    }

    private isStale(): boolean {
        if (!this.payload) return true;
        return this.now() - this.fetchedAt > this.payload.ttlSec * 1000;
    }

    /**
     * A killed value, if one is in force.
     *
     * **Dropped once stale.** This is what heals a bad kill and what keeps a device that cannot
     * reach the server from staying locked forever: when the server stops sending the kill, it
     * lapses on its own.
     */
    enforced(key: string): { has: boolean; value?: unknown } {
        if (!this.payload || this.isStale()) return { has: false };
        const entry = this.payload.entries[key];
        if (!entry?.enforced) return { has: false };
        return { has: true, value: entry.value };
    }

    /**
     * A remote default, if one was sent.
     *
     * **Kept when stale**, unlike an enforced value. This is only default tuning, and an old
     * default beats no default.
     */
    remoteDefault(key: string): { has: boolean; value?: unknown } {
        if (!this.payload) return { has: false };
        const entry = this.payload.entries[key];
        if (!entry || entry.enforced) return { has: false };
        return { has: true, value: entry.value };
    }
}
