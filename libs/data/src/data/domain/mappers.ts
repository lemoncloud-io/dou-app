import type { CloudView } from '@lemoncloud/chatic-backend-api';
import type { ChannelView, ChatView, JoinView, SiteView, UserView } from '@lemoncloud/chatic-socials-api';
import type { CacheStorageItem } from '../local/storages';
import type {
    DomainChannel,
    DomainChat,
    DomainInviteCloud,
    DomainJoin,
    DomainScope,
    DomainSite,
    DomainUser,
} from './models';

const toEpochMs = (value: unknown): number => {
    if (typeof value === 'number' && Number.isFinite(value)) return value;
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = new Date(value).getTime();
        return Number.isFinite(parsed) ? parsed : 0;
    }
    return 0;
};

const toStringSafe = (value: unknown): string => {
    return typeof value === 'string' ? value : '';
};

const toNumberSafe = (value: unknown, fallback = 0): number => {
    return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
};

const toBooleanSafe = (value: unknown, fallback = false): boolean => {
    return typeof value === 'boolean' ? value : fallback;
};

export const toDomainChannel = (
    source: ChannelView | CacheStorageItem<'channel'> | Partial<DomainChannel>,
    scope: DomainScope
): DomainChannel => {
    const sidFromModel = toStringSafe((source as { sid?: string }).sid);
    const sidFromNested = toStringSafe((source as { $?: { sid?: string } }).$?.sid);
    const updatedAtMs = toEpochMs((source as { updatedAt?: string | number }).updatedAt);
    const lastChatAtMs = toEpochMs((source as { lastChat$?: { createdAt?: string | number } }).lastChat$?.createdAt);

    return {
        ...(source as ChannelView),
        id: toStringSafe((source as { id?: string }).id),
        cid: toStringSafe((source as { cid?: string }).cid) || scope.cid,
        sid: sidFromModel || sidFromNested || scope.sid || '',
        isNotificationEnabled: toBooleanSafe(
            (source as { isNotificationEnabled?: boolean }).isNotificationEnabled,
            true
        ),
        lastActivityAt: Math.max(lastChatAtMs, updatedAtMs),
    };
};

export const toDomainChat = (
    source: ChatView | CacheStorageItem<'chat'> | Partial<DomainChat>,
    scope: DomainScope
): DomainChat => {
    const createdAtMs = toEpochMs((source as { createdAt?: string | number }).createdAt);
    const updatedAtMs = toEpochMs((source as { updatedAt?: string | number }).updatedAt);

    return {
        ...(source as ChatView),
        id: toStringSafe((source as { id?: string }).id),
        cid: toStringSafe((source as { cid?: string }).cid) || scope.cid,
        channelId: toStringSafe((source as { channelId?: string }).channelId),
        chatNo: toNumberSafe((source as { chatNo?: number }).chatNo, 0),
        isPending: toBooleanSafe((source as { isPending?: boolean }).isPending, false),
        isFailed: toBooleanSafe((source as { isFailed?: boolean }).isFailed, false),
        createdAtMs,
        updatedAtMs,
    };
};

export const toDomainJoin = (
    source: JoinView | CacheStorageItem<'join'> | Partial<DomainJoin>,
    scope: DomainScope
): DomainJoin => {
    return {
        ...(source as JoinView),
        id: toStringSafe((source as { id?: string }).id),
        cid: toStringSafe((source as { cid?: string }).cid) || scope.cid,
        channelId: toStringSafe((source as { channelId?: string }).channelId),
        userId: toStringSafe((source as { userId?: string }).userId),
        joined: toNumberSafe((source as { joined?: number }).joined, 1),
        readNo: toNumberSafe((source as { readNo?: number }).readNo, 0),
    };
};

export const toDomainUser = (
    source: UserView | CacheStorageItem<'user'> | Partial<DomainUser>,
    scope: DomainScope
): DomainUser => {
    const channelId = toStringSafe((source as { channelId?: string }).channelId);
    const joinedChannelId = toStringSafe((source as { $join?: { channelId?: string } }).$join?.channelId);
    const channelIds = [channelId, joinedChannelId].filter(Boolean);

    return {
        ...(source as UserView),
        id: toStringSafe((source as { id?: string }).id),
        cid: toStringSafe((source as { cid?: string }).cid) || scope.cid,
        channelIds: Array.from(new Set(channelIds)),
    };
};

export const toDomainSite = (
    source: SiteView | CacheStorageItem<'site'> | Partial<DomainSite>,
    scope: DomainScope
): DomainSite => {
    const rawType = (source as { type?: unknown }).type;
    const normalizedType = rawType === 'site' || rawType === 'user' ? rawType : undefined;

    return {
        ...(source as SiteView),
        id: toStringSafe((source as { id?: string }).id),
        cid: toStringSafe((source as { cid?: string }).cid) || scope.cid,
        order: toNumberSafe((source as { order?: number }).order, Number.MAX_SAFE_INTEGER),
        type: normalizedType,
        stereo: (source as { stereo?: string }).stereo === '' ? '' : undefined,
    };
};

export const toDomainInviteCloud = (
    source: CloudView | CacheStorageItem<'invitecloud'> | Partial<DomainInviteCloud>,
    scope: DomainScope
): DomainInviteCloud => {
    return {
        ...(source as CloudView),
        id: toStringSafe((source as { id?: string }).id),
        cid: toStringSafe((source as { cid?: string }).cid) || scope.cid,
        name: toStringSafe((source as { name?: string }).name) || undefined,
        backend: toStringSafe((source as { backend?: string }).backend) || undefined,
        wss: toStringSafe((source as { wss?: string }).wss) || undefined,
    };
};
