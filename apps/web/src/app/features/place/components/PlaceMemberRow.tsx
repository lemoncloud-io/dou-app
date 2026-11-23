import { useTranslation } from 'react-i18next';

import { Button, DefaultAvatar, ImageAvatar, ListRow, StatusBadge } from '@chatic/web-ui-kit';

interface PlaceMemberRowProps {
    name: string;
    avatar?: string;
    isOwner: boolean;
    isMe: boolean;
    onRemove?: () => void;
    isRemoving?: boolean;
}

const AVATAR_SIZE = 40;

export const PlaceMemberRow = ({ name, avatar, isOwner, isMe, onRemove, isRemoving = false }: PlaceMemberRowProps) => {
    const { t } = useTranslation();

    const badge = isOwner
        ? { variant: 'owner' as const, label: t('placeMembers.badge.owner') }
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
