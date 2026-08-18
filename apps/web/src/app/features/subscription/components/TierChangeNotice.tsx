import { useTranslation } from 'react-i18next';

import type { TierChangeKind } from '../lib';
import { usePlanCatalog } from '../hooks';

interface TierChangeNoticeProps {
    kind: TierChangeKind;
}

/**
 * How the selected change will be billed, and what it costs in clouds.
 *
 * The copy is per-store because the stores behave differently: Apple refunds the remainder
 * pro-rata, charges the new plan in full immediately and resets the renewal date; Google charges
 * the difference and keeps the existing billing cycle. Showing one wording for both would be wrong
 * for half the users at the exact moment they are deciding to pay.
 */
export const TierChangeNotice = ({ kind }: TierChangeNoticeProps) => {
    const { t } = useTranslation();
    // Platform detection has exactly one owner. Sniffing `CHATIC_APP_PLATFORM` again here would be a
    // third copy of the same three lines, which is how the store-specific copy drifts apart.
    const { isIOS } = usePlanCatalog();

    if (kind !== 'upgrade' && kind !== 'downgrade') return null;

    const store = isIOS ? 'apple' : 'google';

    return (
        <div className="mt-4 flex flex-col gap-1 rounded-[12px] bg-muted/50 px-4 py-3">
            <p className="text-[13px] font-medium leading-[1.5] text-foreground">
                {t(`mypage.subscription.tierChange.${kind}`)}
            </p>
            <p className="text-[12px] leading-[1.6] text-muted-foreground">
                {t(`mypage.subscription.tierChange.billing.${store}`)}
            </p>
            {kind === 'downgrade' && (
                <p className="text-[12px] leading-[1.6] text-muted-foreground">
                    {t('mypage.subscription.tierChange.downgradeExcess')}
                </p>
            )}
        </div>
    );
};
