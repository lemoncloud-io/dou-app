import { useTranslation } from 'react-i18next';

import { IconChevronRight, SystemMessage } from '@chatic/web-ui-kit';

export type RoomIntroVariant = 'self' | 'dm' | 'group';

interface RoomIntroProps {
    /** Channel stereo — self / dm / group each get their own copy. */
    variant: RoomIntroVariant;
    /** DM only: the peer's place-profile nick. Absent → the unnamed line. */
    peerNick?: string | null;
    /** Group only: the copy is written in the creator's voice, so a member gets no intro. */
    isGroupOwner?: boolean;
    /** Group owner only: opens the invite screen. Omitted for a guest or an inactive cloud. */
    onInvite?: () => void;
}

/**
 * The description block pinned at the start of a chat thread, one per channel stereo:
 * self (Figma 3565-30751), 1:1 (2948-27537) and group (3209-26754).
 *
 * Unlike an empty state it is not a placeholder — it stays at the top of the thread once messages
 * exist, reading as the room's own first entry above the oldest message. The caller renders it
 * directly under the oldest date divider.
 *
 * The DM line names the peer from their place profile ONLY — it states who joined, so my private
 * alias for the room has no place in it — and says it without a name when there is no profile
 * (ADR-0039). The stream's own join notice (SystemNotice pill) is left in place: the repeated
 * sentence is intended.
 */
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

    // "그룹방을 만들었습니다" is the creator's own line, so a member who merely joined sees nothing.
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
