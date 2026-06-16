import type { CacheStorageItem } from '../storages';
import type { DomainChannel, DomainChat, DomainJoin, DomainProfile, DomainSite, DomainUser } from '../../domain';
import {
    toDomainChannel as toDomainChannelBase,
    toDomainChat as toDomainChatBase,
    toDomainJoin as toDomainJoinBase,
    toDomainProfile as toDomainProfileBase,
    toDomainSite as toDomainSiteBase,
    toDomainUser as toDomainUserBase,
} from '../../domain';

const resolveScope = (cid?: string): { cid: string } => ({ cid: cid || 'default' });

export const toDomainChannel = (channel: CacheStorageItem<'channel'>): DomainChannel =>
    toDomainChannelBase(channel, resolveScope(channel.cid));

export const toDomainChat = (chat: CacheStorageItem<'chat'>): DomainChat =>
    toDomainChatBase(chat, resolveScope(chat.cid));

export const toDomainJoin = (join: CacheStorageItem<'join'>): DomainJoin =>
    toDomainJoinBase(join, resolveScope(join.cid));

export const toDomainUser = (user: CacheStorageItem<'user'>): DomainUser =>
    toDomainUserBase(user, resolveScope(user.cid));

export const toDomainSite = (site: CacheStorageItem<'site'>): DomainSite =>
    toDomainSiteBase(site, resolveScope(site.cid));

export const toDomainProfile = (profile: CacheStorageItem<'profile'>): DomainProfile =>
    toDomainProfileBase(profile, resolveScope(profile.cid));
