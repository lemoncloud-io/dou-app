import { useTranslation } from 'react-i18next';

import { usePlaceSync } from '@chatic/app-runtime';
import type { DomainPlace } from '@chatic/data';

import { CloudAvatar, ImageAvatar, ListRow, VerifiedBadge, douLogo } from '@chatic/web-ui-kit';

interface PlaceItemProps {
    place: DomainPlace;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectPlace: (placeId: string) => void;
    unreadCount?: number;
    /** Place-type caption below the name (기본/내/초대받은 플레이스). */
    subtitle: string;
    /**
     * True on the relay/default cloud. The relay always shows the user's single personal place,
     * whose backend name is "default"/"#default" (id "0000"); we brand it as "DoU Home" with the
     * DoU mascot instead of surfacing that raw name. (The legacy `place.id === 'default'` never
     * matches real relay places, so the cloud context is the reliable signal.)
     */
    isHomePlace?: boolean;
}

export const PlaceItem = ({
    place,
    isSelected,
    isDisabled,
    onSelectPlace,
    unreadCount,
    subtitle,
    isHomePlace,
}: PlaceItemProps) => {
    const { t } = useTranslation();
    // Register this place as a sync target while it is rendered; the runtime keeps its
    // metadata (name, thumbnail, …) live and unregisters on unmount.
    usePlaceSync(place.id);

    const displayName = isHomePlace ? t('placeList.defaultPlace') : place.name;
    const hasUnread = !!unreadCount && unreadCount > 0;

    // Avatar: the DoU brand mascot for the home (relay) place, a photo when set, otherwise a
    // name-initials avatar (matches the Figma place rows). The mascot is an irregular cloud shape
    // on a transparent background, so we render it with object-contain (no circular crop) at 46px.
    const leading = isHomePlace ? (
        <span className="flex h-[46px] w-[46px] shrink-0 items-center justify-center overflow-hidden rounded-full bg-[#90c304]">
            <img src={douLogo} alt={displayName ?? ''} className="h-8 w-8" />
        </span>
    ) : place.thumbnail ? (
        <ImageAvatar src={place.thumbnail} alt={displayName ?? ''} size={46} />
    ) : (
        <CloudAvatar name={displayName ?? ''} size="lg" />
    );

    // Selected place shows the blue verified check; an unselected place with unread shows a red dot.
    const trailingMark = isSelected ? (
        <VerifiedBadge size={18} label={t('placeList.selected', '선택됨')} />
    ) : hasUnread ? (
        <span
            className="size-1.5 shrink-0 rounded-full bg-red-500"
            aria-label={t('placeList.hasUnread', '읽지 않음')}
        />
    ) : null;

    return (
        <ListRow
            leading={leading}
            title={
                <>
                    <span className="truncate">{displayName}</span>
                    {trailingMark}
                </>
            }
            subtitle={subtitle}
            onClick={() => onSelectPlace(place.id)}
            // Re-selecting the active place is a no-op in useSwitchPlace, so we don't disable the
            // selected row — disabling would dim it (ListRow's disabled:opacity-50), but the selected
            // place should stay prominent. Only a switch-in-progress disables the rows.
            disabled={isDisabled}
        />
    );
};
