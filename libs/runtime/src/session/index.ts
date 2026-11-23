export {
    getActiveServerContext,
    getActiveSessionUser,
    getCommittedSessionSiteId,
    getGlobalSessionContext,
    getIdentityContext,
    getRelaySessionUser,
    getUidInCloud,
} from '@chatic/runtime-client';
export { isSessionKey } from '@chatic/session';
export type {
    ActiveServerView,
    CloudSessionView,
    IdentityView,
    RelaySessionView,
    SessionAuthView,
    SessionContextView,
    SessionUserView,
} from '@chatic/runtime-core';

export type { LogoutOptions } from '@chatic/auth';
export type { InviteLogin, SessionAccountView } from '@chatic/auth';
export { INVITE_LOGIN_UNKNOWN } from '@chatic/auth';
export { forgetInviteLogin } from '@chatic/runtime-client';
export { createCredentialsByProvider } from '@chatic/runtime-client';
export { registerSessionLogoutCallback } from '@chatic/runtime-client';
export { registerUserWithInviteCode } from '@chatic/runtime-client';
export { fetchInviteInfoWithCode } from '@chatic/runtime-client';
export { clearSiteSelection } from '@chatic/runtime-client';
export { patchRelaySessionUser } from '@chatic/runtime-client';
export { fetchAccountProfile, updateAccountProfile } from '@chatic/runtime-client';

export { SWITCH_CLOUD_MUTATION_KEY, SWITCH_SITE_MUTATION_KEY } from './hooks/mutationKeys';
export { useCloudCredentialGuard, useDynamicDeviceId, useSessionStalenessGuard } from './hooks/app';
export type { CloudCredentialPolicy, SessionStalenessPolicy } from './hooks/app';
export {
    useFindAlias,
    useInviteInfo,
    useLogin,
    useLoginRelayGuestByDevice,
    useLoginRelaySocial,
    useRegisterUserV2,
    useVerifyAlias,
} from './hooks/auth';
export {
    useGlobalSession,
    useInviteFlow,
    useLogoutCloudSession,
    useSessionAuth,
    useSessionIdentity,
    useSessionLogout,
    useSessionSelection,
    useSiteSwitch,
    useSwitchCloudSession,
    useUidInCloud,
} from './hooks/session';

export {
    useIsPairedSession,
    usePairedCloudCheck,
    usePairedCloudIds,
    usePairedCloudNames,
    usePairingAwareLogout,
    usePairingRequest,
} from './hooks/pairing';
export type { PairingAwareLogout, PairingRequestOptions } from './hooks/pairing';
export { isInOwnCloudSession, isPairedSession } from '@chatic/runtime-client';
export { forgetRefusedPairedCloud } from '@chatic/runtime-client';
export { isRefusedForEndedPairing } from '@chatic/auth';
export { deviceDisplayName } from '@chatic/auth';
export { pairingClientOf } from './pageDevice';
export { classifyPairingError } from '@chatic/auth';
export type { PairingApprovalError } from '@chatic/auth';
export type { PairingRequestState } from '@chatic/auth';

export { PHONE_LOGIN_NOTHING_PENDING, PHONE_LOGIN_NO_TOKEN, PHONE_LOGIN_SWITCH_FAILED } from '@chatic/auth';
export { cancelPhoneLogin, confirmPhoneLogin, retryPhoneLogin } from '@chatic/runtime-client';
export type { PhoneLoginResult } from '@chatic/auth';
export { logoutSession } from '@chatic/runtime-client';
export { useRuntimeProfile } from './hooks/session/readers/useRuntimeProfile';
export type { SessionProfile } from './hooks/session/readers/useRuntimeProfile';
export { authFailureReaction } from '@chatic/transport';
export type { AuthFailureReactionFn, IAuthFailureReaction } from '@chatic/transport';
