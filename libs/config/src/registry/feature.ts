import type { ConfigRegistryModule } from '../types';

/**
 * Gates that used to be scattered `isDevBuild()` / `VITE_ENV !== 'PROD'` ternaries.
 *
 * `feature.limits.enforced` is a bypass gate, not a limit value — the limit values themselves
 * (place/channel counts) stay out of this registry because ADR-0060 already moved their source of
 * truth to the server's product catalogue; putting them here would give product limits two owners.
 */
export const featureModule: ConfigRegistryModule = {
    'feature.auth.phoneLogin': {
        title: '전화번호 로그인',
        description: '전화번호로 로그인하는 화면을 보여준다.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
    },
    'feature.auth.phoneDevSwitches': {
        title: '전화 인증 개발자 스위치',
        description: '전화 인증 화면에 개발용 바로가기를 보여준다.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
    },
    'feature.auth.lenientVerifyCode': {
        title: '인증코드 느슨한 검증',
        description: '개발 중 아무 문자나 인증코드로 받아들인다.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
    },
    'feature.auth.socialLogin': {
        title: '소셜 로그인',
        description: '구글 등 소셜 로그인 버튼을 보여준다.',
        type: 'boolean',
        defaultValue: true,
        byStage: { PROD: false },
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
    },
    'feature.subscription.dryRun': {
        title: '구독 결제 모의 실행',
        description: '실제 결제 없이 구독 흐름만 시험한다.',
        type: 'boolean',
        defaultValue: false,
        byStage: { LOCAL: true, DEV: true },
        surface: 'dev',
        writableBy: ['local'],
        persist: 'session',
    },
    'feature.limits.enforced': {
        title: '생성 한도 적용',
        description: '장소·채널 생성 한도를 실제로 막는다. 꺼지면 개발용으로 무제한 생성된다.',
        type: 'boolean',
        defaultValue: true,
        byStage: { LOCAL: false, DEV: false },
        surface: 'dev',
        writableBy: ['local', 'server'],
        persist: 'session',
    },
};
