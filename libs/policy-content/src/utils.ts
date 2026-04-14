import type { PolicyContent, SupportedLanguage } from './types';
import { CHILD_POLICY_CONTENT } from './child/ko';
import { CHILD_POLICY_CONTENT_EN } from './child/en';
import { PRIVACY_POLICY_CONTENT } from './privacy/ko';
import { PRIVACY_POLICY_CONTENT_EN } from './privacy/en';
import { TERMS_OF_SERVICE_CONTENT } from './terms/ko';
import { TERMS_OF_SERVICE_CONTENT_EN } from './terms/en';

export const TERMS_CONTENTS: Record<SupportedLanguage, PolicyContent> = {
    ko: TERMS_OF_SERVICE_CONTENT,
    en: TERMS_OF_SERVICE_CONTENT_EN,
};

export const PRIVACY_CONTENTS: Record<SupportedLanguage, PolicyContent> = {
    ko: PRIVACY_POLICY_CONTENT,
    en: PRIVACY_POLICY_CONTENT_EN,
};

export const CHILD_CONTENTS: Record<SupportedLanguage, PolicyContent> = {
    ko: CHILD_POLICY_CONTENT,
    en: CHILD_POLICY_CONTENT_EN,
};
