import { useTranslation } from 'react-i18next';

import type { runtime } from '@chatic/runtime';

import { useCloudName } from '../../../hooks';
import { ConfirmDialog } from '../../channels/components/ConfirmDialog';

interface PairingLogoutDialogProps {
    logout: runtime.session.PairingAwareLogout;
    action: 'logout' | 'withdraw';
}

export const PairingLogoutDialog = ({ logout, action }: PairingLogoutDialogProps) => {
    const { t } = useTranslation();
    const cloudName = useCloudName();
    const rows = logout.pending ?? [];
    const lines = rows.map(row =>
        [
            row.client.name || t('pairing.approve.unknownClient'),
            row.target.type === 'relay'
                ? t('pairing.scope.relayLabel')
                : t('pairing.scope.cloudLabel', { cloud: cloudName(row.target.cloudId) }),
        ].join(' · ')
    );
    const cloudNote = rows.some(row => row.target.type === 'cloud') ? t('pairing.logout.cloudNote') : null;

    return (
        <ConfirmDialog
            open={!!logout.pending}
            onOpenChange={open => !open && logout.cancel()}
            title={t(action === 'withdraw' ? 'pairing.logout.withdrawTitle' : 'pairing.logout.title', {
                count: rows.length,
            })}
            description={[...lines, cloudNote].filter(Boolean).join('\n')}
            confirmLabel={t(action === 'withdraw' ? 'pairing.logout.withdrawConfirm' : 'pairing.logout.confirm')}
            onConfirm={() => void logout.confirm()}
            isPending={logout.busy}
            closeOnConfirm={false}
            variant="warning"
        />
    );
};
