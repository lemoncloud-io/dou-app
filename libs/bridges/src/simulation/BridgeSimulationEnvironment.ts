import type {
    AppMessageData,
    AppMessageType,
    WebMessageData,
    WebMessageHandlerMap,
    WebMessageType,
} from '@chatic/app-messages';
import { AppBridgeHost, type IAppBridgeHost } from '../app';
import { bridgeProvider, type BridgeProvider } from '../provider';
import { JsonProtocol } from '../common';
import { BRIDGE_PROTOCOL_VERSION } from '../version';
import { WebBridgeClient, type IWebBridgeClient } from '../web';
import { InMemoryBridgeTransport, type InMemoryBridgeTransportConfig } from './InMemoryBridgeTransport';

export interface BridgeSimulationEnvironmentConfig extends InMemoryBridgeTransportConfig {
    version?: string;
    timeoutMs?: number;
    handlers?: WebMessageHandlerMap;
}

export interface BridgeSimulationEnvironment {
    webClient: IWebBridgeClient;
    appHost: IAppBridgeHost;
    transport: InMemoryBridgeTransport;
    registerHandler: IAppBridgeHost['registerHandler'];
    unregisterHandler: IAppBridgeHost['unregisterHandler'];
    pushEvent: IAppBridgeHost['pushEvent'];
}

export interface ActiveBridgeSimulationEnvironment extends BridgeSimulationEnvironment {
    restore: () => void;
}

export const createBridgeSimulationEnvironment = (
    config: BridgeSimulationEnvironmentConfig = {}
): BridgeSimulationEnvironment => {
    const version = config.version ?? BRIDGE_PROTOCOL_VERSION;
    const transport = new InMemoryBridgeTransport(config);
    const appHost = new AppBridgeHost({
        version,
        protocol: JsonProtocol,
        sendToWeb: message => {
            const decoded = JsonProtocol.decode(message);
            if (decoded) {
                transport.receiveMessageFromApp(decoded as any);
            }
        },
    });

    const webClient = new WebBridgeClient({
        adapter: transport,
        version,
        timeoutMs: config.timeoutMs,
        isBridgeAvailable: () => true,
    });

    transport.connectApp(message => {
        void appHost.handleMessage(JsonProtocol.encode(message) as string);
    });

    Object.entries(config.handlers ?? {}).forEach(([type, handler]) => {
        if (handler) appHost.registerHandler(type as WebMessageType, handler as any);
    });

    return {
        webClient,
        appHost,
        transport,
        registerHandler: appHost.registerHandler.bind(appHost) as <K extends WebMessageType>(
            type: K,
            handler: (message: WebMessageData<K>) => any
        ) => void,
        unregisterHandler: appHost.unregisterHandler.bind(appHost),
        pushEvent: appHost.pushEvent.bind(appHost) as <K extends AppMessageType>(message: AppMessageData<K>) => void,
    };
};

export const activateBridgeSimulationEnvironment = (
    config: BridgeSimulationEnvironmentConfig = {},
    provider: BridgeProvider = bridgeProvider
): ActiveBridgeSimulationEnvironment => {
    const environment = createBridgeSimulationEnvironment(config);
    const restore = provider.useBridgeEnvironment(environment);

    return {
        ...environment,
        restore,
    };
};
