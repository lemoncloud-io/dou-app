import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

import { PolicyPageLayout } from '../components';

/**
 * The refund policy the subscription pages link to. Its text has not been written yet, so the page
 * says so in a marked proposal block rather than carrying wording nobody has approved. When the text
 * exists it comes from `@chatic/policy-content` like the other three, with versions and an effective
 * date, and this page renders it the way `TermsOfServicePage` does.
 */
export const RefundPolicyPage = (): JSX.Element => {
    const { t } = useTranslation();

    return (
        <PolicyPageLayout title={t('policy.refundTitle')} subtitle={t('policy.refundSubtitle')}>
            <section className="rounded-2xl bg-[#f4f5f5] px-6 py-6 sm:px-8">
                <div className="flex items-center gap-2">
                    <span className="rounded px-2 py-0.5 text-[12px] font-semibold text-[#222325] bg-[#c4ff00]">
                        {t('policy.refundDraft.badge')}
                    </span>
                    <h2 className="text-[16px] sm:text-[18px] font-bold text-gray-900">
                        {t('policy.refundDraft.title')}
                    </h2>
                </div>
                <p className="mt-3 text-[14px] sm:text-[16px] leading-relaxed text-gray-700">
                    {t('policy.refundDraft.body')}
                </p>
            </section>
        </PolicyPageLayout>
    );
};
