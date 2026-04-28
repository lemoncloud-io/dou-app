import type { Platform } from './common';

/** OAuth 로그인 제공자 타입 */
export type OAuthLoginProvider = 'google' | 'apple';

/** 인증 결과의 공통 기반 인터페이스 */
interface BaseTokenResult {
    /** 인증이 수행된 플랫폼 정보 (ios | android 등) */
    platform: Platform;
    /** 사용된 로그인 제공자 */
    provider: OAuthLoginProvider;
}

/** Google OAuth 인증 결과 상세 */
export interface GoogleOAuthTokenResult extends BaseTokenResult {
    provider: 'google';
    /** 서버 검증용 ID 토큰 */
    idToken: string;
    /** API 접근용 액세스 토큰 */
    accessToken?: string;
    /** 액세스 토큰 만료 일시 */
    accessTokenExpiredAt?: string;
    /** 서버 사이드 인증을 위한 일회성 코드 */
    serverAuthCode?: string;
    /** 갱신용 리프레시 토큰 */
    refreshToken?: string;
}

/** Apple OAuth 인증 결과 상세 */
export interface AppleOAuthTokenResult extends BaseTokenResult {
    provider: 'apple';
    /** 서버 검증용 Identity 토큰 (JWT) */
    identityToken: string;
    /** Replay Attack 방지를 위해 전달했던 임의값 */
    nonce?: string;
    /** Apple에서 발급한 고유 사용자 식별자 */
    user: string;
    /** 사용자 이메일 (최초 로그인 시에만 제공될 수 있음) */
    email?: string;
    /** 사용자 이름 정보 (최초 로그인 시에만 제공) */
    fullName?: {
        givenName?: string | null;
        familyName?: string | null;
        namePrefix?: string | null;
        nameSuffix?: string | null;
        nickname?: string | null;
        middleName?: string | null;
    };
    /** 서버 사이드 인증을 위한 권한 부여 코드 */
    authorizationCode?: string;
}

/** 통합 OAuth 인증 결과 타입 */
export type OAuthTokenResult = GoogleOAuthTokenResult | AppleOAuthTokenResult;

/** [요청] OAuth 로그인 실행 페이로드 */
export interface OAuthLoginPayload {
    /** 실행할 로그인 제공자 */
    provider: OAuthLoginProvider;
}

/** [요청] OAuth 로그아웃 실행 페이로드 */
export interface OAuthLogoutPayload {
    /** 로그아웃할 제공자 */
    provider: OAuthLoginProvider;
}

/** [응답] OAuth 로그인 처리 결과 페이로드 */
export interface OnOAuthLoginPayload {
    /** * 성공 시 인증 결과 객체 반환,
     * 사용자가 취소하거나 에러 발생 시 null 반환
     */
    result: OAuthTokenResult | null;
}

/** [응답] OAuth 로그아웃 처리 결과 페이로드 */
export interface OnOAuthLogoutPayload {
    /** 로그아웃 처리 성공 여부 */
    success: boolean;
}
