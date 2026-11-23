import type {
    ActiveServerView,
    IdentityView,
    SessionContextView,
    SessionSnapshot,
    SessionUserView,
} from '@chatic/runtime-core';

import { runtimeEngine } from '../init';

export const subscribeSession = (listener: () => void): (() => void) => runtimeEngine().session.subscribe(listener);

export const readSession = (): SessionSnapshot => runtimeEngine().session.snapshot();

export const getGlobalSessionContext = (): SessionContextView => readSession().context;

export const getActiveServerContext = (): ActiveServerView => readSession().context.activeServer;

export const getIdentityContext = (): IdentityView => readSession().context.identity;

export const getActiveSessionUser = (): SessionUserView | null => readSession().activeUser;

export const getRelaySessionUser = (): SessionUserView | null => readSession().relayUser;

export const getCommittedSessionSiteId = (): string | null => readSession().committedSiteId;

export const getUidInCloud = (cloudId: string): string | null => readSession().uidByCloud[cloudId] ?? null;

export const isPairedSession = (): boolean => readSession().pairing.isPairedSession;

export const isInOwnCloudSession = (): boolean => readSession().pairing.isInOwnCloudSession;
