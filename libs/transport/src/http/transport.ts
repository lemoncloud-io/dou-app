import { logger } from '@chatic/bridges';
import { config } from '@chatic/config';
import { createRequestTransport } from '@chatic/http';
import { relayStore } from '@chatic/session';

import type { RequestTransport, SigningCredential } from '@chatic/http';

/**
 * The runtime's relay HTTP transport — built in `@chatic/http`, bound here to the session and config.
 *
 * It keeps nothing: each signed request reads the relay token's credential and identity token from
 * the session at that moment (`relayStore`), so there is one copy of the credential — the session's —
 * and a token the socket renewed is used by the very next request. The region comes from
 * `@chatic/config`, read per request as well, so this module is inert until something sends.
 */
let transport: RequestTransport | null = null;

/** The relay token's AWS credential, as the signer takes it. */
const relayCredential = (): SigningCredential | null => {
    const credential = relayStore.getRelayToken()?.Token?.credential;
    if (!credential?.AccessKeyId || !credential.SecretKey) return null;
    return {
        accessKey: credential.AccessKeyId,
        secretKey: credential.SecretKey,
        sessionToken: credential.SessionToken,
    };
};

/**
 * The lemon project id, suffixed for a local build. `env.stage` (not `env.buildStage`) on purpose —
 * picking a project suffix for local debugging is not a security decision.
 */
const lemonProject = (): string => {
    const stage = config.get<string>('env.stage') ?? 'LOCAL';
    const project = config.get<string>('env.project') ?? '';
    return stage === 'LOCAL' ? `${project}_local` : project;
};

/**
 * The prefix of every key lemon-web-core used to write: `@<project>.<name>`. Nothing writes there any
 * more; the logout and boot clean-up of a bundle an older build left in web storage still looks for it.
 */
export const legacyLemonKeyPrefix = (): string => `@${lemonProject()}.`;

const getTransport = (): RequestTransport => {
    transport ??= createRequestTransport({
        credential: relayCredential,
        identityToken: () => relayStore.getRelayToken()?.Token?.identityToken ?? null,
        region: () => config.get<string>('env.region') ?? 'ap-northeast-2',
        // Debug, not warn: lemon-web-core told only the console, and a signed call made before sign-in
        // would otherwise fill the uploaded log. A refusal that follows is classified and logged on its own.
        onUnsigned: () =>
            logger.debug('HTTP', '[transport] no relay credential — the signed request goes out unsigned'),
    });
    return transport;
};

/** The relay transport. Written out rather than re-exported so the instance is built on first use. */
export const webTransport: RequestTransport = {
    buildRequest: requestConfig => getTransport().buildRequest(requestConfig),
    buildSignedRequest: requestConfig => getTransport().buildSignedRequest(requestConfig),
};
