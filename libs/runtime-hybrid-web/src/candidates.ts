import { logger } from '@chatic/logger';
import { RUNTIME_PORT_LOG_TAG } from '@chatic/runtime-client';

export interface Candidate<Context> {
    readonly id: string;
    readonly supports?: (context: Context) => boolean;
    readonly because: string;
    readonly refused?: string;
}

export interface CandidateChoice<C> {
    readonly chosen: C;
    readonly reason: string;
}

export const refusalOf = (id: string, because: string): string => `not ${id}: ${because}`;

export const chooseCandidate = <Context, C extends Candidate<Context>>(
    candidates: readonly C[],
    context: Context
): CandidateChoice<C> => {
    const refusals: string[] = [];
    for (const candidate of candidates) {
        if (candidate.supports?.(context) ?? true) {
            return { chosen: candidate, reason: [candidate.because, ...refusals].join('; ') };
        }
        refusals.push(refusalOf(candidate.id, candidate.refused ?? 'not supported here'));
    }
    throw new Error(`[runtime-hybrid-web] no candidate fits — ${refusals.join('; ')}`);
};

export const HYBRID_LOG_PREFIX = '[hybrid]';

export const logHybridChoice = (slot: string, id: string, reason: string, data: Record<string, unknown> = {}): void =>
    logger.info(RUNTIME_PORT_LOG_TAG, `${HYBRID_LOG_PREFIX} ${slot} → ${id} (${reason})`, {
        data: { slot, id, reason, ...data },
    });
