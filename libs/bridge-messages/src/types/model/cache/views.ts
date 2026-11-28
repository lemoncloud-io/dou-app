import type {
    ChannelView,
    ChatView,
    JoinView,
    ProfileDisplay,
    ProfileView,
    UploadView,
    UserView,
} from '@lemoncloud/chatic-socials-api';
import type { CloudView, MyInviteView, MySiteView } from '@lemoncloud/chatic-backend-api';
import type { CacheType, CacheViewBase } from './domain';
import type { ChatMediaEntry } from './media-entry';

export type CacheModelMap = {
    channel: CacheChannelView;
    chat: CacheChatView;
    invitecloud: CacheCloudView;
    join: CacheJoinView;
    site: CacheSiteView;
    user: CacheUserView;
    profile: CacheProfileView;
    meta: CacheMetaView;
    invite: CacheInviteView;
};

export type CacheModelOf<TType extends CacheType> = CacheModelMap[TType];

export type CacheCloudView = CloudView &
    CacheViewBase & {
        id: string;
        name?: string;
        backend?: string;
        wss?: string;
        cid: string;
        cloudType?: 'invited' | 'owner';
        acceptedBy?: string[];
    };

export type CacheChannelView = ChannelView &
    CacheViewBase & {
        id: string;
        cid: string;
        sid: string;
        isNotificationEnabled: boolean;
        lastActivityAt?: number;
    };

export type PendingUploadSlot = {
    localStatus: 'sending' | 'failed';
    localThumbUrl: string;
    localName?: string;
    localContentType?: string;
    localSize?: number;
};

export type CacheChatView = Omit<ChatView, 'upload$$'> &
    CacheViewBase & {
        upload$$?: (UploadView | PendingUploadSlot)[];
        id: string;
        cid: string;
        channelId: string;
        chatNo: number;
        isPending: boolean;
        isFailed: boolean;
        createdAtMs: number;
        updatedAtMs: number;
        tempId?: string;
        hiddenByFeed?: boolean;
        mediaEntries?: ChatMediaEntry[];
        mediaEntriesVersion?: number;
    };

export type CacheSiteView = MySiteView &
    CacheViewBase & {
        id: string;
        cid: string;
        order: number;
    };

export type CacheJoinView = JoinView &
    CacheViewBase & {
        id: string;
        cid: string;
        channelId: string;
        userId: string;
        joined: number;
        readNo: number;
        metaNo?: number;
    };

export type CacheUserView = UserView &
    CacheViewBase & {
        id: string;
        cid: string;
    };

export type CacheMetaView = CacheViewBase & {
    id: string;
    cid: string;
    uid: string;
    syncedAt?: number;
    routing?: string;
};

export type CacheInviteView = Omit<MyInviteView, 'code' | 'deeplink'> &
    CacheViewBase & {
        id: string;
        cid: string;
        uid: string;
        dismissedAt?: number;
    };

export type CacheProfileView = ProfileView &
    Partial<ProfileDisplay> &
    CacheViewBase & {
        id: string;
        cid: string;
        sid: string;
        uid: string;
        userId: string;
        updatedAtMs: number;
    };
