import type {
    ActiveServerView,
    IdentityView,
    SessionContextView,
    SessionSnapshot,
    SessionUserView,
} from '@chatic/runtime-core';

import { runtimeEngine } from '../init';

// The session as the app reads it, through the engine it was handed — never the stores directly. On
// the phone the stores may live in another process, and the engine is what knows where; in a page that
// owns the session the core engine reads this process's stores. Either way the answer has no token.

/** Hears every change to the session; the listener reads again. */
export const subscribeSession = (listener: () => void): (() => void) => runtimeEngine().session.subscribe(listener);

/** The session now: the same object until it changes. */
export const readSession = (): SessionSnapshot => runtimeEngine().session.snapshot();

/** Both halves of the session, the identity, and the active server. */
export const getGlobalSessionContext = (): SessionContextView => readSession().context;

/** The server the session talks to now. */
export const getActiveServerContext = (): ActiveServerView => readSession().context.activeServer;

/** Whether the session is up, and whose it is. */
export const getIdentityContext = (): IdentityView => readSession().context.identity;

/** The active token's user fields — the synchronous seed of the profile. */
export const getActiveSessionUser = (): SessionUserView | null => readSession().activeUser;

/** The relay token's user fields — the account's own profile, whichever cloud is active. */
export const getRelaySessionUser = (): SessionUserView | null => readSession().relayUser;

/** The place the session is really on, which the selection can disagree with during a switch. */
export const getCommittedSessionSiteId = (): string | null => readSession().committedSiteId;

/**
 * The uid this account has in `cloudId`. Every cloud gives it a different one, and the identity only
 * answers for the committed cloud, so a write or a sync target addressed to another cloud names its
 * uid with this.
 */
export const getUidInCloud = (cloudId: string): string | null => readSession().uidByCloud[cloudId] ?? null;

/** This session is a secondary device's: issued by a pairing, or a relay guest with paired clouds. */
export const isPairedSession = (): boolean => readSession().pairing.isPairedSession;

/** The committed cloud is one of the account's own — not the relay, not a paired cloud. */
export const isInOwnCloudSession = (): boolean => readSession().pairing.isInOwnCloudSession;
