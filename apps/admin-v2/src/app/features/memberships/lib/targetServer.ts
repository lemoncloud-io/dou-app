/**
 * `lib/memberships/targetServer.ts`
 * - Which relay the console is pointed at, and how to point it somewhere else.
 *
 * This screen writes, and either stage is one switch away in every build. So the target is shown on
 * the screen and again in the confirmation dialog.
 *
 * The session's own relay is `VITE_DOU_ENDPOINT` (`https://host/dou-d1`), the same value the http
 * client resolves for the `relay` route; each stage's relay is its own `VITE_<STAGE>_RELAY_ENDPOINT`
 * key. Neither is `VITE_BACKEND_ENDPOINT` (`https://host/d1`), which is a different service — aiming
 * these calls there returns 404 for every route.
 */
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

/**
 * The relay of a stage, from its own env key (`VITE_D1_RELAY_ENDPOINT` · `VITE_V1_RELAY_ENDPOINT`).
 * Empty when that key is unset, so callers can refuse to fire.
 */
export const relayEndpointFor = (stage: RelayStage): string => stageEndpoint('relay', stage);

/** The stage an endpoint's trailing `dou-XX` segment names, or undefined when it names neither. */
export const relayStageOf = (endpoint: string | undefined): RelayStage | undefined => {
    const stage = (endpoint ?? '')
        .trim()
        .replace(/\/+$/, '')
        .match(/\/dou-([^/]*)$/)?.[1];
    return stage === 'v1' || stage === 'd1' ? stage : undefined;
};

/**
 * Stage read off the endpoint's `dou-XX` segment. An endpoint following neither convention is
 * reported as unknown rather than guessed at — guessing "dev" on a production URL is the expensive
 * direction to be wrong in.
 */
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

/** The stage the session's own relay is on. Calls on it go out without an override. */
export const sessionStage = (): RelayStage => sessionRelayStage();

/** Where calls on `stage` actually go. */
export const targetEndpointFor = (stage: RelayStage): string => relayTargetFor(stage);

/** The endpoint override for a chosen stage, or `undefined` to leave the call alone — see `relayOverrideFor`. */
export const endpointOverrideFor = (stage: RelayStage): string | undefined => relayOverrideFor(stage);
