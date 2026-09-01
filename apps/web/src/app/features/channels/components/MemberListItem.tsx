import { useTranslation } from 'react-i18next';

import { cn } from '@chatic/lib/utils';
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
    /**
     * My own row has no place profile yet, so `member.name` is the nudge copy rather than a person's
     * name (ADR-0040). Underlines it to read as the actionable link Figma 3185-13278 shows.
     */
    needsProfileSetup?: boolean;
    /**
     * This member has left the room. Only 1:1 rooms list departed members at all, so this is the DM
     * "대화방 나감" row (ADR-0068 결정 6). Distinct from `isPendingInvite`: one never arrived, the
     * other arrived and left — the join counter alone cannot tell them apart (see utils/membership),
     * which is why the caller decides and not this component.
     */
    hasLeft?: boolean;
    /** When set, the row becomes a button that opens the member profile. */
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

    // Badge precedence: a pending invite wins (it carries its own greyed treatment),
    // then the owner role (방장 — shown even on my own row when I own the room), then MY.
    const badge = isPendingInvite
        ? { variant: 'pending' as const, label: t('chat.settings.badge.pending') }
        : isOwner
          ? { variant: 'owner' as const, label: t('chat.settings.badge.owner') }
          : isMe
            ? { variant: 'mine' as const, label: t('chat.settings.badge.mine') }
            : null;

    // A departed member is dimmed the same way a pending invite is — both are "not here right now".
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
                    {/* Figma places the status pill before the name. */}
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
