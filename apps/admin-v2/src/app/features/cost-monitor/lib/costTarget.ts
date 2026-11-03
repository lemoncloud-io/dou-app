/**
 * `lib/cost-monitor/costTarget.ts`
 * - Which goods and relay services the cost monitor reads, for one stage.
 *
 * Each stage's goods service and relay come from their own env keys (`VITE_<STAGE>_GOODS_ENDPOINT`,
 * `VITE_<STAGE>_RELAY_ENDPOINT`). An unset key leaves that stage unconfigured rather than
 * guessed.
 */
import { stageEndpoint } from '../../../config/stageEndpoints';

export const COST_STAGES = ['d1', 'v1'] as const;

export type CostStage = (typeof COST_STAGES)[number];

export const isCostStage = (value: string): value is CostStage => COST_STAGES.some(stage => stage === value);

export const COST_STAGE_LABEL: Record<CostStage, string> = { v1: 'Production', d1: 'Development' };

export interface CostBases {
    goods: string;
    relay: string;
}

/** Every base for a stage. Empty strings when a key is unset, so callers can refuse to fire. */
export const costBasesFor = (stage: CostStage): CostBases => ({
    goods: stageEndpoint('goods', stage),
    relay: stageEndpoint('relay', stage),
});

/**
 * The stage the screen opens on: the relay stage the `.env` signs in to. Anything that is not plainly
 * `dou-v1` opens on development, as the deploy screen does.
 */
export const initialCostStage = (endpoint: string | undefined): CostStage =>
    /\/dou-v1$/.test((endpoint ?? '').trim().replace(/\/+$/, '')) ? 'v1' : 'd1';

export const configuredRelayEndpoint = (): string | undefined => import.meta.env.VITE_DOU_ENDPOINT;
