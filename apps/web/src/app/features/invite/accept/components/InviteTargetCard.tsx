import { useTranslation } from 'react-i18next';

import { Badge, DefaultAvatar, IconUsersGroup, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';

export type InviteTargetKind = 'group' | 'oneToOne' | 'place';

export type InviteRoomKind = Exclude<InviteTargetKind, 'place'>;

const CAPTION_KEY: Record<InviteRoomKind, string> = {
    group: 'inviteAccept.target.group',
    oneToOne: 'inviteAccept.target.oneToOne',
};

interface InviteTargetCardProps {
    memberCount?: number;
    kind?: InviteRoomKind;
    name?: string;
}

export const InviteTargetCard = ({ memberCount, kind = 'group', name }: InviteTargetCardProps) => {
    const { t } = useTranslation();
    const roomName = name?.trim();

    return (
        <InviteCard data-testid="invite-target-card">
            <DefaultAvatar size={40} />
            <div className="flex w-full flex-col items-center gap-1 text-center">
                {roomName && (
                    <Text as="p" className="text-[16px] font-semibold leading-[1.4] text-foreground">
                        {roomName}
                    </Text>
                )}
                <Text as="p" className="text-[14px] font-medium leading-[1.4] text-label">
                    {t(CAPTION_KEY[kind])}
                </Text>
            </div>
            {memberCount != null && memberCount > 0 && (
                <Badge
                    icon={<IconUsersGroup size={18} />}
                    className="gap-1.5 bg-white/20 px-3.5 py-2 text-[13px] leading-4 text-label shadow-[0px_0px_6px_0px_rgba(0,0,0,0.04)]"
                >
                    {t('inviteAccept.target.roomFriends', { count: memberCount })}
                </Badge>
            )}
        </InviteCard>
    );
};
