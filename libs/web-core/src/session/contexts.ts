import { cloudCore } from './core';
import {
    getActiveSessionUser,
    getRelaySessionUser,
    patchRelaySessionUser,
    rebuildSessionIdentity,
} from './contextStore';
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

// The RELAY token's user fields, and the patch that writes them back — the account-level profile
// source, which must not follow the active slot into a cloud. See contextStore for why the local
// cache cannot serve this.
export { getRelaySessionUser, patchRelaySessionUser };

export const clearCloudSession = (): void => {
    cloudCore.clearSession();
    rebuildSessionIdentity();
};
