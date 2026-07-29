import { useTranslation } from 'react-i18next';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { DefaultAvatar, ListRow, StatusBadge } from '@chatic/web-ui-kit';

import { resolveInviteRowBadge } from '../utils/inviteStatus';

interface InviteChannelRowProps {
    invite: MyInviteView;
    onClick: () => void;
}

/**
 * One sent-invite row, shared by the home `ChannelList` and `PlaceChannelManagePage` (ADR-0033
 * Track B — 리스트 통합). Callers are expected to have already filtered to `pending`/`expired`
 * invites (see `useInviteListRows`) — this component only decides how ONE row looks, not which
 * invites qualify.
 *
 * Tapping always goes to the waiting screen rather than offering an inline action here: canceling
 * and re-inviting both live there, so there is exactly one place that owns those flows instead of
 * duplicating trigger points across every list this row appears in.
 */
export const InviteChannelRow = ({ invite, onClick }: InviteChannelRowProps) => {
    const { t } = useTranslation();

    const badge = resolveInviteRowBadge(invite.state);
    const name = invite.name || t('contactInvite.unnamedRecipient');
    const subtitle = invite.last4 ? t('contactInvite.maskedPhone', { last4: invite.last4 }) : undefined;

    return (
        <ListRow
            leading={<DefaultAvatar size={46} variant="user" className={badge?.variant === 'expired' ? 'opacity-50' : undefined} />}
            title={
                <>
                    {badge && <StatusBadge variant={badge.variant} label={t(badge.labelKey)} />}
                    <span className="truncate">{name}</span>
                </>
            }
            subtitle={subtitle}
            onClick={onClick}
        />
    );
};
