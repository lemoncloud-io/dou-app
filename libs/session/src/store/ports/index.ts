import { ForwardingPort } from './forwardingPort';
import { RawSlot } from './rawSlot';
import { PAIRED_CLOUDS_KEY } from './sessionKeys';
import { SessionMedia } from './sessionMedia';

import type { StorageLike } from '../jsonSlot';
import type { IRawSlot, ISessionMedia } from './types';

export { isSessionKey, PAIRED_CLOUDS_KEY, SECRET_LOGOUT_PENDING_KEY, SESSION_KEYS } from './sessionKeys';
export type { SessionKey } from './sessionKeys';
export type { IRawSlot, ISessionMedia, PortName, SessionStoragePorts, StoragePortPair } from './types';

/** The session's one record of which medium backs each port. */
export const sessionMedia: ISessionMedia = new SessionMedia();

export const secretPort: StorageLike = new ForwardingPort(sessionMedia, 'secret');
export const plainPort: StorageLike = new ForwardingPort(sessionMedia, 'plain');

/** The paired-cloud list's one key, for `@chatic/auth`'s `PairedCloudStore` — not the whole plain port. */
export const pairedCloudsSlot: IRawSlot = new RawSlot(plainPort, PAIRED_CLOUDS_KEY);
