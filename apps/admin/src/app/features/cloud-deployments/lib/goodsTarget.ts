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

export const goodsBaseFor = (stage: GoodsStage): string => stageEndpoint('goods', stage);

export const douBaseFor = (stage: GoodsStage): string => stageEndpoint('relay', stage);

export const describeGoodsTarget = (stage: GoodsStage): GoodsTarget => ({
    endpoint: goodsBaseFor(stage) || '(not configured)',
    isProd: stage === 'v1',
    label: GOODS_STAGE_LABEL[stage],
});
