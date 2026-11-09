/**
 * `store/domain-stores.ts`
 */
import type { DeviceView } from '@lemoncloud/chatic-sockets-lib';
import type { DemoChannelView, DemoChatView } from '../demo-model';
import { createMemoryStore, type Store, type StoreBacking } from './store';

export interface DeviceSnap {
    id?: string;
    tick?: number;
    status?: string;
    viewing?: string;
    view?: DeviceView;
}

export interface ChannelSnap {
    id?: string;
    updatedAt?: number;
    chatNo?: number;
    memberIds?: string[];
    view?: DemoChannelView;
}

export interface ChatSnap {
    id: string;
    lastNo: number;
    minNo: number;
    messages: DemoChatView[];
}

export const createDeviceStore = (backing?: StoreBacking<DeviceSnap>): Store<DeviceSnap> =>
    createMemoryStore<DeviceSnap>(backing);
export const createChannelStore = (backing?: StoreBacking<ChannelSnap>): Store<ChannelSnap> =>
    createMemoryStore<ChannelSnap>(backing);
export const createChatStore = (backing?: StoreBacking<ChatSnap>): Store<ChatSnap> =>
    createMemoryStore<ChatSnap>(backing);

const chatKey = (m: DemoChatView): string => `${m.id ?? m.chatNo ?? ''}`;

export const applyChatMessages = (
    store: Store<ChatSnap>,
    channelId: string,
    applied: DemoChatView[],
    lastNo: number
): void => {
    const prev = store.read(channelId);
    const byId = new Map((prev?.messages ?? []).map(m => [chatKey(m), m]));
    for (const m of applied) byId.set(chatKey(m), m);
    const messages = [...byId.values()].sort((a, b) => (a.chatNo ?? 0) - (b.chatNo ?? 0));
    const nos = messages.map(m => m.chatNo ?? 0);
    store.upsert(channelId, {
        id: channelId,
        lastNo: Math.max(lastNo, prev?.lastNo ?? 0),
        minNo: nos.length ? Math.min(...nos) : 0,
        messages,
    });
};
