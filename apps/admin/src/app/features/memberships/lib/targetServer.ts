import {
    relayOverrideFor,
    relayTargetFor,
    sessionRelayEndpoint,
    sessionRelayStage,
    stageEndpoint,
} from '../../../config/stageEndpoints';

export type RelayStage = 'v1' | 'd1';

export const RELAY_STAGES: RelayStage[] = ['d1', 'v1'];

export interface TargetServer {
    endpoint: string;
    isProd: boolean;
    label: string;
}

const STAGE_LABEL: Record<RelayStage, string> = { v1: 'Production', d1: 'Development' };

export const relayEndpointFor = (stage: RelayStage): string => stageEndpoint('relay', stage);

export const relayStageOf = (endpoint: string | undefined): RelayStage | undefined => {
    const stage = (endpoint ?? '')
        .trim()
        .replace(/\/+$/, '')
        .match(/\/dou-([^/]*)$/)?.[1];
    return stage === 'v1' || stage === 'd1' ? stage : undefined;
};

export const describeTargetServer = (endpoint: string | undefined): TargetServer => {
    const url = (endpoint ?? '').trim().replace(/\/+$/, '');
    if (!url) {
        return { endpoint: '(not configured)', isProd: false, label: 'Unknown' };
    }

    const stage = relayStageOf(url);
    if (stage) {
        return { endpoint: url, isProd: stage === 'v1', label: STAGE_LABEL[stage] };
    }

    return { endpoint: url, isProd: false, label: 'Unknown' };
};

export const configuredEndpoint = (): string | undefined => sessionRelayEndpoint() || undefined;

export const sessionStage = (): RelayStage => sessionRelayStage();

export const targetEndpointFor = (stage: RelayStage): string => relayTargetFor(stage);

export const endpointOverrideFor = (stage: RelayStage): string | undefined => relayOverrideFor(stage);
