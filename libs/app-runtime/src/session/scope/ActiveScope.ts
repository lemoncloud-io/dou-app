import type { DataContext, DataContextProvider } from '@chatic/data';

/** The socket observation this scope needs — a `Pick` so scope never depends on the socket layer. */
export interface BoundCidSource {
    getBoundCid(): string | null;
}

/**
 * The single owner of "which cloud/site/user are we operating as" (ADR-0070 결정 7).
 *
 * Before this, the answer was assembled from four pieces: `useRuntimeBinding` derived the intent,
 * `DataContextHolder` stored it, an anonymous `socketAwareProvider` inside `DataManager` spliced in
 * the socket's bound cid per call, and six inline conditionals judged the result. The judgements
 * moved to `@chatic/data`'s `scopeGuards`; this class takes the other three.
 *
 * **It unifies the OWNER, not the values.** There are three named views and they are supposed to
 * disagree — that disagreement IS optimistic switching:
 *
 *  - `intent`    — the SELECTED cloud. Flips first, before any token exchange, so cid-scoped cache
 *                  observers re-subscribe to the target immediately.
 *  - `bound`     — what the live socket is actually attached to. An OBSERVED value from the SDK;
 *                  this class never sets it.
 *  - `committed` — the cloud whose tokens are really in the store. Frozen through the optimistic
 *                  window, because the delegation token is only replaced on a successful exchange.
 *
 * Collapsing them re-introduces the cross-cloud cache poisoning this design exists to prevent.
 */
export class ActiveScope implements DataContextProvider {
    constructor(
        /**
         * Reads the intent straight from `session/store` (see `./intent`). No holder, no push: the
         * scope is always as current as the store, which is what removes the render-lag that made
         * descendant observers register under a stale cid during a cloud switch.
         */
        private readonly readIntent: () => DataContext,
        private readonly socket: BoundCidSource,
        private readonly committedCloudId: () => string | null
    ) {}

    /** SELECTED cloud/site/user — flips optimistically at the start of a switch. */
    public get intent(): DataContext {
        return this.readIntent();
    }

    /** The live socket's bound cloud. Observed, never assigned here. */
    public get bound(): { cid: string | null } {
        return { cid: this.socket.getBoundCid() };
    }

    /** The cloud whose tokens are committed to the store. Frozen through the optimistic window. */
    public get committed(): { cid: string | null } {
        return { cid: this.committedCloudId() };
    }

    /**
     * `DataContextProvider` — intent plus the socket's bound cid as `socketCid`, which is what the
     * scope guards compare. Composed per call (not cached) so a socket rebind takes effect on the
     * very next repository read; `socketCid` is omitted rather than set to null when nothing is
     * bound, because `isForeignContext` treats an absent `socketCid` as "no one to disagree with".
     */
    public getContext(): DataContext {
        const base = this.intent;
        const socketCid = this.socket.getBoundCid();
        return socketCid != null ? { ...base, socketCid } : base;
    }

    /**
     * No-op. `DataContextProvider` still declares it, and `DataManager.ensure` still accepts a
     * context for call-site compatibility, but the scope is derived rather than assigned now —
     * honoring a pushed value would reintroduce the stale-holder path this class replaced.
     */
    public setContext(): void {
        // intentionally empty — see the class doc.
    }
}
