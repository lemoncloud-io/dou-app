import { useTranslation } from 'react-i18next';

import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

import { DefaultAvatar, ListRow, StatusBadge } from '@chatic/web-ui-kit';
import { cn } from '@chatic/ui-kit';

import { resolveInviteRowBadge } from '../utils/inviteStatus';

interface InviteChannelRowProps {
    invite: MyInviteView;
    onClick: () => void;
}

export const InviteChannelRow = ({ invite, onClick }: InviteChannelRowProps) => {
    const { t } = useTranslation();

    const badge = resolveInviteRowBadge(invite.state);
    const name = invite.name || t('contactInvite.unnamedRecipient');
    const isSpent = badge?.variant === 'expired';
    const subtitle = isSpent
        ? t(badge?.kind === 'declined' ? 'contactInvite.rowStatus.declined' : 'contactInvite.rowStatus.expired')
        : invite.last4
          ? t('contactInvite.maskedPhone', { last4: invite.last4 })
          : undefined;

    return (
        <ListRow
            leading={<DefaultAvatar size={42} className={isSpent ? 'opacity-50' : undefined} />}
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
