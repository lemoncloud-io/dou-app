import { cloudCore } from '../core';
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

export const clearCloudSession = (): void => {
    cloudCore.clearSession();
};
