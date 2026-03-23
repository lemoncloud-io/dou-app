import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { PolicyPageLayout, PolicySection } from '../components';
import { type SupportedLanguage, PRIVACY_CONTENTS } from '../constants';

export const PrivacyPolicyPage = (): JSX.Element => {
    const { t, i18n } = useTranslation();

    const lang: SupportedLanguage = i18n.language === 'ko' ? 'ko' : 'en';
    const content = PRIVACY_CONTENTS[lang];

    const [selectedVersion, setSelectedVersion] = useState(content.currentVersion);

    const currentVersionData = content.versions.find(v => v.version === selectedVersion);

    if (!currentVersionData) {
        return <div>{t('policy.versionNotFound')}</div>;
    }

    return (
        <PolicyPageLayout
            title={content.title}
            subtitle={content.subtitle}
            versions={content.versions}
            currentVersion={selectedVersion}
            onVersionChange={setSelectedVersion}
        >
            <div className="space-y-8 sm:space-y-12">
                {/* Effective Date */}
                <div className="text-right">
                    <p className="text-[14px] sm:text-[16px] text-gray-600">
                        {t('policy.effectiveDate')}: {currentVersionData.effectiveDate}
                    </p>
                </div>

                {/* Policy Sections */}
                {currentVersionData.sections.map((section, index) => (
                    <PolicySection key={index} section={section} index={index} />
                ))}
            </div>
        </PolicyPageLayout>
    );
};
