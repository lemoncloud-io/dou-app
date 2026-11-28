import type { CacheType } from './domain';

export type BaseQueryOptions = {
    cid?: string;
    uid?: string;
};

export type ChannelQueryOptions = BaseQueryOptions & {
    sid?: string;
    keyword?: string;
};

export type ChatQueryOptions = BaseQueryOptions & {
    channelId?: string;
    sort?: 'asc' | 'desc';
    keyword?: string;
    limit?: number;
    cursorNo?: number;
    includeUnsent?: boolean;
};

export type InviteCloudQueryOptions = BaseQueryOptions;

export type JoinQueryOptions = BaseQueryOptions & {
    channelId?: string;
    userId?: string;
};

export type UserQueryOptions = BaseQueryOptions;

export type SiteQueryOptions = BaseQueryOptions & {
    keyword?: string;
};

export type ProfileQueryOptions = BaseQueryOptions & {
    sid?: string;
};

export type MetaQueryOptions = BaseQueryOptions;

export type InviteQueryOptions = BaseQueryOptions;

export type CacheQueryMap = {
    channel: ChannelQueryOptions;
    chat: ChatQueryOptions;
    user: UserQueryOptions;
    site: SiteQueryOptions;
    join: JoinQueryOptions;
    invitecloud: InviteCloudQueryOptions;
    profile: ProfileQueryOptions;
    meta: MetaQueryOptions;
    invite: InviteQueryOptions;
};

export type CacheQueryOf<TType extends CacheType> = CacheQueryMap[TType];
