/**
 * `store/domain-stores.ts`
 * - device/channel/chat 도메인별 store. 공통 `Store<T>` 위에 도메인 스냅샷 타입만 다르게.
 * - 스냅샷 스키마는 도메인별로 상이 — 단일 스키마 강제하지 않는다.
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

/** ChatSyncPlan.onApply 용: 채널 메시지 윈도우에 applied 병합(중복 제거 + chatNo 정렬) */
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
