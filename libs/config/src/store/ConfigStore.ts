import type { ConfigChangeListener, Lane } from '../types';

export class ConfigStore {
    private readonly lanes = new Map<Lane, Map<string, unknown>>();
    private readonly listeners = new Set<{ keys: ReadonlySet<string> | null; notify: ConfigChangeListener }>();

    private laneMap(lane: Lane): Map<string, unknown> {
        const existing = this.lanes.get(lane);
        if (existing) return existing;
        const created = new Map<string, unknown>();
        this.lanes.set(lane, created);
        return created;
    }

    read(lane: Lane, key: string): { has: boolean; value?: unknown } {
        const map = this.lanes.get(lane);
        if (!map || !map.has(key)) return { has: false };
        return { has: true, value: map.get(key) };
    }

    write(lane: Lane, key: string, value: unknown): void {
        this.laneMap(lane).set(key, value);
    }

    clear(lane: Lane, key: string): void {
        this.lanes.get(lane)?.delete(key);
    }

    replaceLane(lane: Lane, values: Readonly<Record<string, unknown>>): void {
        const map = this.laneMap(lane);
        map.clear();
        for (const [key, value] of Object.entries(values)) map.set(key, value);
    }

    subscribe(keys: readonly string[] | undefined, notify: ConfigChangeListener): () => void {
        const listener = { keys: keys && keys.length > 0 ? new Set(keys) : null, notify };
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    notify(changedKeys: readonly string[]): void {
        if (changedKeys.length === 0) return;
        for (const listener of [...this.listeners]) {
            if (!listener.keys) {
                listener.notify(changedKeys);
                continue;
            }
            const asked = changedKeys.filter(key => listener.keys?.has(key));
            if (asked.length > 0) listener.notify(asked);
        }
    }
}
