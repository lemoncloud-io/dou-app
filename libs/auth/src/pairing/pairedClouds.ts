import { pairedCloudNamesSlot, pairedCloudsSlot, type IRawSlot } from '@chatic/session';

type Listener = (ids: readonly string[]) => void;
type NamesListener = (names: Readonly<Record<string, string>>) => void;

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

    names(): Record<string, string> {
        const ids = this.read();
        const names = this.readNames();
        return Object.fromEntries(Object.entries(names).filter(([id]) => ids.includes(id)));
    }

    setName(cloudId: string, name: string): void {
        if (!name || !this.has(cloudId)) return;
        const names = this.readNames();
        if (names[cloudId] === name) return;
        this.writeNames({ ...names, [cloudId]: name });
    }

    readonly subscribe = (listener: Listener): (() => void) => {
        this.listeners.add(listener);
        return () => this.listeners.delete(listener);
    };

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
