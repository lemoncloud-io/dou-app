import type { AppMessageData, OAuthLoginProvider, OAuthLoginResult } from '@chatic/bridge-messages';

import type { HostOs, ShellOrBrowser } from './ports';

export interface SignInPort {
    readonly kind: ShellOrBrowser;
    readonly os: HostOs;
    readonly sessionScope: 'device' | 'tab';
    readonly approvesPairing: boolean;
    readonly requestsPairing: boolean;
    readonly providerSignIn: ProviderSignIn | null;
    readonly relayOAuth: RelayOAuth | null;
}

export interface ProviderSignIn {
    readonly providers: readonly OAuthLoginProvider[];
    start(provider: OAuthLoginProvider): void;
    onResult(listener: (outcome: AppMessageData<'OnOAuthLogin'>) => void): () => void;
    credential(provider: OAuthLoginProvider): Promise<OAuthLoginResult | null>;
}

export interface RelayOAuth {
    openAuthorize(url: string): void;
    readonly returnedCode: 'complete' | 'handoff';
    readonly handoffLinks: HandoffLinks | null;
}

export interface HandoffLinks {
    subscribe(listener: (deeplink: string) => void): () => void;
}
