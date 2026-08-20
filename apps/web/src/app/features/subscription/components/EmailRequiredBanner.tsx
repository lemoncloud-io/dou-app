import { Mail } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { useEmailBindRequest } from '../../../stores/useEmailBindRequest';
import { useUnboundClouds } from '../hooks';
import { unboundCloudLabel } from '../lib';

/**
 * Prompts to register an email on clouds that were created without one — a purchase or add-cloud
 * request that skipped the email step, per the backend's confirmation that a cloud reaches `active`
 * with no email at all (see `findUnboundClouds`).
 *
 * Says WHY the address is wanted: it is what recovers the cloud on a new device or after a
 * reinstall, which is the part that makes registering it worth doing now rather than "later". And it
 * NAMES the clouds — the banner used to say "a cloud" needs an email while sitting next to a list of
 * several, leaving the user to guess which one, and to see the same banner again after fixing one.
 *
 * Same shape as `ExcessCloudBanner` otherwise: detection only, each CTA raises a request that
 * `EmailBindRequestHost` answers — the same one the cloud switcher's unbound-email row raises, so
 * there is exactly one dialog instance regardless of where the user noticed the gap.
 */
export const EmailRequiredBanner = () => {
    const { t } = useTranslation();
    const { clouds } = useUnboundClouds();
    const requestEmailBind = useEmailBindRequest(s => s.requestEmailBind);

    // Only a cloud with an id can be bound — `verify-email`'s `confirm` step takes one.
    const bindable = clouds.filter((cloud): cloud is typeof cloud & { id: string } => !!cloud.id);
    if (bindable.length === 0) return null;

    return (
        <div className="flex flex-col gap-2 rounded-[16px] border border-point-blue/40 bg-blue-50 px-4 py-3 dark:bg-blue-950/30">
            <div className="flex items-center gap-2">
                <Mail size={18} className="shrink-0 text-point-blue" />
                <span className="text-[15px] font-semibold text-point-blue">
                    {t('mypage.subscription.emailRequired.title', { count: bindable.length })}
                </span>
            </div>
            <p className="text-[13px] leading-[1.5] text-point-blue/80">
                {t('mypage.subscription.emailRequired.description')}
            </p>
            <ul className="flex flex-col gap-1 pt-1">
                {bindable.map(cloud => (
                    <li key={cloud.id} className="flex items-center justify-between gap-2">
                        <span className="min-w-0 truncate text-[13px] font-medium text-point-blue">
                            {unboundCloudLabel(cloud)}
                        </span>
                        <button
                            type="button"
                            onClick={() => requestEmailBind(cloud.id)}
                            className="shrink-0 text-[13px] font-semibold text-point-blue underline underline-offset-2"
                        >
                            {t('mypage.subscription.emailRequired.action')}
                        </button>
                    </li>
                ))}
            </ul>
        </div>
    );
};
