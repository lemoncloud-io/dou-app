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
 * Place information — read-only. Shows the place avatar, its name, when it was created and who owns
 * it (Figma 3769-34116 / 3692-10303). Reached from the settings hub by everyone, owner or not; the
 * writable twin is {@link PlaceEditPage}.
 *
 * Two axes shape it, and they decide different things (ADR-0047):
 * - `isOwner` picks the name label — a non-owner was invited into the place, so it reads "초대된
 *   플레이스 이름". A missing field counts as non-owner, matching the hub.
 * - relay vs cloud picks the placeholder avatar. The relay default place (DoU Home) stands for the
 *   service, so it shows the DoU character.
 *
 * Every fact row is conditional because the server does not send every field everywhere: the relay
 * default place is a `stereo: 'domain'` system site with no owner at all. A row with nothing behind
 * it is left out rather than filled with a placeholder — see the doc's 실측 table.
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
    // Zero-padded and locale-aware: ko renders Figma's "2026. 08. 07.", en renders "08/07/2026".
    // `libs/shared`'s formatDate is a date+time `toLocaleString()`, which this screen does not want.
    const createdAt = place.createdAt
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
                    <InfoField label={t(place.isOwner ? 'placeDetail.nameLabel' : 'placeDetail.invitedNameLabel')}>
                        {displayName}
                    </InfoField>

                    {createdAt && <InfoField label={t('placeDetail.createdAtLabel')}>{createdAt}</InfoField>}

                    {/* No `ownerId` means no owner to name — the relay default place has none. */}
                    {place.ownerId && (
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
