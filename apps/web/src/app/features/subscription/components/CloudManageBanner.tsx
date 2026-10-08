import { useTranslation } from 'react-i18next';

import { Lock, ShieldAlert } from 'lucide-react';

import { useNavigateWithTransition } from '@chatic/shared';
import { IconClockSolid, StatusBanner } from '@chatic/web-ui-kit';

import { useClouds } from '../../../hooks/useCloudCatalog';
import { useMembershipInfo } from '../../../hooks/useMembership';
import { ROUTES } from '../../../routes/paths';
import { useCloudManageScene, usePlanCatalog } from '../hooks';
import {
    formatDate,
    hasDropMarks,
    isWithinExpiredHold,
    keepCandidates,
    needsKeepChoice,
    planDisplayName,
} from '../lib';

const BANNER_ICON = 'size-6 text-[#1C274C] dark:text-foreground';

/**
 * The status banner at the top of cloud management — what the subscription is doing to the clouds
 * (Figma 5000-54966 queued downgrade · 5002-56919 expired).
 *
 * Exported from the feature barrel so `CloudManagePage` can mount it without learning how the
 * membership is judged: the choice is `useCloudManageScene`'s, the dates and names come from the
 * same joins the subscription screens use. The title row opens the subscription detail; the queued
 * downgrade additionally carries the keep-clouds pill, because that choice is the one thing a user
 * can still do about which clouds the relay will hold.
 */
export const CloudManageBanner = () => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigateWithTransition();
    const isKo = i18n.language.startsWith('ko');

    const { data: membership, isLoading: isMembershipLoading } = useMembershipInfo();
    const { summary, pendingPlan } = usePlanCatalog();
    const { banner, isLoading: isSceneLoading } = useCloudManageScene();
    const { data: cloudsData } = useClouds({ limit: -1 });

    if (isMembershipLoading || isSceneLoading || !banner) return null;

    const openDetail = () => navigate(ROUTES.subscription.detail);
    const validUntil = formatDate(membership?.validUntil);

    switch (banner) {
        case 'blocked':
            return (
                <StatusBanner
                    icon={<ShieldAlert className={BANNER_ICON} />}
                    title={t('mypage.subscription.banner.blocked.title')}
                    description={t('mypage.subscription.blockedNotice')}
                    tone="danger"
                    onClick={openDetail}
                />
            );
        case 'expired':
            return (
                <StatusBanner
                    icon={<Lock className={BANNER_ICON} />}
                    title={t('mypage.subscription.banner.expired.title')}
                    description={
                        // "Your clouds come back" is only true while the relay still holds them.
                        isWithinExpiredHold(membership?.validUntil, Date.now())
                            ? t('mypage.subscription.banner.expired.description')
                            : t('mypage.subscription.banner.expired.descriptionPastHold')
                    }
                    tone="danger"
                    onClick={openDetail}
                />
            );
        case 'pendingChange': {
            const candidates = keepCandidates(cloudsData?.list ?? []);
            // The pill only when there is a choice to make: a downgrade everything fits into has
            // nothing to ask, and the keep screen would bounce straight back.
            const owesKeepChoice = needsKeepChoice(candidates.length, pendingPlan?.maxClouds);
            return (
                <StatusBanner
                    icon={<IconClockSolid className={BANNER_ICON} />}
                    title={t('mypage.subscription.detail.pendingHeader')}
                    description={t('mypage.subscription.detail.pendingDescription', {
                        date: validUntil,
                        product: planDisplayName(pendingPlan, isKo) ?? summary.pendingProductId,
                    })}
                    onClick={openDetail}
                    action={
                        owesKeepChoice
                            ? {
                                  label: hasDropMarks(candidates)
                                      ? t('mypage.subscription.detail.keepReview')
                                      : t('mypage.subscription.detail.keepPick'),
                                  onClick: () => navigate(ROUTES.subscription.keep),
                              }
                            : undefined
                    }
                />
            );
        }
    }
};
