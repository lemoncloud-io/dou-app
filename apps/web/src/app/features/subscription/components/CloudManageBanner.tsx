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
