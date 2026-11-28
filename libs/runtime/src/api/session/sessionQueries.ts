import type { MyInviteView, LoginUserBody } from '@lemoncloud/chatic-backend-api';
import type { VerifyNativeTokenBody } from '@lemoncloud/chatic-backend-api/dist/modules/auth/oauth2/oauth2-types';

import type { InviteLogin, SessionAccountView } from '@chatic/auth';
import { config } from '@chatic/config';
import { startPerfTrace } from '@chatic/perf';

import { cloudsKeys } from '../data/queryKeys';
import { fetchInviteInfoWithCode } from './authLookups';
import { registerUserWithInviteCode, sessionCommands } from './sessionCommands';

export const SWITCH_SITE_MUTATION_KEY = ['session', 'switch-site'] as const;

export const SWITCH_CLOUD_MUTATION_KEY = ['session', 'switch-cloud'] as const;

export interface SessionQuery<T> {
    queryKey: readonly unknown[];
    queryFn: () => Promise<T>;
    enabled: boolean;
    staleTime: number;
    refetchOnWindowFocus: boolean;
}

export interface SessionMutation<TData, TVariables> {
    mutationKey?: readonly unknown[];
    mutationFn: (variables: TVariables) => Promise<TData>;
    invalidates: readonly (readonly unknown[])[];
}

export const inviteInfoQuery = (
    code: string | null | undefined,
    backend: string | undefined,
    authenticated: boolean
): SessionQuery<MyInviteView> => {
    const endpoint = backend || (config.get<string>('net.relay.backend') ?? '');
    return {
        queryKey: ['inviteInfo', code, endpoint],
        queryFn: () => fetchInviteInfoWithCode(code as string, endpoint),
        enabled: authenticated && !!code && !!endpoint,
        staleTime: 0,
        refetchOnWindowFocus: false,
    };
};

export type LoginVariables = LoginUserBody & { email?: boolean };

export const loginMutation: SessionMutation<SessionAccountView, LoginVariables> = {
    mutationFn: ({ email, ...body }) => sessionCommands().loginUser(body, { email }),
    invalidates: [cloudsKeys.all],
};

export const loginRelayGuestByDeviceMutation: SessionMutation<SessionAccountView, string> = {
    mutationFn: deviceId => sessionCommands().loginGuestByDevice(deviceId),
    invalidates: [],
};

export const loginRelaySocialMutation: SessionMutation<
    SessionAccountView,
    { body: VerifyNativeTokenBody; provider?: string | null }
> = {
    mutationFn: ({ body, provider }) => sessionCommands().loginBySocialToken(body, provider),
    invalidates: [],
};

export const inviteFlowMutation = (
    delegatorId: string | null | undefined
): SessionMutation<InviteLogin, { code: string; backend?: string }> => ({
    mutationFn: async ({ code, backend }) => {
        if (!delegatorId) {
            throw new Error('No delegatorId for invite flow');
        }
        return registerUserWithInviteCode(code, delegatorId, backend);
    },
    invalidates: [],
});

export const logoutCloudSessionMutation: SessionMutation<void, void> = {
    mutationFn: () => sessionCommands().logoutCloud(),
    invalidates: [],
};

export const siteSwitchMutation: SessionMutation<void, string> = {
    mutationKey: SWITCH_SITE_MUTATION_KEY,
    mutationFn: siteId => sessionCommands().switchSite(siteId),
    invalidates: [],
};

export const switchCloudSessionMutation: SessionMutation<void, { cloudId: string; inviteLogin?: InviteLogin }> = {
    mutationKey: SWITCH_CLOUD_MUTATION_KEY,
    mutationFn: ({ cloudId, inviteLogin }) =>
        sessionCommands().switchCloud(cloudId, inviteLogin ? { inviteLogin } : undefined),
    invalidates: [],
};

export const traceCloudSwitch = async (run: () => Promise<unknown>): Promise<void> => {
    const trace = startPerfTrace('cloud_switch');
    try {
        await run();
        trace.putAttribute('outcome', 'ok');
        trace.stop();
    } catch (error) {
        trace.putAttribute('outcome', 'error');
        trace.stop();
        throw error;
    }
};
