import { useTranslation } from 'react-i18next';

import { Button, DefaultAvatar, ImageAvatar, ListRow, StatusBadge } from '@chatic/web-ui-kit';

interface PlaceMemberRowProps {
    name: string;
    avatar?: string;
    isOwner: boolean;
    isMe: boolean;
    /** When set, the row carries a Remove button that calls it. */
    onRemove?: () => void;
    /** A removal of this member is in flight — the button stays, disabled. */
    isRemoving?: boolean;
}

const AVATAR_SIZE = 40;

/**
 * One member of a place. Built from the same parts as the room's member rows — `ListRow`, the
 * avatar pair and `StatusBadge` before the name — with a Remove button in the trailing slot, which
 * the room's row does not have. One badge at most, owner before me, as there.
 */
export const PlaceMemberRow = ({ name, avatar, isOwner, isMe, onRemove, isRemoving = false }: PlaceMemberRowProps) => {
    const { t } = useTranslation();

    const badge = isOwner
        ? { variant: 'owner' as const, label: t('chat.settings.badge.owner') }
        : isMe
          ? { variant: 'mine' as const, label: t('placeMembers.badge.me') }
          : null;

    return (
        <ListRow
            leading={
                avatar ? (
                    <ImageAvatar src={avatar} alt={name} size={AVATAR_SIZE} />
                ) : (
                    <DefaultAvatar size={AVATAR_SIZE} />
                )
            }
            title={
                <>
                    {badge && <StatusBadge variant={badge.variant} label={badge.label} />}
                    <span className="truncate">{name}</span>
                </>
            }
            trailing={
                onRemove ? (
                    <Button variant="outline" tone="gray" size="sm" onClick={onRemove} disabled={isRemoving}>
                        {t('placeMembers.remove')}
                    </Button>
                ) : undefined
            }
        />
    );
};
