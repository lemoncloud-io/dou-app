import { useTranslation } from 'react-i18next';

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
    /** When set, the row becomes a button that opens the member profile. */
    onClick?: () => void;
}

const AVATAR_SIZE = 40;

export const MemberListItem = ({
    member,
    isMe = false,
    isOwner = false,
    isPendingInvite = false,
    onClick,
}: MemberListItemProps) => {
    const { t } = useTranslation();

    // Badge precedence: a pending invite wins (it carries its own greyed treatment),
    // then the owner role (방장 — shown even on my own row when I own the room), then MY.
    const badge = isPendingInvite
        ? { variant: 'pending' as const, label: t('chat.settings.badge.pending') }
        : isOwner
          ? { variant: 'owner' as const, label: t('chat.settings.badge.owner') }
          : isMe
            ? { variant: 'mine' as const, label: t('chat.settings.badge.mine') }
            : null;

    const avatar = member.avatar ? (
        <ImageAvatar src={member.avatar} alt={member.name} size={AVATAR_SIZE} />
    ) : (
        <DefaultAvatar size={AVATAR_SIZE} className={isPendingInvite ? 'opacity-50' : undefined} />
    );

    return (
        <ListRow
            leading={avatar}
            onClick={onClick}
            title={
                <>
                    {/* Figma places the status pill before the name. */}
                    {badge && <StatusBadge variant={badge.variant} label={badge.label} />}
                    <span className={`truncate ${isPendingInvite ? 'text-muted-foreground' : ''}`}>{member.name}</span>
                </>
            }
        />
    );
};
