import {
    createHttpDataSources as createDataHttpDataSources,
    type HttpDataSources,
    type HttpGatewayBundle,
} from '@chatic/data';

import { cloudGateway, oauthGateway, reportGateway, subscriptionGateway, userGateway } from '../../http/gateways';

/**
 * Assembles the HTTP gateway bundle and hands back the `data-source` bundle built on it —
 * `socketFactory`'s counterpart for HTTP (ADR-0070 Decision 4·5, late Step 2). Gateways are not
 * returned: every caller goes through a repository (ADR-0036), so the bundle exists only long
 * enough to build the data sources — same rule `socketFactory.createSocketDataSources` follows.
 *
 * `getHttpManager` used to live in this file, which is how `session/auth` came to import `data` just
 * to reach the HTTP client. It now lives in `http/factory.ts` and the gateway instances are shared
 * from `http/gateways.ts`, so what remains here is only data's own bundle.
 */
export const createHttpDataSources = (): { httpDataSources: HttpDataSources } => {
    const gateways: HttpGatewayBundle = {
        // The Pick<>-narrowed bundle type DOES carry the token-producing actions (login ·
        // exchangeToken · delegateCloud · registerDevice · verifyNativeToken). What holds is the
        // rule, not their absence: nothing under `data/` reads a `Token`, writes a store, or flips
        // auth state — responses pass through raw so `session/auth` can. See AuthHttpDomainGateway
        // and libs/data/docs/remote/http.md#gateway-pick.
        auth: oauthGateway(),
        user: userGateway(),
        cloud: cloudGateway(),
        subscription: subscriptionGateway(),
        // Diagnostics (user issue reports · log batches). Not domain data, but a data call — it
        // comes through the same path so nothing builds its own signed request any more.
        report: reportGateway(),
    };

    return { httpDataSources: createDataHttpDataSources({ gateways }) };
};
