import { useTranslation } from 'react-i18next';

import { IconChevronRight, SystemMessage } from '@chatic/web-ui-kit';

export type RoomIntroVariant = 'self' | 'dm' | 'group';

interface RoomIntroProps {
    variant: RoomIntroVariant;
    peerNick?: string | null;
    isGroupOwner?: boolean;
    onInvite?: () => void;
}

export const RoomIntro = ({ variant, peerNick, isGroupOwner = false, onInvite }: RoomIntroProps) => {
    const { t } = useTranslation();

    if (variant === 'self') {
        return (
            <SystemMessage
                title={t('chat.room.emptyState.selfLine1')}
                description={t('chat.room.emptyState.selfLine2')}
            />
        );
    }

    if (variant === 'dm') {
        return (
            <SystemMessage
                title={peerNick ? t('chat.dm.intro.title', { name: peerNick }) : t('chat.dm.intro.titleUnnamed')}
                description={t('chat.dm.intro.description')}
            />
        );
    }

    if (!isGroupOwner) return null;

    return (
        <div className="flex flex-col items-start">
            <SystemMessage title={t('chat.room.emptyState.line1')} description={t('chat.room.emptyState.line2')} />
            {onInvite && (
                <button
                    onClick={onInvite}
                    className="mx-4 mt-4 flex h-[50px] items-center gap-1.5 rounded-full border border-input-border pl-[25px] pr-[19px] text-[16px] font-semibold text-foreground"
                >
                    {t('chat.room.emptyState.inviteButton')}
                    <IconChevronRight className="size-[18px]" />
                </button>
            )}
        </div>
    );
};
