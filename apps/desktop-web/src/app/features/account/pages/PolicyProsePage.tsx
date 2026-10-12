import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';

import type { PolicyContent, SupportedLanguage } from '@chatic/policy-content';

import { Button } from '@chatic/ui-kit/components/ui/button';

/**
 * Versioned policy prose (terms / privacy share this shape): effective date
 * plus titled sections in the app language.
 */
export const PolicyProsePage = ({
    backTo,
    titleKey,
    contents,
}: {
    backTo: string;
    titleKey: string;
    contents: Record<SupportedLanguage, PolicyContent>;
}) => {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();

    const lang: SupportedLanguage = i18n.language === 'ko' ? 'ko' : 'en';
    const content = contents[lang];
    const currentVersion = content.versions.find(v => v.version === content.currentVersion);

    return (
        <div className="flex h-full flex-col bg-background">
            <header className="flex h-14 shrink-0 items-center gap-3 border-b border-border px-6">
                <Button
                    variant="ghost"
                    size="sm"
                    className="gap-1 text-muted-foreground"
                    onClick={() => navigate(backTo)}
                >
                    <ChevronLeft className="h-4 w-4" />
                    {t('settings.back')}
                </Button>
                <h1 className="text-heading text-foreground">{t(titleKey)}</h1>
            </header>

            <div className="scrollbar-thin mx-auto w-full max-w-2xl flex-1 overflow-y-auto p-8">
                <p className="mb-6 text-right text-caption text-muted-foreground">
                    {t('policy.effectiveDate')}: {currentVersion?.effectiveDate}
                </p>
                <div className="flex flex-col gap-8">
                    {currentVersion?.sections.map((section, index) => (
                        <section key={index}>
                            <h2 className="mb-3 text-heading text-foreground">{section.title}</h2>
                            <div className="flex flex-col gap-2 text-callout leading-relaxed text-muted-foreground">
                                {section.content.split('\n').map((para, i) => (
                                    <p key={i}>{para}</p>
                                ))}
                            </div>
                        </section>
                    ))}
                </div>
            </div>
        </div>
    );
};
