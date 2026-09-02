// 동명 훅 3쌍(useSessionLogout · useLogoutCloudSession · useSiteSwitch)의 web-core 판은
// 삭제됐다 — 소켓에 auth.logout/auth.switch를 통지하는 app-runtime 판이 승자다
// (ADR-0070 결정 1, 설계문서 §동명 훅 병합표). 승자는 다른 세션 액션과 같은 자리에 있다:
// 전송이 소켓이냐 HTTP냐는 액션의 구현 세부이지 분류 기준이 아니다.
export * from './actions/useInviteFlow';
export * from './actions/useLogoutCloudSession';
export * from './actions/useSessionLogout';
export * from './actions/useSiteSwitch';
export * from './actions/useSwitchCloudSession';
export * from './readers/useGlobalSession';
export * from './readers/useSessionAuth';
export * from './readers/useSessionIdentity';
export * from './readers/useSessionSelection';
