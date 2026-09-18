// The web-core versions of the three same-named hook pairs (useSessionLogout ·
// useLogoutCloudSession · useSiteSwitch) are deleted — the app-runtime versions, which notify
// auth.logout/auth.switch over the socket, are the winners
// (ADR-0070 Decision 1, design doc §same-name hook merge table). The winner sits in the same place as
// every other session action: whether the transport is a socket or HTTP is an implementation detail
// of the action, not a classification criterion.
export * from './actions/useInviteFlow';
export * from './actions/useLogoutCloudSession';
export * from './actions/useSessionLogout';
export * from './actions/useSiteSwitch';
export * from './actions/useSwitchCloudSession';
export * from './readers/useGlobalSession';
export * from './readers/useSessionAuth';
export * from './readers/useSessionIdentity';
export * from './readers/useSessionSelection';
