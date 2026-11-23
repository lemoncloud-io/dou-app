export type SessionSignalKind = 'relay:token' | 'cloud:token' | 'selection' | 'identity';

export const ALL_SESSION_SIGNALS: readonly SessionSignalKind[] = [
    'relay:token',
    'cloud:token',
    'selection',
    'identity',
];

export interface ISessionSignal {
    emit(kind: SessionSignalKind): void;
    subscribe(kinds: readonly SessionSignalKind[], listener: () => void): () => void;
    batch<T>(fn: () => T): T;
    registerInvalidator(fn: () => void): void;
}

type Entry = { kinds: ReadonlySet<SessionSignalKind>; listener: () => void };

class SessionSignal implements ISessionSignal {
    private depth = 0;
    private readonly pending = new Set<SessionSignalKind>();
    private readonly entries = new Set<Entry>();
    private readonly invalidators = new Set<() => void>();

    emit(kind: SessionSignalKind): void {
        for (const invalidate of this.invalidators) invalidate();

        this.pending.add(kind);
        if (this.depth === 0) this.flush();
    }

    subscribe(kinds: readonly SessionSignalKind[], listener: () => void): () => void {
        const entry: Entry = { kinds: new Set(kinds), listener };
        this.entries.add(entry);
        return () => {
            this.entries.delete(entry);
        };
    }

    batch<T>(fn: () => T): T {
        this.depth += 1;
        try {
            return fn();
        } finally {
            this.depth -= 1;
            if (this.depth === 0) this.flush();
        }
    }

    registerInvalidator(fn: () => void): void {
        this.invalidators.add(fn);
    }

    private flush(): void {
        if (this.pending.size === 0) return;
        const moved = new Set(this.pending);
        this.pending.clear();
        for (const entry of [...this.entries]) {
            for (const kind of moved) {
                if (entry.kinds.has(kind)) {
                    entry.listener();
                    break;
                }
            }
        }
    }
}

export const sessionSignal: ISessionSignal = new SessionSignal();

export const subscribeSessionSignal = (listener: () => void): (() => void) =>
    sessionSignal.subscribe(ALL_SESSION_SIGNALS, listener);
