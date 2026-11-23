import type { TFunction } from 'i18next';

import type { DomainPlace } from '@chatic/runtime';

export const HOME_PLACE_ID = '0000';

export type PlaceNameSource = Partial<Pick<DomainPlace, 'id' | 'name'>>;

export interface PlaceDisplayNameContext {
    isDefaultCloud: boolean;
}

export const resolvePlaceDisplayName = (
    place: PlaceNameSource | null | undefined,
    ctx: PlaceDisplayNameContext,
    t: TFunction
): string => {
    if (ctx.isDefaultCloud || place?.id === HOME_PLACE_ID) return t('placeList.defaultPlace');
    return place?.name ?? '';
};
