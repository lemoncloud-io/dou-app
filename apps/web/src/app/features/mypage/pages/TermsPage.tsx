import { useTranslation } from 'react-i18next';

import { PageHeader } from '../../../shared/components';
import { TERMS_OF_SERVICE_CONTENT } from '../constants';

export const TermsPage = () => {
    const { t } = useTranslation();

    const currentVersion = TERMS_OF_SERVICE_CONTENT.versions.find(
        v => v.version === TERMS_OF_SERVICE_CONTENT.currentVersion
    );

    return (
        <div className="flex h-full flex-col bg-background pt-safe-top">
            <PageHeader title={t('mypage.policy.terms')} />

            {/* Content */}
            <div className="flex-1 overflow-y-auto px-5 py-6">
                {/* Effective date */}
                <p className="mb-6 text-right text-sm text-muted-foreground">
                    {t('mypage.policy.effectiveDate')}: {currentVersion?.effectiveDate}
                </p>

                {/* Sections */}
                <div className="space-y-8">
                    {currentVersion?.sections.map((section, index) => (
                        <div key={index}>
                            <h2 className="mb-3 text-lg font-semibold text-foreground">
                                {index + 1}. {section.title}
                            </h2>
                            <div className="space-y-2 text-sm leading-relaxed text-muted-foreground">
                                {section.content.split('\n').map((para, i) => (
                                    <p key={i}>{para}</p>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
