import { useTranslation } from 'react-i18next';

import { Badge, DefaultAvatar, IconUsersGroup, Text } from '@chatic/web-ui-kit';

import { InviteCard } from './InviteCard';

interface InviteTargetCardProps {
    /** Member count of the target room; when present a group badge is shown. */
    memberCount?: number;
    /** Which kind of room the invite leads to. Relay invites are always 1:1 (ADR-0033). */
    kind?: 'group' | 'oneToOne';
}

/**
 * Invite accept screen — the "You" block: who is joining. Shows the self avatar and the room-kind
 * caption (Figma 3072-10943 · 3076-11341). Cloud invites are group chats, so that stays the default;
 * the relay 1:1 invite passes `oneToOne`.
 *
 * The avatar is the `self` variant on purpose: the design uses the Figma "1명 Profile" solid glyph for
 * **both** kinds rather than the three-person group glyph (ADR-0037 decision 5 — flagged for designer
 * review, so switching to `variant="group"` later is a one-word change).
 *
 * The "room friends N" badge appears only once the invite metadata carries a member count. Nothing
 * passes one today — the invite Head types have no such field — so in practice it stays hidden; the UI
 * is built ahead of the backend per ADR-0033 D1 and lights up with no code change.
 */
export const InviteTargetCard = ({ memberCount, kind = 'group' }: InviteTargetCardProps) => {
    const { t } = useTranslation();

    return (
        <InviteCard>
            <DefaultAvatar size={40} variant="self" />
            <div className="flex w-full flex-col items-center gap-1 text-center">
                <Text as="p" className="text-[16px] font-semibold leading-[1.4] text-foreground">
                    {t('inviteAccept.target.you')}
                </Text>
                <Text as="p" className="text-[14px] font-medium leading-[1.4] text-label">
                    {t(kind === 'oneToOne' ? 'inviteAccept.target.oneToOne' : 'inviteAccept.target.group')}
                </Text>
            </div>
            {memberCount != null && memberCount > 0 && (
                <Badge
                    icon={<IconUsersGroup size={18} />}
                    // A lighter glass pill than the card it sits on, lifted by a soft shadow (Figma
                    // 3076-11378). Overrides the tone's fill/text instead of adding a Badge variant —
                    // this is the only place in the app that needs the treatment. The dark fill is
                    // bumped because the card is already `white/10` there: matching it would leave the
                    // pill with no edge to read against.
                    className="gap-1.5 bg-white/20 px-3.5 py-2 text-[13px] leading-4 text-label shadow-[0px_0px_6px_0px_rgba(0,0,0,0.04)] dark:bg-white/20"
                >
                    {t('inviteAccept.target.roomFriends', { count: memberCount })}
                </Badge>
            )}
        </InviteCard>
    );
};
