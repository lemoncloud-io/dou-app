import type { MyInviteView } from '@lemoncloud/chatic-backend-api';

export interface InviteParams {
    provider?: string;
    code: string | null;
    backend?: string;
    version?: string;
    relay?: true;
}

export type InviteInfo = MyInviteView & {
    cloudId?: string;
    cloudName?: string;
    site$?: MyInviteView['site$'] & { intro?: string; thumbnail?: string };
    inviter$?: MyInviteView['inviter$'] & { image?: string; nick?: string };
    channelName?: string;
    memberCount?: number;
    expiredAt?: number;
};

export interface InviteContext {
    params: InviteParams;
    info?: InviteInfo;
}

export const parseInviteDeeplink = (search: string): InviteParams => {
    const params = new URLSearchParams(search);
    const opt = (key: string): string | undefined => params.get(key) ?? undefined;
    return {
        provider: opt('provider'),
        code: params.get('code'),
        backend: opt('_backend'),
        version: opt('_version'),
        relay: params.has('relay') ? true : undefined,
    };
};

export const isInviteEntry = (params: InviteParams): boolean =>
    params.provider === 'invite' && !!params.code && (!!params.backend || !!params.relay);

export const isRelayInvite = (params: InviteParams): boolean => isInviteEntry(params) && !!params.relay;
