import {
    createHttpDataSources as createDataHttpDataSources,
    type HttpDataSources,
    type HttpGatewayBundle,
} from '@chatic/data';

import {
    cloudGateway,
    oauthGateway,
    pairingGateway,
    reportGateway,
    subscriptionGateway,
    userGateway,
} from '@chatic/transport';

export const createHttpDataSources = (): { httpDataSources: HttpDataSources } => {
    const gateways: HttpGatewayBundle = {
        auth: oauthGateway(),
        user: userGateway(),
        cloud: cloudGateway(),
        subscription: subscriptionGateway(),
        report: reportGateway(),
        pairing: pairingGateway(),
    };

    return { httpDataSources: createDataHttpDataSources({ gateways }) };
};
