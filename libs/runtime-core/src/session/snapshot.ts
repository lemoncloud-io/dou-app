/**
 * The session as a screen reads it, without a single token.
 *
 * It is what the React surface's session readers return — `useGlobalSession`, `useSessionAuth`,
 * `getUidInCloud` and the rest — and, on the phone, what the shell's runtime hands a page that mirrors
 * it. So it holds only plain JSON: an error is its message, and no field carries a credential. The
 * stores keep the tokens; a page that does not own the session never sees them.
 */

/** The relay half of the session. */
export interface RelaySessionView {
    backend: string | null;
    wss: string | null;
    siteId: string | null;
    isAuthenticated: boolean;
}

/** The cloud half of the session — the cloud the selection is on. */
export interface CloudSessionView {
    /** The selected cloud, which flips before a switch commits. */
    cloudId: string | null;
    siteId: string | null;
    backend: string | null;
    wss: string | null;
    /** A cloud other than the relay is selected and its session is ready to serve. */
    isActive: boolean;
}

/** Whether the session is up, and whose it is. */
export interface IdentityView {
    isInitialized: boolean;
    isAuthenticated: boolean;
    /** The message of the error the session's boot ended in, if it did. */
    error: string | null;
    /** The uid of the active token — the committed cloud's, or the relay's. */
    userId: string | null;
    delegatorId: string | null;
}

/** The server the session talks to now: the relay, or the active cloud. */
export type ActiveServerView =
    | { kind: 'relay'; backend: string; wss: string; siteId: string | null }
    | { kind: 'cloud'; cloudId: string; siteId: string | null; backend: string; wss: string };

/** The session's context: both halves, the identity, and which server is active. */
export interface SessionContextView {
    relay: RelaySessionView;
    cloud: CloudSessionView;
    identity: IdentityView;
    activeServer: ActiveServerView;
}

/** The session's readiness, as a guard reads it. */
export interface SessionAuthView {
    isInitialized: boolean;
    isAuthenticated: boolean;
    error: string | null;
}

/** A token's user fields, without the token. */
export type SessionUserView = Record<string, unknown>;

/** The clouds a guest browser entered through device pairing. */
export interface PairingView {
    /** This session is a secondary device's: issued by a pairing, or a relay guest with paired clouds. */
    isPairedSession: boolean;
    /** The committed cloud is one of the account's own — not the relay, not a paired cloud. */
    isInOwnCloudSession: boolean;
    cloudIds: string[];
    cloudNames: Record<string, string>;
}

/** Everything a screen reads of the session, in one value. */
export interface SessionSnapshot {
    context: SessionContextView;
    auth: SessionAuthView;
    /** The active token's user fields — the synchronous seed of the profile. */
    activeUser: SessionUserView | null;
    /** The relay token's user fields — the account's own profile, whichever cloud is active. */
    relayUser: SessionUserView | null;
    /** The place the session is really on; the selection can be ahead of it during a switch. */
    committedSiteId: string | null;
    /** The uid this account has in each cloud it has one in. A cloud missing has none. */
    uidByCloud: Record<string, string>;
    pairing: PairingView;
}

/**
 * The session as the React surface reads it.
 *
 * `snapshot()` returns the same object until the session changes, and each part of it the same object
 * until that part changes — `useSyncExternalStore` compares by identity, and a reader of one part
 * must not re-render for a change in another. `subscribe` hears every change; the listener reads the
 * snapshot again.
 */
export interface SessionView {
    snapshot(): SessionSnapshot;
    subscribe(listener: () => void): () => void;
}
