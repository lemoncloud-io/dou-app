import { config } from '@chatic/config';
import { createRequestTransport } from '@chatic/http';
import { logger } from '@chatic/logger';
import { relayStore } from '@chatic/session';

import type { RequestTransport, SigningCredential } from '@chatic/http';

let transport: RequestTransport | null = null;

const relayCredential = (): SigningCredential | null => {
    const credential = relayStore.getRelayToken()?.Token?.credential;
    if (!credential?.AccessKeyId || !credential.SecretKey) return null;
    return {
        accessKey: credential.AccessKeyId,
        secretKey: credential.SecretKey,
        sessionToken: credential.SessionToken,
    };
};

const lemonProject = (): string => {
    const stage = config.get<string>('env.stage') ?? 'LOCAL';
    const project = config.get<string>('env.project') ?? '';
    return stage === 'LOCAL' ? `${project}_local` : project;
};

export const legacyLemonKeyPrefix = (): string => `@${lemonProject()}.`;

const getTransport = (): RequestTransport => {
    transport ??= createRequestTransport({
        credential: relayCredential,
        identityToken: () => relayStore.getRelayToken()?.Token?.identityToken ?? null,
        region: () => config.get<string>('env.region') ?? 'ap-northeast-2',
        onUnsigned: () =>
            logger.debug('HTTP', '[transport] no relay credential — the signed request goes out unsigned'),
    });
    return transport;
};

export const webTransport: RequestTransport = {
    buildRequest: requestConfig => getTransport().buildRequest(requestConfig),
    buildSignedRequest: requestConfig => getTransport().buildSignedRequest(requestConfig),
};
