import { runtime, RELAY_CLOUD_ID } from '@chatic/runtime';

export const toCloudId = (cid: string | null | undefined): string => cid || RELAY_CLOUD_ID;

export const useSelectedCloudId = (): string => toCloudId(runtime.session.useSessionSelection().selectedCloudId);

export const readSelectedCloudId = (): string => toCloudId(runtime.session.getGlobalSessionContext().cloud.cloudId);
