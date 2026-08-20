import { AlertTriangle } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useNavigateWithTransition } from '@chatic/shared';

import { ROUTES } from '../../../routes/paths';
import { useExcessClouds } from '../hooks';

/**
 * Warns when more clouds are held than the plan allows — after a downgrade takes effect, say.
 *
 * Detection only, by design: releasing a cloud is irreversible, so the app never offers to do it
 * from here (ADR-0060 §4). The CTA points at the account-management screen, which already owns the
 * release path. Without this banner the overage would be invisible to everyone, which is the one
 * outcome worth avoiding while the server has no automatic cleanup.
 */
export const ExcessCloudBanner = () => {
    const { t } = useTranslation();
    const navigate = useNavigateWithTransition();
    const { excess, limit } = useExcessClouds();

    if (excess.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 rounded-[16px] border border-yellow-400 bg-yellow-50 px-4 py-3 dark:bg-yellow-950/30">
            <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="shrink-0 text-yellow-600 dark:text-yellow-400" />
                <span className="text-[15px] font-semibold text-yellow-700 dark:text-yellow-300">
                    {t('mypage.subscription.excess.title', { count: excess.length, max: limit ?? 0 })}
                </span>
            </div>
            <p className="text-[13px] leading-[1.5] text-yellow-700/80 dark:text-yellow-300/80">
                {t('mypage.subscription.excess.description')}
            </p>
            <ul className="flex flex-col gap-0.5 pl-1">
                {excess.map(cloud => (
                    <li key={cloud.id} className="text-[13px] text-yellow-700/80 dark:text-yellow-300/80">
                        • {cloud.email ?? cloud.name ?? cloud.id}
                    </li>
                ))}
            </ul>
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
