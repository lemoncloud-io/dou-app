import { useTranslation } from 'react-i18next';

import { useCloudQuota, usePlanCatalog } from '../hooks';
import { planDisplayName } from '../lib';

/**
 * One line saying which plan is running and how much of its cloud allowance is used.
 *
 * Exported from the feature barrel so other screens (`CloudManagePage`) can show the membership
 * without learning how it is resolved. The screen it replaced printed `membership.productId` — the
 * raw server id, `"pro_tier_04_dev"` — once per cloud row: an internal key shown as a product name,
 * repeated for a membership that is held per ACCOUNT, not per cloud.
 *
 * The allowance comes from `useCloudQuota` (the plan catalog join), never from `membership.product$`,
 * which is a head and carries no `maxClouds`. When it cannot be resolved (`limit === null` — a
 * granted "super" membership, or a catalog that has not loaded) the count is dropped rather than
 * printed as a limit of zero.
 */
export const CloudMembershipSummary = () => {
    const { t, i18n } = useTranslation();
    const { summary, currentPlan } = usePlanCatalog();
    const { used, limit } = useCloudQuota();

    // Never subscribed → nothing to summarise. The empty state below the list already says that.
    if (summary.state === 'none') return null;

    // `currentPlan` resolves off-native and across stores (see `usePlanCatalog`), but a granted
    // membership has no product at all — then the plan-agnostic "구독 이용 중" is the honest label.
    const planName = planDisplayName(currentPlan, i18n.language.startsWith('ko'));
    const label = !planName
        ? t('mypage.subscription.inUse')
        : limit == null
          ? t('mypage.subscription.summaryLine', { plan: planName })
          : t('mypage.subscription.summaryLineWithQuota', { plan: planName, used, max: limit });

    return (
        <div className="flex items-center rounded-[10px] bg-[rgba(0,43,126,0.04)] px-4 py-2">
            <span className="w-full text-center text-[14px] font-medium leading-[1.19] tracking-[-0.02em] text-[#84888F]">
                {label}
            </span>
        </div>
    );
};
