export const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';

export const APP_ID = IS_DEV ? 'io.chatic.dou.dev' : 'io.chatic.dou';

export const POLICY_BASE_URL = IS_DEV ? 'https://app-dev.chatic.io' : 'https://app.chatic.io';

export const WEB_SUBSCRIPTION_URL = {
    plans: `${POLICY_BASE_URL}/subscription/plans`,
    list: `${POLICY_BASE_URL}/subscription`,
} as const;
