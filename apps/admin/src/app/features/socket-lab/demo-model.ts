import type { DeviceBody, DevicePlatform, DeviceSeed } from '@lemoncloud/chatic-sockets-lib';

export interface DeviceDraft {
    id: string;
    name: string;
    platform: DevicePlatform;
    status: string;
    posX: string;
    posY: string;
}

export type DemoChannelStereo = '' | 'dm' | 'self' | 'public' | 'private';

export interface DemoChannelView {
    id?: string;
    name?: string;
    stereo?: DemoChannelStereo;
    desc?: string;
    ownerId?: string;
    chatNo?: number;
    memberIds?: string[];
}

export interface DemoChatView {
    id?: string;
    stereo?: string;
    chatNo?: number;
    content?: string;
    contentType?: string;
    channelId?: string;
    ownerId?: string;
}

export interface DemoConnectionDraft {
    wsUrl: string;
    syncIntervalMs: string;
    keepAliveIntervalMs: string;
    reconnectMinDelayMs: string;
    reconnectMaxDelayMs: string;
    rotationLifetimeMinutes: string;
    rotationRefreshMinutes: string;
    trackedDeviceId: string;
}

export interface DemoLogEntry {
    id: string;
    level: 'info' | 'warn' | 'error';
    label: string;
    detail?: string;
    at: string;
}

export const createShortDeviceId = (): string => Math.random().toString(36).slice(2, 8);

const parseNumber = (value?: string): number | undefined => {
    const text = `${value ?? ''}`.trim();
    if (!text) return undefined;
    const parsed = Number(text);
    return Number.isFinite(parsed) ? parsed : undefined;
};

export const toDeviceBody = (draft: DeviceDraft): DeviceBody => {
    const body: DeviceBody = {};
    const id = `${draft.id ?? ''}`.trim();
    const name = `${draft.name ?? ''}`.trim();
    const status = `${draft.status ?? ''}`.trim();
    const posX = parseNumber(draft.posX);
    const posY = parseNumber(draft.posY);

    if (id) body.id = id;
    if (name) body.name = name;
    if (draft.platform) body.platform = draft.platform;
    if (status) body.status = status as DeviceBody['status'];
    if (posX !== undefined) body.posX = posX;
    if (posY !== undefined) body.posY = posY;
    return body;
};

export const toDeviceSeed = (draft: DeviceDraft): DeviceSeed => toDeviceBody(draft) as DeviceSeed;

export const toPositiveInt = (value: string, fallback: number): number => {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
    return Math.round(parsed);
};

export const pushLogEntry = (
    logs: DemoLogEntry[],
    level: DemoLogEntry['level'],
    label: string,
    detail?: string
): DemoLogEntry[] => {
    const entry: DemoLogEntry = {
        id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
        level,
        label,
        detail,
        at: new Date().toISOString(),
    };
    return [entry, ...logs].slice(0, 80);
};
