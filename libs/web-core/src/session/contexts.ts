import { cloudCore } from './core';
import { getActiveSessionUser, getRelaySessionUser, rebuildSessionIdentity } from './contextStore';
import type {
    ActiveServerContext,
    CloudContext,
    CloudSessionSnapshot,
    GlobalSessionContext,
    IdentityContext,
    RelayContext,
} from './types';
import { sessionContextStore } from './contextStore';

export const getRelaySessionContext = (): RelayContext => sessionContextStore.getRelayContext();

export const getCloudSessionContext = (): CloudContext => sessionContextStore.getCloudContext();

export const getIdentityContext = (): IdentityContext => sessionContextStore.getIdentityContext();
export const getSessionIdentityContext = getIdentityContext;

export const getCloudSessionSnapshot = (): CloudSessionSnapshot | null => sessionContextStore.getCloudSessionSnapshot();

export const getActiveServerContext = (): ActiveServerContext =>
    sessionContextStore.getGlobalSessionContext().activeServer;

export const getGlobalSessionContext = (): GlobalSessionContext => sessionContextStore.getGlobalSessionContext();

export const getActiveServerIdentityToken = (): string | null =>
    sessionContextStore.getGlobalSessionContext().activeServer.identityToken;

// The active session token's user fields — the synchronous seed for useProfileFacts.
export { getActiveSessionUser };
// The relay token's user fields regardless of the active server — the relay-pinned display seed.
export { getRelaySessionUser };

export const clearCloudSession = (): void => {
    cloudCore.clearSession();
    rebuildSessionIdentity();
};
