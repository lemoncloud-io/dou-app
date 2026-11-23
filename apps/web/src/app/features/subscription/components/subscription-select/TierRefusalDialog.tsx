import { useTranslation } from 'react-i18next';

import { AlertDialog } from '@chatic/web-ui-kit';
import type { ProductView } from '@lemoncloud/chatic-backend-api';

import { planDisplayName, type TierRefusal } from '../../lib';

interface TierRefusalDialogProps {
    refusal: TierRefusal | null;
    onOpenChange: (open: boolean) => void;
    alternative?: ProductView;
    onPickAlternative: (plan: ProductView) => void;
    isKo: boolean;
    store?: string;
}

export const TierRefusalDialog = ({
    refusal,
    onOpenChange,
    alternative,
    onPickAlternative,
    isKo,
    store,
}: TierRefusalDialogProps) => {
    const { t } = useTranslation();

    if (!refusal) return null;

    const alternativeName = planDisplayName(alternative, isKo);
    const description = [
        t(`mypage.subscription.refusal.${refusal}.description`, { store }),
        alternativeName && t('mypage.subscription.refusal.pickInstead', { plan: alternativeName }),
    ]
        .filter(Boolean)
        .join('\n');

    return (
        <AlertDialog
            open
            onOpenChange={onOpenChange}
            title={t(`mypage.subscription.refusal.${refusal}.title`)}
            description={description}
            cancelLabel={alternative ? t('common.cancel') : undefined}
            confirmLabel={
                alternative && alternativeName
                    ? t('mypage.subscription.refusal.selectInstead', { plan: alternativeName })
                    : t('common.confirm')
            }
            onConfirm={() => alternative && onPickAlternative(alternative)}
        />
    );
};
