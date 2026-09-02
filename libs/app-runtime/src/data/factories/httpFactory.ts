import {
    createHttpDataSources as createDataHttpDataSources,
    type HttpDataSources,
    type HttpGatewayBundle,
} from '@chatic/data';

import { cloudGateway, oauthGateway, reportGateway, subscriptionGateway, userGateway } from '../../http/gateways';

/**
 * Assembles the HTTP gateway bundle and hands back the `data-source` bundle built on it —
 * `socketFactory`'s counterpart for HTTP (ADR-0070 결정 4·5, 2단계 후반). Gateways are not
 * returned: every caller goes through a repository (ADR-0036), so the bundle exists only long
 * enough to build the data sources — same rule `socketFactory.createSocketDataSources` follows.
 *
 * `getHttpManager` used to live in this file, which is how `session/auth` came to import `data` just
 * to reach the HTTP client. It now lives in `http/factory.ts` and the gateway instances are shared
 * from `http/gateways.ts`, so what remains here is only data's own bundle.
 */
export const createHttpDataSources = (): { httpDataSources: HttpDataSources } => {
    const gateways: HttpGatewayBundle = {
        // Token/credential-producing actions (login · exchangeToken · delegateCloud ·
        // registerDevice) are absent from these Pick<>-narrowed bundle types — `data` never gets a
        // handle on them even though the shared instance carries them.
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
