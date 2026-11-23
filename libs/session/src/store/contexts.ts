import { cloudStore } from './stores';
import { getActiveSessionUser, getRelaySessionUser, patchRelaySessionUser } from './contextStore';
import type { ActiveServerContext, CloudSessionSnapshot, GlobalSessionContext, IdentityContext } from './types';
import { sessionContextStore } from './contextStore';
import type { SocketSlotContext } from './contextStore';

export const getIdentityContext = (): IdentityContext => sessionContextStore.getIdentityContext();

export const getCloudSessionSnapshot = (): CloudSessionSnapshot | null => sessionContextStore.getCloudSessionSnapshot();

export const getActiveServerContext = (): ActiveServerContext =>
    sessionContextStore.getGlobalSessionContext().activeServer;

export const getGlobalSessionContext = (): GlobalSessionContext => sessionContextStore.getGlobalSessionContext();

export const getSocketSlotContext = (): SocketSlotContext => sessionContextStore.getSocketSlotContext();

export { getActiveSessionUser };

export { getRelaySessionUser, patchRelaySessionUser };

export const getCommittedCloudId = (): string | null => cloudStore.getDelegationToken()?.cloudId ?? null;

export const getCommittedSessionSiteId = (): string | null =>
    getCommittedCloudId() ? (cloudStore.getCloudToken()?.$site?.id ?? null) : null;
