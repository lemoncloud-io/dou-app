import type { ConfigRegistryModule } from '../types';

/**
 * Operational guardrails only — capped at what has no product-tier meaning and no server
 * enforcement elsewhere (image size, resend attempts, search results). Product entitlements
 * (place/channel counts) are deliberately absent; ADR-0060 already gave the server product
 * catalogue ownership of those, and putting them here would give them two owners.
 *
 * `auth.resendLimit` includes `'server'` on purpose — an SMS cost spike is exactly the day this
 * needs to be tightened without a deploy.
 */
export const limitModule: ConfigRegistryModule = {
    'limit.image.maxBytes': {
        title: '이미지 업로드 최대 크기',
        description: '프로필·채널 이미지로 올릴 수 있는 최대 파일 크기.',
        type: 'number',
        defaultValue: 10_485_760,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'limit.auth.resendLimit': {
        title: '인증코드 재전송 횟수',
        description: '전화번호 인증코드를 다시 받을 수 있는 최대 횟수.',
        type: 'number',
        defaultValue: 5,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'limit.feedback.maxPhotos': {
        title: '피드백 첨부 사진 수',
        description: '피드백 하나에 첨부할 수 있는 사진 최대 개수.',
        type: 'number',
        defaultValue: 5,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
    'limit.search.maxResultsPerSection': {
        title: '검색 결과 섹션당 개수',
        description: '통합검색 한 섹션에 보여주는 최대 결과 수.',
        type: 'number',
        defaultValue: 20,
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
        appliesAt: 'live',
    },
};
