import { type JSX } from 'react';
import { useTranslation } from 'react-i18next';

/**
 * The refund policy the subscription pages link to. A placeholder until the policy text exists —
 * when it does, it comes from `@chatic/policy-content` like the other three and this page moves onto
 * `PolicyPageLayout`.
 */
export const RefundPolicyPage = (): JSX.Element => {
    const { t } = useTranslation();

    return (
        <main className="w-full h-screen overflow-y-auto bg-white">
            <div className="max-w-[1200px] mx-auto px-4 sm:px-6 py-8 sm:py-12">
                <h1 className="text-[28px] sm:text-[36px] font-bold text-gray-900">{t('policy.refundTitle')}</h1>
            </div>
        </main>
    );
};
