import { RELAY_CLOUD_ID } from './channelScope';

export const RELAY_ORIGIN_CID = '#';

export const pushCloudIdOf = (cid: unknown): string | undefined => {
    if (typeof cid !== 'string' || cid === '') return undefined;
    return cid === RELAY_ORIGIN_CID ? RELAY_CLOUD_ID : cid;
};
