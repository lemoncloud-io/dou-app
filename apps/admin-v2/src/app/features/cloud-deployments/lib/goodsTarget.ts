/**
 * `lib/cloud-deployments/goodsTarget.ts`
 * - Which goods service the deploy screen calls, and how that target is shown.
 *
 * There is no env key for the goods service. It sits on the same host as the relay, so its base is
 * rebuilt from `VITE_DOU_ENDPOINT` (`https://host/dou-d1`) by swapping the `dou-XX` segment for
 * `cgs-XX`. Should the goods service ever move to another host, this is the one place that stops
 * being true.
 *
 * The goods stage is not the cloud stage. A subscription cloud marked `dev` still lives on the
 * production goods service, so the stage picked here says nothing about which clouds get deployed.
 */
export const GOODS_STAGES = ['d1', 'v1'] as const;

export type GoodsStage = (typeof GOODS_STAGES)[number];

export const isGoodsStage = (value: string): value is GoodsStage => GOODS_STAGES.some(stage => stage === value);

export interface GoodsTarget {
    endpoint: string;
    isProd: boolean;
    label: string;
}

export const GOODS_STAGE_LABEL: Record<GoodsStage, string> = { v1: 'Production', d1: 'Development' };

/** The configured relay endpoint with its `dou-XX` segment removed, e.g. `https://api.example.com`. */
export const goodsHost = (endpoint: string | undefined): string =>
    (endpoint ?? '')
        .trim()
        .replace(/\/+$/, '')
        .replace(/\/dou-[^/]*$/, '');

/** The goods base for a stage. Empty when nothing is configured, so callers can refuse to fire. */
export const goodsBaseFor = (endpoint: string | undefined, stage: GoodsStage): string => {
    const host = goodsHost(endpoint);
    return host ? `${host}/cgs-${stage}` : '';
};

/**
 * The relay that holds the DoU record of the clouds a goods stage deploys: the one of the same stage.
 * Measured: every production cloud on `cgs-v1` that has a DoU record has it on `dou-v1`. The same
 * swap as the memberships console's `relayBaseFor`, copied rather than imported — features here do
 * not import from each other.
 */
export const douBaseFor = (endpoint: string | undefined, stage: GoodsStage): string => {
    const host = goodsHost(endpoint);
    return host ? `${host}/dou-${stage}` : '';
};

/** What the header badge and the confirmation dialog name as the target. */
export const describeGoodsTarget = (endpoint: string | undefined, stage: GoodsStage): GoodsTarget => ({
    endpoint: goodsBaseFor(endpoint, stage) || '(not configured)',
    isProd: stage === 'v1',
    label: GOODS_STAGE_LABEL[stage],
});

/**
 * The stage the screen opens on: the relay stage the `.env` names. Anything that is not plainly
 * `dou-v1` opens on development — guessing production is the expensive direction to be wrong in.
 */
export const initialGoodsStage = (endpoint: string | undefined): GoodsStage =>
    /\/dou-v1$/.test((endpoint ?? '').trim().replace(/\/+$/, '')) ? 'v1' : 'd1';

export const configuredRelayEndpoint = (): string | undefined => import.meta.env.VITE_DOU_ENDPOINT;
