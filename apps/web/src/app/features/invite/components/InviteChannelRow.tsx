import { useTranslation } from 'react-i18next';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { DefaultAvatar, ListRow, StatusBadge } from '@chatic/web-ui-kit';
import { cn } from '@chatic/lib/utils';

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
    const isSpent = badge?.variant === 'expired';
    // A spent invite explains itself on the second line (Figma 3408-28373); a live one has no status
    // to report, so it keeps the masked number — the only thing telling two same-named invites apart.
    // Declined says why it is spent instead of blaming the clock (only reachable once the backend
    // reports that state — 요청 2번).
    const subtitle = isSpent
        ? t(badge?.kind === 'declined' ? 'contactInvite.rowStatus.declined' : 'contactInvite.rowStatus.expired')
        : invite.last4
          ? t('contactInvite.maskedPhone', { last4: invite.last4 })
          : undefined;

    return (
        <ListRow
            leading={
                // Figma draws this row's avatar as `1명 Profile` (3209:14450) — the solid silhouette
                // on a ringed brand-ink circle, which is now the only single-person avatar image.
                <DefaultAvatar size={42} className={isSpent ? 'opacity-50' : undefined} />
            }
            title={
                <>
                    {badge && <StatusBadge variant={badge.variant} label={t(badge.labelKey)} />}
                    <span className={cn('truncate', isSpent && 'text-placeholder')}>{name}</span>
                </>
            }
            subtitle={subtitle}
            onClick={onClick}
        />
    );
};
