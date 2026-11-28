import type { CacheType } from './domain';

export type CacheBasePayload<K extends CacheType> = {
    type: K;
    cid: string;
    uid: string;
};
