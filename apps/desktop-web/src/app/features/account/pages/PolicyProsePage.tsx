import { useTranslation } from 'react-i18next';

import type { PolicyContent, SupportedLanguage } from '@chatic/policy-content';

import { PageShell } from '../../../shared';

/**
 * Versioned policy prose (terms / privacy share this shape): effective date
 * plus titled sections in the app language.
 */
export const PolicyProsePage = ({
    backTo,
    backLabel,
    titleKey,
    contents,
}: {
    backTo: string;
    /** Defaults to the policies hub title — both callers return there. */
    backLabel?: string;
    titleKey: string;
    contents: Record<SupportedLanguage, PolicyContent>;
}) => {
    const { t, i18n } = useTranslation();

    const lang: SupportedLanguage = i18n.language === 'ko' ? 'ko' : 'en';
    const content = contents[lang];
    const currentVersion = content.versions.find(v => v.version === content.currentVersion);

    return (
        <PageShell title={t(titleKey)} backTo={backTo} backLabel={backLabel ?? t('policy.list.title')}>
            <p className="mb-6 text-right text-caption text-muted-foreground">
                {t('policy.effectiveDate')}: {currentVersion?.effectiveDate}
            </p>
            <div className="flex flex-col gap-8 select-text">
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
        </PageShell>
    );
};
