import { useTranslation } from 'react-i18next';

import { usePlaceSync } from '@chatic/app-runtime';
import type { DomainPlace } from '@chatic/data';

import { ImageAvatar, ListRow, PlaceAvatar, VerifiedBadge } from '@chatic/web-ui-kit';

import { resolvePlaceDisplayName } from '../../../utils';

interface PlaceItemProps {
    place: DomainPlace;
    isSelected: boolean;
    isDisabled: boolean;
    onSelectPlace: (placeId: string) => void;
    unreadCount?: number;
    /** Place-type caption below the name (내/초대받은 플레이스). */
    subtitle: string;
}

/**
 * One row of the cloud-mode Place section. There is no relay variant: relay hides the whole section
 * (ADR-0034), so the former "DoU Home" branding of the single relay place is gone.
 */
export const PlaceItem = ({ place, isSelected, isDisabled, onSelectPlace, unreadCount, subtitle }: PlaceItemProps) => {
    const { t } = useTranslation();
    // Register this place as a sync target while it is rendered; the runtime keeps its
    // metadata (name, thumbnail, …) live and unregisters on unmount.
    usePlaceSync(place.id);

    // Shared with useActivePlaceName so the row and the profile dialog titles can't drift.
    // Relay never renders this row any more (ADR-0034), so the default-cloud context is always
    // false; the resolver still recognises HOME_PLACE_ID on its own.
    const displayName = resolvePlaceDisplayName(place, { isDefaultCloud: false }, t);
    const hasUnread = !!unreadCount && unreadCount > 0;

    // Avatar: the place photo when set, otherwise a name-initials avatar.
    const leading = place.thumbnail ? (
        <ImageAvatar src={place.thumbnail} alt={displayName ?? ''} size={46} />
    ) : (
        <PlaceAvatar name={displayName ?? ''} size="lg" />
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
