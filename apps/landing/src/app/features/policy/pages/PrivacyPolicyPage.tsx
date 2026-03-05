import { useState } from 'react';

import { PolicyPageLayout, PolicySection } from '../components';
import { PRIVACY_POLICY_CONTENT } from '../constants';

export const PrivacyPolicyPage = (): JSX.Element => {
    const [selectedVersion, setSelectedVersion] = useState(PRIVACY_POLICY_CONTENT.currentVersion);

    const currentVersionData = PRIVACY_POLICY_CONTENT.versions.find(v => v.version === selectedVersion);

    if (!currentVersionData) {
        return <div>버전을 찾을 수 없습니다.</div>;
    }

    return (
        <PolicyPageLayout
            title={PRIVACY_POLICY_CONTENT.title}
            subtitle={PRIVACY_POLICY_CONTENT.subtitle}
            versions={PRIVACY_POLICY_CONTENT.versions}
            currentVersion={selectedVersion}
            onVersionChange={setSelectedVersion}
        >
            <div className="space-y-8 sm:space-y-12">
                {/* Effective Date */}
                <div className="text-right">
                    <p className="text-[14px] sm:text-[16px] text-gray-600">
                        시행일: {currentVersionData.effectiveDate}
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
