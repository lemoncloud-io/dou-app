import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router-dom';

import { useRuntimeRepositories } from '@chatic/app-runtime';

import { DefaultAvatar, ImageAvatar, InfoField, ProfileAvatar, StatusBadge, Text } from '@chatic/web-ui-kit';

import { PageHeader } from '../../../ui';
import { HOME_PLACE_ID, resolvePlaceDisplayName } from '../../../utils/resolvePlaceDisplayName';
import { usePlaceOwnerProfile } from '../hooks/usePlaceOwnerProfile';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';

const OWNER_AVATAR_SIZE = 36;

/**
 * Place information — read-only. Shows the place avatar and its name; a cloud place also shows when
 * it was created and who owns it. Reached from the settings hub by everyone, owner or not; the
 * writable twin is {@link PlaceEditPage}.
 *
 * The relay only ever has the one place — its default place, DoU Home — so it is not "someone else's
 * place I was invited into" the way a cloud place can be, and product decided its screen is the owner
 * variant (Figma 3769-34207) with the created-date and owner rows removed entirely: relay's `isOwner`
 * is always absent and there is no owner to name (see the doc's 실측 table), so those rows would be
 * either wrong or empty. A cloud place keeps the general rule: `isOwner` picks the name label (a
 * missing field counts as non-owner, matching the hub), and every fact row is conditional on the
 * server having actually sent it.
 */
export const PlaceDetailPage = () => {
    const { t, i18n } = useTranslation();
    const { placeId } = useParams<{ placeId: string }>();
    const { place: placeRepo } = useRuntimeRepositories();

    const [place, setPlace] = useState<MySiteView | null>(null);

    useEffect(() => {
        if (!placeId) {
            setPlace(null);
            return;
        }
        return placeRepo.observeItem(placeId, setPlace);
    }, [placeRepo, placeId]);

    const owner = usePlaceOwnerProfile(placeId, place?.ownerId);

    const title = t('placeDetail.title');

    if (!place) {
        return (
            <div className="flex h-full flex-col bg-background pt-safe-top">
                <PageHeader title={title} />
                <div className="flex flex-1 items-center justify-center">
                    <Text className="text-muted-foreground">{t('placeDetail.notFound')}</Text>
                </div>
            </div>
        );
    }

    const isHomePlace = place.id === HOME_PLACE_ID;
    // The place in the URL decides this, NOT the active session. `resolvePlaceDisplayName` ORs its
    // `isDefaultCloud` flag with the id check, so passing the session's `selectedCloudId === 'default'`
    // would brand ANY place row viewed while the relay is active as "두유 홈" — including a cloud
    // place reached by direct URL. Feeding it the same `isHomePlace` the avatar uses keeps the name
    // and the illustration from ever disagreeing.
    const displayName = resolvePlaceDisplayName(place, { isDefaultCloud: isHomePlace }, t);
    // The relay's one place reads as owned, not invited-into — `isOwner` never arrives from relay, so
    // this is an explicit override rather than a consequence of the field being absent.
    const nameLabel = isHomePlace || place.isOwner ? 'placeDetail.nameLabel' : 'placeDetail.invitedNameLabel';
    // Zero-padded and locale-aware: ko renders Figma's "2026. 08. 07.", en renders "08/07/2026".
    // `libs/shared`'s formatDate is a date+time `toLocaleString()`, which this screen does not want.
    // Product removed this row for the relay's place regardless of whether `createdAt` is present.
    const createdAt =
        !isHomePlace && place.createdAt
            ? new Intl.DateTimeFormat(i18n.language, { year: 'numeric', month: '2-digit', day: '2-digit' }).format(
                  place.createdAt
              )
            : null;

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={title} />
            <div className="flex flex-1 flex-col gap-8 overflow-y-auto py-10">
                <div className="flex flex-col items-center px-[18px]">
                    <ProfileAvatar src={place.thumbnail || undefined} glyph={isHomePlace ? 'home' : 'place'} />
                </div>

                <div className="flex flex-col gap-6">
                    <InfoField label={t(nameLabel)}>{displayName}</InfoField>

                    {createdAt && <InfoField label={t('placeDetail.createdAtLabel')}>{createdAt}</InfoField>}

                    {/* Removed for the relay's place by product decision, not just because `ownerId` is
                        absent there — see the component doc comment. */}
                    {!isHomePlace && place.ownerId && (
                        <InfoField label={t('placeDetail.ownerLabel')}>
                            <div className="flex items-center gap-2.5 px-1 py-1.5">
                                {owner?.thumbnail ? (
                                    <ImageAvatar
                                        src={owner.thumbnail}
                                        alt={owner.nick ?? ''}
                                        size={OWNER_AVATAR_SIZE}
                                    />
                                ) : (
                                    <DefaultAvatar size={OWNER_AVATAR_SIZE} />
                                )}
                                <div className="flex min-w-0 items-center gap-1.5">
                                    <StatusBadge label={t('chat.settings.badge.owner')} variant="owner" />
                                    <Text variant="callout" className="truncate font-medium text-foreground">
                                        {owner?.nick ?? ''}
                                    </Text>
                                </div>
                            </div>
                        </InfoField>
                    )}
                </div>
            </div>
        </div>
    );
};
