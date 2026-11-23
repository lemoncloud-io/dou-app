import { RELAY_CLOUD_ID } from '@chatic/data';

import { webTransport } from './transport';

import { createHttpManager } from './HttpManager';
import { credentialFreshness } from '@chatic/session';
import type { ICredentialFreshness } from '@chatic/session';
import { credentialRecovery } from './credentialRecovery';

import type { HttpClient, HttpRoute } from '@chatic/http';
import type { CredentialStalenessPort } from './HttpManager';

class SessionCredentialAdapter implements CredentialStalenessPort {
    constructor(private readonly freshness: ICredentialFreshness) {}

    isStale(_route: HttpRoute): boolean {
        return this.freshness.isStale(RELAY_CLOUD_ID);
    }

    recover(route: HttpRoute): Promise<boolean> {
        return credentialRecovery.recover(route);
    }
}

let httpManager: HttpClient | null = null;

export const getHttpManager = (): HttpClient => {
    if (!httpManager) {
        httpManager = createHttpManager(webTransport, new SessionCredentialAdapter(credentialFreshness));
    }
    return httpManager;
};

export const resetHttpManager = (): void => {
    httpManager = null;
};
