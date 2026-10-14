import { PRIVACY_CONTENTS } from '@chatic/policy-content';

import { PolicyProsePage } from './PolicyProsePage';

/** Privacy policy prose in the app language. */
export const PrivacyPage = () => (
    <PolicyProsePage backTo="/account/policies" titleKey="policy.list.privacy" contents={PRIVACY_CONTENTS} />
);
