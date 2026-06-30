import type { DeviceBody, DevicePlatform, DeviceSeed, DeviceView } from '@lemoncloud/chatic-sockets-lib';

export interface DeviceDraft {
    id: string;
    name: string;
    platform: DevicePlatform;
    status: string;
    posX: string;
    posY: string;
}

export type DemoChannelStereo = '' | 'dm' | 'self' | 'public' | 'private';

export interface DemoChannelDraft {
    stereo: DemoChannelStereo;
    name: string;
    channelId: string;
    message: string;
    feedLimit: string;
}

export interface DemoChannelView {
    id?: string;
    name?: string;
    stereo?: DemoChannelStereo;
    desc?: string;
    ownerId?: string;
    chatNo?: number;
    memberIds?: string[];
}

export type DemoChannelMemberEventReason = 'join' | 'leave' | 'kick';

export interface DemoChannelMemberEventView {
    channelId?: string;
    memberId?: string;
    actorDeviceId?: string;
    reason?: DemoChannelMemberEventReason;
    channel?: DemoChannelView;
    member$?: DeviceView;
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

export interface DemoJoinView {
    id?: string;
    channelId?: string;
    ownerId?: string;
    chatNo?: number;
    joined?: boolean;
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

export interface DemoPanelDescriptor {
    id: string;
    title: string;
    seed: DemoConnectionDraft;
    device: DeviceDraft;
}

/**
 * 앱 레벨 device 레지스트리 엔트리.
 * - 목록(id/name/연결여부)은 앱이 집계하지만, status/viewing 값은 roster가 read()로 서버에서 받아 표시한다.
 * - read는 해당 패널의 runtime을 통해 device.read({ id })로 서버 왕복한다.
 */
export interface DeviceRegistryEntry {
    panelId: string;
    deviceId: string;
    name: string;
    connected: boolean;
    read(): Promise<DeviceView | undefined>;
}

export interface DemoLogEntry {
    id: string;
    level: 'info' | 'warn' | 'error';
    label: string;
    detail?: string;
    at: string;
}

/** 기본 WS URL — 명시 쿼리(?wsUrl/?ws)가 있으면 그것, 없으면 배포 env(VITE_WS_ENDPOINT). local mock 없음. */
export const buildDefaultWsUrl = (options: { search?: string } = {}): string => {
    const params = new URLSearchParams(options.search ?? '');
    const explicit = params.get('wsUrl') || params.get('ws');
    if (explicit) return explicit;

    const ws = `${import.meta.env.VITE_WS_ENDPOINT ?? ''}`.trim();
    return ws ? `${ws}?v2` : '';
};

export const createDefaultConnectionDraft = (search?: string): DemoConnectionDraft => ({
    wsUrl: buildDefaultWsUrl({ search }),
    syncIntervalMs: '2000',
    keepAliveIntervalMs: '10000',
    reconnectMinDelayMs: '500',
    reconnectMaxDelayMs: '10000',
    rotationLifetimeMinutes: '110',
    rotationRefreshMinutes: '10',
    trackedDeviceId: '',
});

export const createDefaultDeviceDraft = (): DeviceDraft => ({
    id: '',
    name: 'browser-device',
    platform: 'web',
    status: 'green',
    posX: '',
    posY: '',
});

export const createDefaultChannelDraft = (): DemoChannelDraft => ({
    stereo: 'public',
    name: 'demo-room',
    channelId: '',
    message: 'hello from demo',
    feedLimit: '10',
});

export const createShortDeviceId = (): string => Math.random().toString(36).slice(2, 8);

export const detectDevicePlatform = (): DevicePlatform => {
    const ua = `${globalThis.navigator?.userAgent ?? ''}`.toLowerCase();
    if (!ua) return 'web';
    if (ua.includes('iphone') || ua.includes('ipad')) return 'ios';
    if (ua.includes('android')) return 'android';
    if (ua.includes('mac os x') || ua.includes('macintosh')) return 'macos';
    if (ua.includes('windows')) return 'windows';
    if (ua.includes('linux')) return 'linux';
    return 'web';
};

export const createAutoDeviceDraft = (): DeviceDraft => {
    const id = createShortDeviceId();
    const platform = detectDevicePlatform();
    return {
        id,
        name: `device-${id}`,
        platform,
        status: 'green',
        posX: '',
        posY: '',
    };
};

export const createDemoPanelId = (): string =>
    `panel-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

export const createDemoPanel = (index: number, seed: DemoConnectionDraft): DemoPanelDescriptor => ({
    id: createDemoPanelId(),
    title: `Client ${index}`,
    seed: { ...seed },
    device: createAutoDeviceDraft(),
});

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

export const formatSyncTargetKey = (id?: string): string => `device:${`${id ?? ''}`.trim() || 'current'}`;

export const formatDeviceSummary = (view?: DeviceView | null): string => {
    if (!view) return 'not loaded';
    const id = `${view.id ?? '-'}`;
    const tick = typeof view.tick === 'number' ? `${view.tick}` : '-';
    const status = `${view.status ?? '-'}`;
    const point =
        typeof view.posX === 'number' || typeof view.posY === 'number'
            ? `${view.posX ?? '-'}, ${view.posY ?? '-'}`
            : '-';
    return `id=${id} tick=${tick} status=${status} pos=${point}`;
};

/** viewing 값을 자연어로: channel이면 "📺 #channel:<id> 보는 중", 비우면 "유휴" */
export const formatViewing = (view?: DeviceView | null): string => {
    if (!view) return '유휴';
    const type = `${view.viewingType ?? ''}`.trim();
    const id = `${view.viewingId ?? ''}`.trim();
    if (!type || !id) return '유휴';
    return `📺 #${type}:${id} 보는 중`;
};

/** epoch(ms) 기준 상대시간: "방금", "12초 전", "3분 전", "2시간 전" */
export const formatRelativeTime = (at?: number, now: number = Date.now()): string => {
    if (typeof at !== 'number' || !Number.isFinite(at) || at <= 0) return '-';
    const deltaSec = Math.max(0, Math.round((now - at) / 1000));
    if (deltaSec < 3) return '방금';
    if (deltaSec < 60) return `${deltaSec}초 전`;
    const deltaMin = Math.round(deltaSec / 60);
    if (deltaMin < 60) return `${deltaMin}분 전`;
    const deltaHour = Math.round(deltaMin / 60);
    if (deltaHour < 24) return `${deltaHour}시간 전`;
    return `${Math.round(deltaHour / 24)}일 전`;
};

export const formatChannelSummary = (view?: DemoChannelView | null): string => {
    if (!view) return 'not loaded';
    const id = `${view.id ?? '-'}`;
    const stereo = `${view.stereo ?? '-'}`;
    const chatNo = typeof view.chatNo === 'number' ? `${view.chatNo}` : '-';
    const memberCount = Array.isArray(view.memberIds) ? `${view.memberIds.length}` : '-';
    const name = `${view.name ?? '-'}`;
    return `id=${id} stereo=${stereo} chatNo=${chatNo} members=${memberCount} name=${name}`;
};

export const formatChannelMemberEvent = (view?: DemoChannelMemberEventView | null): string => {
    if (!view) return 'not loaded';
    const reason = `${view.reason ?? '-'}`;
    const member = `${view.memberId ?? view.member$?.id ?? '-'}`;
    const actor = `${view.actorDeviceId ?? '-'}`;
    const channel = `${view.channelId ?? view.channel?.id ?? '-'}`;
    return `${reason} member=${member} actor=${actor} channel=${channel}`;
};

export const formatChatSummary = (view?: DemoChatView | null): string => {
    if (!view) return 'not loaded';
    const chatNo = typeof view.chatNo === 'number' ? `#${view.chatNo}` : '#-';
    const owner = `${view.ownerId ?? '-'}`;
    const content = `${view.content ?? ''}`.trim() || '-';
    return `${chatNo} ${owner}: ${content}`;
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
