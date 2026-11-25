import { placeOfDmId } from '@chatic/runtime-react';

export const openPlaceFor = (
    target: { placeId: string; channelId: string; placeBound?: boolean },
    here: { placeId: string | null | undefined; filedPlaces: ReadonlyMap<string, readonly string[]> }
): string => {
    const listing = here.filedPlaces.get(target.channelId);
    if (!target.placeBound) return listing?.[0] || placeOfDmId(target.channelId) || target.placeId;
    if (!listing?.length) return target.placeId;
    if (target.placeId && listing.includes(target.placeId)) return target.placeId;
    if (here.placeId && listing.includes(here.placeId)) return here.placeId;
    return listing[0];
};
