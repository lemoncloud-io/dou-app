import { useTranslation } from 'react-i18next';

import { PRIVACY_CONTENTS } from '@chatic/policy-content';

import { PolicyProsePage } from './PolicyProsePage';

/** Privacy policy prose in the app language. */
export const PrivacyPage = () => {
    const { t } = useTranslation();
    return (
        <PolicyProsePage
            backTo="/account/policies"
            backLabel={t('policy.list.title')}
            titleKey="policy.list.privacy"
            contents={PRIVACY_CONTENTS}
        />
    );
};
