export const IS_DEV = import.meta.env.VITE_ENV === 'DEV' || import.meta.env.VITE_ENV === 'LOCAL';

export const APP_ID = IS_DEV ? 'io.chatic.dou.dev' : 'io.chatic.dou';

export const POLICY_BASE_URL = IS_DEV ? 'https://app-dev.chatic.io' : 'https://app.chatic.io';

// TODO: 추후 서버에서 노출할 상품 목록을 관리하는 방식으로 변경 예정
export const ALLOWED_PRODUCT_ID_IOS = IS_DEV ? '#pro_tier_01_dev' : '#pro_tier_01';
export const ALLOWED_PRODUCT_ID_ANDROID = IS_DEV ? '#pro-tier-01-dev' : '#pro-tier-01';
