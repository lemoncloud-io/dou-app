import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';

import type { PendingConsent } from '../hooks/useMiniAppOpener';

/** The first-open question for a site DoU does not run. A yes/no that blocks: closing it any other way is a no. */
export const MiniAppConsentDialog = ({
    pending,
    onAnswer,
}: {
    pending: PendingConsent | null;
    onAnswer: (agreed: boolean) => void;
}) => {
    const { t } = useTranslation();
    return (
        <AlertDialog
            open={pending !== null}
            onOpenChange={next => !next && onAnswer(false)}
            title={t('miniApps.consent.title', { name: pending?.name ?? '' })}
            description={t('miniApps.consent.body')}
            cancelLabel={t('common.cancel')}
            confirmLabel={t('miniApps.consent.open')}
            onConfirm={() => onAnswer(true)}
        />
    );
};
