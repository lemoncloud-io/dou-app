import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/ui-kit';
import { DefaultAvatar, ImageAvatar, ListRow, StatusBadge } from '@chatic/web-ui-kit';

interface Member {
    id: string;
    name: string;
    avatar?: string | null;
}

interface MemberListItemProps {
    member: Member;
    isMe?: boolean;
    isOwner?: boolean;
    isPendingInvite?: boolean;
    needsProfileSetup?: boolean;
    hasLeft?: boolean;
    onClick?: () => void;
}

const AVATAR_SIZE = 40;

export const MemberListItem = ({
    member,
    isMe = false,
    isOwner = false,
    isPendingInvite = false,
    needsProfileSetup = false,
    hasLeft = false,
    onClick,
}: MemberListItemProps) => {
    const { t } = useTranslation();

    const badge = isMe
        ? { variant: 'mine' as const, label: t('chat.settings.badge.mine') }
        : isPendingInvite
          ? { variant: 'pending' as const, label: t('chat.settings.badge.pending') }
          : isOwner
            ? { variant: 'owner' as const, label: t('chat.settings.badge.owner') }
            : null;

    const isDimmed = isPendingInvite || hasLeft;

    const avatar = member.avatar ? (
        <ImageAvatar src={member.avatar} alt={member.name} size={AVATAR_SIZE} />
    ) : (
        <DefaultAvatar size={AVATAR_SIZE} className={isDimmed ? 'opacity-50' : undefined} />
    );

    return (
        <ListRow
            leading={avatar}
            onClick={onClick}
            title={
                <>
                    {badge && <StatusBadge variant={badge.variant} label={badge.label} />}
                    <span
                        className={cn(
                            'truncate',
                            isPendingInvite && 'text-muted-foreground',
                            needsProfileSetup && 'underline'
                        )}
                    >
                        {member.name}
                    </span>
                </>
            }
            subtitle={hasLeft ? t('chat.settings.leftRoom') : undefined}
        />
    );
};
