import { TERMS_CONTENTS } from '@chatic/policy-content';

import { PolicyProsePage } from './PolicyProsePage';

export const TermsPage = () => (
    <PolicyProsePage backTo="/account/policies" titleKey="policy.list.terms" contents={TERMS_CONTENTS} />
);
