import { useTranslation } from 'react-i18next';

import { Badge, DefaultAvatar, IconUsers, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';

interface InviteTargetCardProps {
    /** Member count of the target room; when present a group badge is shown. */
    memberCount?: number;
}

/**
 * Invite accept screen — the "You" block: who is joining. Shows the self avatar + a 1:1 label; when
 * a member count is provided (group room) a "room friends N" badge is added. The 1:1-vs-group source
 * of truth is not finalized yet, so this defaults to 1:1 and only shows the badge when a count lands.
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
                    {t('inviteAccept.target.oneToOne')}
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
