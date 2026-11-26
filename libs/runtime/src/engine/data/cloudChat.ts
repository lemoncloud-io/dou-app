import { RELAY_CLOUD_ID } from '@chatic/data';
import type { ChatSendPayload, DataRepositories, DomainChat } from '@chatic/data';

import { backgroundClouds, getSocketManager, slotKeyOf } from '@chatic/transport';
import { getDataManager } from './runtime';

const cloudOf = (cid: string | null | undefined): string => cid || RELAY_CLOUD_ID;

export const getCloudRepositories = (cid: string): DataRepositories =>
    getDataManager().getScopedRepositories(cloudOf(cid));

export const holdCloud = (cid: string): (() => void) => backgroundClouds.hold(cloudOf(cid));

export const runInCloud = async <T>(cid: string, work: (repositories: DataRepositories) => Promise<T>): Promise<T> => {
    const release = holdCloud(cid);
    try {
        return await work(getCloudRepositories(cid));
    } finally {
        release();
    }
};

export const CLOUD_SOCKET_WAIT_MS = 10_000;

export const waitForCloudSocket = (cid: string, timeoutMs: number = CLOUD_SOCKET_WAIT_MS): Promise<boolean> =>
    getSocketManager().waitUntilSlotVerified(slotKeyOf(cloudOf(cid)), timeoutMs);

export const sendChatInCloud = (cid: string, payload: ChatSendPayload): Promise<DomainChat> =>
    runInCloud(cid, repositories => repositories.chat.sendChat(payload));
