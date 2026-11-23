import { stageEndpoint } from '../../../config/stageEndpoints';

export const COST_STAGES = ['d1', 'v1'] as const;

export type CostStage = (typeof COST_STAGES)[number];

export const isCostStage = (value: string): value is CostStage => COST_STAGES.some(stage => stage === value);

export const COST_STAGE_LABEL: Record<CostStage, string> = { v1: 'Production', d1: 'Development' };

export interface CostBases {
    goods: string;
    relay: string;
}

export const costBasesFor = (stage: CostStage): CostBases => ({
    goods: stageEndpoint('goods', stage),
    relay: stageEndpoint('relay', stage),
});

export const initialCostStage = (endpoint: string | undefined): CostStage =>
    /\/dou-v1$/.test((endpoint ?? '').trim().replace(/\/+$/, '')) ? 'v1' : 'd1';

export const configuredRelayEndpoint = (): string | undefined => import.meta.env.VITE_DOU_ENDPOINT;
