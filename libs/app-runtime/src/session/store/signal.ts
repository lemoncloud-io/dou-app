/**
 * The session change signal (ADR-0074 결정 2).
 *
 * It used to be one payload-less broadcast — `notifySessionStateChanged()` from 24 call sites, and
 * every subscriber re-deriving everything because "something changed" is all they were told. One
 * cloud switch fired it **eight times**, so seven inconsistent intermediate states were observable
 * (selected cloud moved but tokens had not; tokens landed but identity had not re-derived …). The
 * store knew: `rebuildSessionIdentity` grew a hand-rolled equality gate to suppress no-op fan-outs.
 *
 * Two things fix that, and this module owns both:
 *
 *  1. **The signal has a kind**, so a subscriber can say which slices it cares about.
 *  2. **A use-case can be a batch**, so one logical operation is one fan-out.
 *
 * The vocabulary is the one this file already used ("session signal" — `subscribeSessionSignal`), not
 * a new one: no `*Bus`, and deliberately not `transact` (`transaction` already means a DB
 * transaction and an IAP purchase in this repo). `batch`/`flush` is what the log pipeline calls this.
 */

/**
 * Which slice of the session moved. A string union keyed like the package's other ones
 * (`SocketKind` · `CredentialOwner`).
 *
 * `relay:token` and `cloud:token` are separate because the two refresh loops are: a relay refresh
 * arriving while a cloud session is active must not re-derive cloud-scoped consumers.
 */
export type SessionSignalKind = 'relay:token' | 'cloud:token' | 'selection' | 'identity';

/** Every kind — what a subscriber that wants the old all-or-nothing behavior asks for. */
export const ALL_SESSION_SIGNALS: readonly SessionSignalKind[] = [
    'relay:token',
    'cloud:token',
    'selection',
    'identity',
];

export interface ISessionSignal {
    /** Announces that `kind` moved. Inside a {@link ISessionSignal.batch} the fan-out is deferred. */
    emit(kind: SessionSignalKind): void;
    /** Fires `listener` when any of `kinds` moves. Returns the unsubscribe. */
    subscribe(kinds: readonly SessionSignalKind[], listener: () => void): () => void;
    /**
     * Runs `fn` as ONE observable change: emits inside it are collected and fan out once, after it
     * returns. Nestable — only the outermost batch flushes.
     */
    batch<T>(fn: () => T): T;
    /**
     * Registers a cache dropper. Unlike listeners these run EAGERLY on every emit, batch or not —
     * see the class doc for why.
     */
    registerInvalidator(fn: () => void): void;
}

type Entry = { kinds: ReadonlySet<SessionSignalKind>; listener: () => void };

/**
 * **Invalidators are eager, listeners are deferred.** The two do different jobs and a batch must
 * treat them differently:
 *
 * - An invalidator drops the derived-context cache. Code INSIDE the batch reads that cache —
 *   `getCloudSessionSnapshot` does, since ADR-0074 배치 A12 routed it through the cache for same-tick
 *   consistency — so deferring invalidation would make `switchCloudSession` return a snapshot of the
 *   cloud it just left. Internal consistency cannot wait for the flush.
 * - A listener is external fan-out (a React re-render, a binding rebuild). That is exactly what the
 *   batch exists to collapse.
 */
class SessionSignal implements ISessionSignal {
    private depth = 0;
    private readonly pending = new Set<SessionSignalKind>();
    private readonly entries = new Set<Entry>();
    private readonly invalidators = new Set<() => void>();

    emit(kind: SessionSignalKind): void {
        // Eager, always — see the class doc.
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
            // Only the outermost batch flushes; a throw still flushes what already landed, because
            // those writes DID happen and hiding them would leave observers on stale state.
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
        // Snapshot the entries: a listener may subscribe or unsubscribe while reacting.
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

/**
 * Subscribes to EVERY kind — the pre-ADR-0074 behavior, kept so `useGlobalSession` ·
 * `useSessionAuth` · `useSessionIdentity` do not change. A consumer that only needs some slices
 * should call `sessionSignal.subscribe([...])` instead.
 */
export const subscribeSessionSignal = (listener: () => void): (() => void) =>
    sessionSignal.subscribe(ALL_SESSION_SIGNALS, listener);

/** @deprecated Use `sessionSignal.registerInvalidator`. Kept while call sites move. */
export const registerSessionCacheInvalidator = (fn: () => void): void => sessionSignal.registerInvalidator(fn);

/**
 * @deprecated Emit the specific {@link SessionSignalKind} instead — this fans out to every
 * subscriber whatever moved, which is the fan-out ADR-0074 결정 2 is removing. Kept while the 24
 * call sites move over, so this commit adds the bus without changing any behavior.
 */
export const notifySessionStateChanged = (): void => {
    // Batched on purpose: emitting the four kinds one by one would flush four times and make the
    // fan-out WORSE than the single broadcast this replaces. One batch = one flush = today's behavior.
    sessionSignal.batch(() => {
        for (const kind of ALL_SESSION_SIGNALS) sessionSignal.emit(kind);
    });
};
