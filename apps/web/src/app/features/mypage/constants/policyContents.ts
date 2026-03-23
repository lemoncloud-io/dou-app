import type { PolicyContent } from './policyTypes';
import { PRIVACY_POLICY_CONTENT } from './privacyContent';
import { PRIVACY_POLICY_CONTENT_EN } from './privacyContent.en';
import { TERMS_OF_SERVICE_CONTENT } from './termsContent';
import { TERMS_OF_SERVICE_CONTENT_EN } from './termsContent.en';

export const TERMS_CONTENTS: Record<string, PolicyContent> = {
    ko: TERMS_OF_SERVICE_CONTENT,
    en: TERMS_OF_SERVICE_CONTENT_EN,
};

export const PRIVACY_CONTENTS: Record<string, PolicyContent> = {
    ko: PRIVACY_POLICY_CONTENT,
    en: PRIVACY_POLICY_CONTENT_EN,
};
