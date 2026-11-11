/**
 * `model/endpoint-presets.ts`
 * - The sockets the Probe tab offers: each stage's own (`VITE_<STAGE>_WS_ENDPOINT`), with the v2 flag.
 */
import { openingStage, stageEndpoint, type ServiceStage } from '../../../config/stageEndpoints';

export interface EndpointPreset {
    stage: ServiceStage;
    label: string;
    wsUrl: string;
}

const LABELS: Record<ServiceStage, string> = { d1: 'DEV (d1)', v1: 'PROD (v1)' };

/** One preset per configured stage, development first. */
export const endpointPresets = (): EndpointPreset[] =>
    (['d1', 'v1'] as const)
        .map(stage => ({ stage, label: LABELS[stage], ws: stageEndpoint('ws', stage) }))
        .filter(preset => preset.ws)
        .map(({ stage, label, ws }) => ({ stage, label, wsUrl: `${ws}?v2` }));

/** The opening stage's socket, else the first configured one, else empty for the operator to fill. */
export const defaultWsUrl = (presets: EndpointPreset[] = endpointPresets()): string =>
    (presets.find(preset => preset.stage === openingStage()) ?? presets[0])?.wsUrl ?? '';
