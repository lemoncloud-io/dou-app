/**
 * `lib/cloud-deployments/goodsTarget.ts`
 * - Which goods service the deploy screen calls, and how that target is shown.
 *
 * Each stage's goods service and relay come from their own env keys (`VITE_<STAGE>_GOODS_ENDPOINT`,
 * `VITE_<STAGE>_RELAY_ENDPOINT`). An unset key leaves that stage unconfigured rather than guessed.
 *
 * The goods stage is not the cloud stage. A subscription cloud marked `dev` still lives on the
 * production goods service, so the stage picked here says nothing about which clouds get deployed.
 */
import { stageEndpoint } from '../../../config/stageEndpoints';

export const GOODS_STAGES = ['d1', 'v1'] as const;

export type GoodsStage = (typeof GOODS_STAGES)[number];

export const isGoodsStage = (value: string): value is GoodsStage => GOODS_STAGES.some(stage => stage === value);

export interface GoodsTarget {
    endpoint: string;
    isProd: boolean;
    label: string;
}

export const GOODS_STAGE_LABEL: Record<GoodsStage, string> = { v1: 'Production', d1: 'Development' };

/** The goods base for a stage. Empty when its key is unset, so callers can refuse to fire. */
export const goodsBaseFor = (stage: GoodsStage): string => stageEndpoint('goods', stage);

/**
 * The relay that holds the DoU record of the clouds a goods stage deploys: the one of the same stage.
 * Measured: every production cloud on `cgs-v1` that has a DoU record has it on `dou-v1`.
 */
export const douBaseFor = (stage: GoodsStage): string => stageEndpoint('relay', stage);

/** What the header badge and the confirmation dialog name as the target. */
export const describeGoodsTarget = (stage: GoodsStage): GoodsTarget => ({
    endpoint: goodsBaseFor(stage) || '(not configured)',
    isProd: stage === 'v1',
    label: GOODS_STAGE_LABEL[stage],
});
