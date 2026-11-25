import { logger } from '@chatic/bridges';
import type { DomainPlace } from '@chatic/runtime-react';

import { classifyWireError, extractErrorMessage } from '../../../shared';

export const PLACE_NAME_MAX = 20;

export const PLACE_DESC_MAX = 100;

export const PLACE_IMAGE_MAX_BYTES = 10 * 1024 * 1024;

export const PLACE_MAX = 10;

export const isAtPlaceLimit = (places: readonly Pick<DomainPlace, 'stereo'>[]): boolean =>
    places.filter(isManagedPlace).length >= PLACE_MAX;

export const isManagedPlace = (place: Pick<DomainPlace, 'stereo'>): boolean => place.stereo !== 'place';

export type PlaceFailure = 'denied' | 'network' | 'other';

export const placeFailure = (error: unknown, action: 'CreatePlace' | 'EditPlace' | 'DeletePlace'): PlaceFailure => {
    const raw = extractErrorMessage(error);
    logger.error('PLACE', `[${action}] failed`, { error, raw });
    switch (classifyWireError(raw)) {
        case 'denied':
            return 'denied';
        case 'network':
            return 'network';
        default:
            return 'other';
    }
};
