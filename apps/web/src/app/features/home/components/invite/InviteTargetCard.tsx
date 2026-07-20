import { useTranslation } from 'react-i18next';

import { Badge, DefaultAvatar, IconUsers, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';

interface InviteTargetCardProps {
    /** Member count of the target room; when present a group badge is shown. */
    memberCount?: number;
}

/**
 * Invite accept screen — the "You" block: who is joining. Shows the self avatar and the "group chat"
 * caption (Figma 3076-11341). Invites are always group chats today (1:1 is not shipped — ADR-0013),
 * so the caption is fixed to "group chat"; the "room friends N" badge is added only once the invite
 * metadata carries a member count (backend-denormalized; hidden until then).
 */
export const InviteTargetCard = ({ memberCount }: InviteTargetCardProps) => {
    const { t } = useTranslation();

    return (
        <InviteCard>
            <DefaultAvatar size={40} />
            <div className="flex w-full flex-col items-center gap-1 text-center">
                <Text as="p" className="text-[16px] font-semibold leading-[1.4] text-foreground">
                    {t('inviteAccept.target.you')}
                </Text>
                <Text as="p" className="text-[14px] font-medium leading-[1.4] text-description">
                    {t('inviteAccept.target.group')}
                </Text>
            </div>
            {memberCount != null && memberCount > 0 && (
                <Badge tone="muted" icon={<IconUsers size={14} />} className="px-2.5 py-1 text-[13px]">
                    {t('inviteAccept.target.roomFriends', { count: memberCount })}
                </Badge>
            )}
        </InviteCard>
    );
};
