import { useTranslation } from 'react-i18next';

import { TERMS_CONTENTS } from '@chatic/policy-content';

import { PolicyProsePage } from './PolicyProsePage';

/** Terms of service prose in the app language. */
export const TermsPage = () => {
    const { t } = useTranslation();
    return (
        <PolicyProsePage
            backTo="/account/policies"
            backLabel={t('policy.list.title')}
            titleKey="policy.list.terms"
            contents={TERMS_CONTENTS}
        />
    );
};
