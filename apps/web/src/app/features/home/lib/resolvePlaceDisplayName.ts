import type { TFunction } from 'i18next';

import type { DomainPlace } from '@chatic/data';

/**
 * Site id of the relay's personal place. Its backend name is "default"/"#default", which is an
 * internal value we never show — see {@link resolvePlaceDisplayName}.
 */
export const HOME_PLACE_ID = '0000';

/** The fields the display-name rule needs; a full {@link DomainPlace} satisfies it. */
export type PlaceNameSource = Pick<DomainPlace, 'id' | 'name'>;

export interface PlaceDisplayNameContext {
    /** True on the relay/default cloud (`selectedCloudId === 'default'`). */
    isDefaultCloud: boolean;
}

/**
 * Display name for a place. The relay always shows the user's single personal place, whose backend
 * name is "default"/"#default" (id `0000`); we brand it as "두유 홈"/"DoU Home" instead of leaking
 * that raw name into the UI.
 *
 * The home place is recognized by the cloud context OR the site id. The cloud context is the primary
 * signal — five hooks already derive `isDefaultCloud` from `selectedCloudId`, and the legacy
 * `place.id === 'default'` never matches a real relay place. `HOME_PLACE_ID` rides along because
 * `0000` is the actual sid at runtime, so a caller holding only the place row still gets it right.
 *
 * Kept as a pure function (not a hook) so a list row holding a place object and a hook holding only
 * a sid resolve through the same rule instead of drifting apart.
 */
export const resolvePlaceDisplayName = (
    place: PlaceNameSource | null | undefined,
    ctx: PlaceDisplayNameContext,
    t: TFunction
): string => {
    if (ctx.isDefaultCloud || place?.id === HOME_PLACE_ID) return t('placeList.defaultPlace');
    return place?.name ?? '';
};
