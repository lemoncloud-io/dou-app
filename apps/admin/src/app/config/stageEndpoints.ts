import { webConfigPorts } from '../../config/adapters/config';

export type ServiceStage = 'd1' | 'v1';

export type StageService = 'relay' | 'goods' | 'archive' | 'presence' | 'ws';

export const stageEndpointKey = (service: StageService, stage: ServiceStage): string =>
    `VITE_${stage.toUpperCase()}_${service.toUpperCase()}_ENDPOINT`;

export const readStageEndpoint = (
    read: (name: string) => string | undefined,
    service: StageService,
    stage: ServiceStage
): string => `${read(stageEndpointKey(service, stage)) ?? ''}`.trim().replace(/\/+$/, '');

export const openingStage = (): ServiceStage => (webConfigPorts.env.stage() === 'PROD' ? 'v1' : 'd1');

export const stageEndpoint = (service: StageService, stage: ServiceStage): string =>
    readStageEndpoint(name => webConfigPorts.env.raw(name), service, stage);

export const sessionRelayEndpoint = (): string =>
    `${webConfigPorts.env.raw('VITE_DOU_ENDPOINT') ?? ''}`.trim().replace(/\/+$/, '');

export const sessionRelayStage = (): ServiceStage => (/\/dou-v1$/.test(sessionRelayEndpoint()) ? 'v1' : 'd1');

export const relayOverrideFor = (stage: ServiceStage): string | undefined => {
    if (stage === sessionRelayStage()) return undefined;
    const endpoint = stageEndpoint('relay', stage);
    if (!endpoint) throw new Error(`${stageEndpointKey('relay', stage)} is not set — no relay to call on ${stage}.`);
    return endpoint;
};

export const relayTargetFor = (stage: ServiceStage): string =>
    stage === sessionRelayStage() ? sessionRelayEndpoint() : stageEndpoint('relay', stage);
