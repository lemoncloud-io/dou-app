import { logger } from '@chatic/bridges';
import type { DomainPlace } from '@chatic/data';

import { classifyWireError, extractErrorMessage } from '../../../shared';

/** The longest place name the form accepts, the same cap the mobile app applies. */
export const PLACE_NAME_MAX = 20;

/** The largest photo the form takes, checked before the file is read at all. */
export const PLACE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

/** How many places one cloud holds, the same cap the mobile app applies before it asks the server. */
export const PLACE_MAX = 10;

/**
 * Whether the cloud is at its place cap. A relay subscription row (`stereo: 'place'`) arrives in
 * the same list without being a place anyone made, so it does not count.
 */
export const isAtPlaceLimit = (places: readonly Pick<DomainPlace, 'stereo'>[]): boolean =>
    places.filter(place => place.stereo !== 'place').length >= PLACE_MAX;

/**
 * Why a new place was not made, as far as the person can act on it:
 * - `denied`: this account may not make places here. Trying again changes nothing.
 * - `network`: the server was not reached. Trying again is the answer.
 * - `other`: anything else, which may pass on a second try.
 */
export type CreatePlaceFailure = 'denied' | 'network' | 'other';

export const createPlaceFailure = (error: unknown): CreatePlaceFailure => {
    const raw = extractErrorMessage(error);
    // The wire text belongs in the log, not in the dialog.
    logger.error('PLACE', '[CreatePlace] failed', { error, raw });
    switch (classifyWireError(raw)) {
        case 'denied':
            return 'denied';
        case 'network':
            return 'network';
        default:
            return 'other';
    }
};
