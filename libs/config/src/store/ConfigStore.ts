import type { ConfigChangeListener, Lane } from '../types';

/**
 * What each lane currently holds, plus who is watching.
 *
 * Deliberately dumb: it keeps values and a subscriber list and nothing else. Deciding whether a
 * change is worth telling anyone about needs the resolver, and the facade owns both, so the diff
 * happens there and this class just carries the notification.
 */
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

    /** Replaces a lane wholesale. Used for the shell's boot envelope. */
    replaceLane(lane: Lane, values: Readonly<Record<string, unknown>>): void {
        const map = this.laneMap(lane);
        map.clear();
        for (const [key, value] of Object.entries(values)) map.set(key, value);
    }

    /** Pass no keys to hear about everything. */
    subscribe(keys: readonly string[] | undefined, notify: ConfigChangeListener): () => void {
        const listener = { keys: keys && keys.length > 0 ? new Set(keys) : null, notify };
        this.listeners.add(listener);
        return () => {
            this.listeners.delete(listener);
        };
    }

    /**
     * Tells only the listeners that asked about at least one of these keys.
     *
     * Each listener is handed the keys IT asked about, not the whole change set — a watcher of one
     * key learning that some other key moved would have to filter the noise back out, and an
     * observer that logs what changed (`attachConfigStateLog`) would report keys nobody asked it
     * about. A listener that passed no keys asked about everything, so it gets everything.
     */
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
