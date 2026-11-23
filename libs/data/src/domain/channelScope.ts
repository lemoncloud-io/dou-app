import type { DomainChannel } from './models';

export const RELAY_CLOUD_ID = 'default';

export const ACCOUNT_CHANNEL_SID = '@account';

export const NO_PLACE_SID = '#';

export const placeOfDmId = (id: string | null | undefined): string => {
    const parts = (id ?? '').split('@');
    return parts.length === 3 && parts.every(Boolean) ? parts[0] : '';
};

export const isCloudDm = (channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined): boolean =>
    !!channel && channel.stereo === 'dm' && !!channel.cid && channel.cid !== RELAY_CLOUD_ID;

export const isRelayDm = (channel: Pick<DomainChannel, 'stereo' | 'cid'> | null | undefined): boolean =>
    !!channel && channel.stereo === 'dm' && channel.cid === RELAY_CLOUD_ID;

export const dmPlaceOf = (channel: Partial<Pick<DomainChannel, 'id' | 'sid' | '$'>> | null | undefined): string => {
    const fromId = placeOfDmId(channel?.id);
    if (fromId) return fromId;
    const sent = channel?.sid || channel?.$?.sid || '';
    return sent === NO_PLACE_SID ? '' : sent;
};

export const isInPlaceList = (channel: Pick<DomainChannel, 'sid' | 'stereo' | 'cid'>, sid: string): boolean =>
    isRelayDm(channel) || channel.sid === sid;
