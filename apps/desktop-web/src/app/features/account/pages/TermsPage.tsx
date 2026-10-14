import { TERMS_CONTENTS } from '@chatic/policy-content';

import { PolicyProsePage } from './PolicyProsePage';

/** Terms of service prose in the app language. */
export const TermsPage = () => (
    <PolicyProsePage backTo="/account/policies" titleKey="policy.list.terms" contents={TERMS_CONTENTS} />
);
