import { ForwardingPort } from './forwardingPort';
import { RawSlot } from './rawSlot';
import { PAIRED_CLOUD_NAMES_KEY, PAIRED_CLOUDS_KEY } from './sessionKeys';
import { SessionStores } from './sessionStores';

import type { StorageLike } from '../jsonSlot';
import type { IRawSlot, ISessionStores } from './types';

export {
    isSessionKey,
    PAIRED_CLOUD_NAMES_KEY,
    PAIRED_CLOUDS_KEY,
    SECRET_LOGOUT_PENDING_KEY,
    SESSION_KEYS,
} from './sessionKeys';
export type { SessionKey } from './sessionKeys';
export type { IRawSlot, ISessionStores, PortName, SessionStoragePorts, StoragePortPair } from './types';

/** The session's one record of which store backs each port. */
export const sessionStores: ISessionStores = new SessionStores();

export const secretPort: StorageLike = new ForwardingPort(sessionStores, 'secret');
export const plainPort: StorageLike = new ForwardingPort(sessionStores, 'plain');

/** The paired-cloud list's one key, for `@chatic/auth`'s `PairedCloudStore` — not the whole plain port. */
export const pairedCloudsSlot: IRawSlot = new RawSlot(plainPort, PAIRED_CLOUDS_KEY);

/** The paired clouds' names, the same store's second key. */
export const pairedCloudNamesSlot: IRawSlot = new RawSlot(plainPort, PAIRED_CLOUD_NAMES_KEY);
