import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { useClouds } from '../../../hooks/useCloudCatalog';
import { ROUTES } from '../../../routes/paths';
import { findHeldClouds } from '../lib';

export const HeldCloudsBanner = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { data } = useClouds({ limit: -1 });
    const held = findHeldClouds(data?.list ?? []);

    if (held.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 rounded-[16px] border border-yellow-400 bg-yellow-50 px-4 py-3 dark:bg-yellow-950/30">
            <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="shrink-0 text-yellow-600 dark:text-yellow-400" />
                <span className="text-[15px] font-semibold text-yellow-700 dark:text-yellow-300">
                    {t('mypage.subscription.list.heldTitle', { count: held.length })}
                </span>
            </div>
            <p className="text-[13px] leading-[1.5] text-yellow-700/80 dark:text-yellow-300/80">
                {t('mypage.subscription.list.heldDescription')}
            </p>
            <button
                type="button"
                onClick={() => navigate(ROUTES.mypage.cloud.manage)}
                className="mt-1 self-start text-[13px] font-semibold text-yellow-700 underline underline-offset-2 dark:text-yellow-300"
            >
                {t('mypage.subscription.excess.manage')}
            </button>
        </div>
    );
};
