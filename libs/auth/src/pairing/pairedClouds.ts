import { pairedCloudNamesSlot, pairedCloudsSlot, type IRawSlot } from '@chatic/session';

type Listener = (ids: readonly string[]) => void;
type NamesListener = (names: Readonly<Record<string, string>>) => void;

/**
 * The clouds this guest session entered through a pairing — kept in one key of the session's plain
 * port (per tab in a browser, the device's `localStorage` inside a shell), so it lives and dies with
 * the session it belongs to. The session hands over that key alone, not the port.
 *
 * A guest's own cloud catalog (`clouds?view=mine`) is empty, so without this list a cloud approved for
 * this browser would never show in the cloud switch sheet. It is also what the periodic re-check walks
 * (a paired cloud is renewed by delegation only, so that a revoked approval ends it within minutes),
 * and a guest holding one counts as a secondary device.
 *
 * The stored list of paired clouds. A plain store with nothing but its storage behind it, so
 * `isPairedSession`, the relay logout and the hooks can read and clear it without pulling the socket
 * runtime in — the lifecycle that acts on it is `PairedCloudSessions`.
 *
 * It also keeps each paired cloud's name, in a second key. The approval names only the cloud's id, and
 * a paired cloud is neither owned nor invited, so it has no row in the cloud cache to carry a name —
 * a row there would be listed as one of the two. The name lives and dies with the cloud's place in
 * the list: removing a cloud or clearing the list drops its name too, and a name is only kept for a
 * cloud that is on the list.
 */
export class PairedCloudStore {
    private readonly listeners = new Set<Listener>();
    private readonly namesListeners = new Set<NamesListener>();

    constructor(
        private readonly slot: IRawSlot,
        private readonly namesSlot: IRawSlot
    ) {}

    list(): string[] {
        return this.read();
    }

    has(cloudId: string): boolean {
        return this.read().includes(cloudId);
    }

    add(cloudId: string): void {
        const ids = this.read();
        if (!ids.includes(cloudId)) this.write([...ids, cloudId]);
    }

    remove(cloudId: string): void {
        const ids = this.read();
        if (ids.includes(cloudId)) this.write(ids.filter(id => id !== cloudId));
        const names = this.readNames();
        if (cloudId in names) {
            delete names[cloudId];
            this.writeNames(names);
        }
    }

    clear(): void {
        if (this.read().length) this.write([]);
        if (Object.keys(this.readNames()).length) this.writeNames({});
    }

    /** The names read for the clouds still on the list, by cloud id. */
    names(): Record<string, string> {
        const ids = this.read();
        const names = this.readNames();
        return Object.fromEntries(Object.entries(names).filter(([id]) => ids.includes(id)));
    }

    /** Records a paired cloud's name. Ignored for a cloud not on the list, an empty name, or no change. */
    setName(cloudId: string, name: string): void {
        if (!name || !this.has(cloudId)) return;
        const names = this.readNames();
        if (names[cloudId] === name) return;
        this.writeNames({ ...names, [cloudId]: name });
    }

    /**
     * Hears every change to the list; returns the unsubscribe. A bound field rather than a method:
     * `useSyncExternalStore(pairedClouds.subscribe, …)` hands it over detached from the store.
     */
    readonly subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

    /**
     * Hears every change that can move `names()` — a name written, or the list changed under it; returns
     * the unsubscribe. Bound for the same reason as `subscribe`.
     */
    readonly subscribeNames = (listener: NamesListener): (() => void) => {
        this.namesListeners.add(listener);
        return () => this.namesListeners.delete(listener);
    };

    private read(): string[] {
        try {
            const parsed: unknown = JSON.parse(this.slot.read() ?? '[]');
            return Array.isArray(parsed) ? parsed.filter((id): id is string => typeof id === 'string' && !!id) : [];
        } catch {
            return [];
        }
    }

    private write(ids: string[]): void {
        if (ids.length) this.slot.write(JSON.stringify(ids));
        else this.slot.clear();
        this.listeners.forEach(listener => listener(ids));
        // `names()` is filtered by the list, so a list change can change it too.
        const names = this.names();
        this.namesListeners.forEach(listener => listener(names));
    }

    private readNames(): Record<string, string> {
        try {
            const parsed: unknown = JSON.parse(this.namesSlot.read() ?? '{}');
            if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
            return Object.fromEntries(
                Object.entries(parsed).filter(
                    (entry): entry is [string, string] => typeof entry[1] === 'string' && !!entry[1]
                )
            );
        } catch {
            return {};
        }
    }

    private writeNames(names: Record<string, string>): void {
        if (Object.keys(names).length) this.namesSlot.write(JSON.stringify(names));
        else this.namesSlot.clear();
        this.namesListeners.forEach(listener => listener(names));
    }
}

export const pairedClouds = new PairedCloudStore(pairedCloudsSlot, pairedCloudNamesSlot);
