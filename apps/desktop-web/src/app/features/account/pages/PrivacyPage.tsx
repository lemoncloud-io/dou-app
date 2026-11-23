import { PRIVACY_CONTENTS } from '@chatic/policy-content';

import { PolicyProsePage } from './PolicyProsePage';

export const PrivacyPage = () => (
    <PolicyProsePage backTo="/account/policies" titleKey="policy.list.privacy" contents={PRIVACY_CONTENTS} />
);
