import { ChevronLeft } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';

import { TERMS_OF_SERVICE_CONTENT } from '../constants';

export const TermsPage = () => {
    const navigate = useNavigate();
    const { t } = useTranslation();

    const currentVersion = TERMS_OF_SERVICE_CONTENT.versions.find(
        v => v.version === TERMS_OF_SERVICE_CONTENT.currentVersion
    );

    return (
        <div className="flex min-h-screen flex-col bg-background">
            {/* Header */}
            <header className="flex items-center justify-between border-b border-border px-4 py-3">
                <button onClick={() => navigate(-1)} className="p-1">
                    <ChevronLeft size={24} className="text-foreground" />
                </button>
                <h1 className="text-[17px] font-semibold text-foreground">{t('mypage.policy.terms')}</h1>
                <div className="w-8" />
            </header>

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
