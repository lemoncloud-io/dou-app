export interface RemotePayload {
    schemaVersion: number;
    ttlSec: number;
    entries: Readonly<Record<string, { value: unknown; enforced?: boolean }>>;
}

export interface IRemoteConfigAdapter {
    fetch(): Promise<RemotePayload>;
}

export const SUPPORTED_SCHEMA_VERSIONS = [1] as const;

export class RemoteCache {
    private payload: RemotePayload | null = null;
    private fetchedAt = 0;

    constructor(private readonly now: () => number = () => Date.now()) {}

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

    enforced(key: string): { has: boolean; value?: unknown } {
        if (!this.payload || this.isStale()) return { has: false };
        const entry = this.payload.entries[key];
        if (!entry?.enforced) return { has: false };
        return { has: true, value: entry.value };
    }

    remoteDefault(key: string): { has: boolean; value?: unknown } {
        if (!this.payload) return { has: false };
        const entry = this.payload.entries[key];
        if (!entry || entry.enforced) return { has: false };
        return { has: true, value: entry.value };
    }
}
