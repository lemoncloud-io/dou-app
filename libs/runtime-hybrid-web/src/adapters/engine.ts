import type { AdapterId, EngineAdapter, EngineContext } from '@chatic/runtime-client';
import type { RuntimeEngine } from '@chatic/runtime-core';
import type { WebHostFacts } from '@chatic/runtime-web';

import { logHybridChoice, refusalOf } from '../candidates';
import { createBridgedRuntime } from '../createBridgedRuntime';
import { settleSessionOwner } from '../settleSessionOwner';
import type { SessionOwnerChoice, SessionOwnerOptions } from '../settleSessionOwner';

export type EngineCandidateOutcome<Owner> =
    | { readonly taken: true; readonly engine: RuntimeEngine | null; readonly owner?: Owner; readonly because: string }
    | { readonly taken: false; readonly owner?: Owner; readonly because: string };

export interface EngineCandidate<Facts, Owner> {
    readonly id: AdapterId<'engine'>;
    readonly supports?: (facts: Facts) => boolean;
    readonly create: (context: EngineContext<Facts>) => Promise<EngineCandidateOutcome<Owner>>;
}

export const engineCandidates = <Facts, Owner>(
    id: AdapterId<'engine'>,
    candidates: readonly EngineCandidate<Facts, Owner>[]
): EngineAdapter<Facts, Owner> => ({
    id,
    port: 'engine',
    create: async context => {
        let owner: Owner | undefined;
        const refusals: string[] = [];
        const withOwner = () => (owner !== undefined ? { owner } : {});
        for (const candidate of candidates) {
            if (!(candidate.supports?.(context.facts) ?? true)) {
                refusals.push(refusalOf(candidate.id, 'not supported here'));
                continue;
            }
            const outcome = await candidate.create(context);
            if (outcome.owner !== undefined) owner = outcome.owner;
            if (outcome.taken) {
                logHybridChoice(
                    'engine',
                    outcome.engine ? candidate.id : 'none',
                    [outcome.because, ...refusals].join('; ')
                );
                return { engine: outcome.engine, ...withOwner() };
            }
            refusals.push(refusalOf(candidate.id, outcome.because));
        }
        logHybridChoice('engine', 'none', refusals.join('; '));
        return { engine: null, ...withOwner() };
    },
});

export interface EngineShellOptions extends Omit<SessionOwnerOptions, 'offer'> {
    settle?: (options: SessionOwnerOptions) => Promise<SessionOwnerChoice>;
}

const whyThePageOwns = (facts: WebHostFacts, disabled: boolean | undefined): string => {
    if (facts.runtimeOffer === undefined) return 'the host offers no runtime';
    if (disabled) return "the page's session mirror is switched off";
    return 'the shell left the session to the page';
};

export const engineShell = ({ settle = settleSessionOwner, ...options }: EngineShellOptions = {}): EngineCandidate<
    WebHostFacts,
    SessionOwnerChoice
> => ({
    id: 'engine.shell',
    create: async ({ facts }) => {
        const owner = await settle({ ...options, offer: facts.runtimeOffer });
        switch (owner.sessionOwner) {
            case 'native':
                return {
                    taken: true,
                    engine: createBridgedRuntime({ hello: owner.hello, port: owner.port }),
                    owner,
                    because: `the shell holds the session (contract ${owner.contract})`,
                };
            case 'web':
                return { taken: false, owner, because: whyThePageOwns(facts, options.disabled) };
            default:
                return {
                    taken: true,
                    engine: null,
                    owner,
                    because: `no owner settled after ${owner.attempts} attempt(s): ${owner.lastFailure}`,
                };
        }
    },
});

export const engineLocal: EngineCandidate<WebHostFacts, SessionOwnerChoice> = {
    id: 'engine.local',
    create: async ({ core }) => ({
        taken: true,
        engine: await core({ sessionOwner: 'web' }),
        because: 'the page runs the session',
    }),
};

export type EngineMirrorOptions = EngineShellOptions;

export const engineMirror = (options: EngineMirrorOptions = {}): EngineAdapter<WebHostFacts, SessionOwnerChoice> =>
    engineCandidates('engine.mirror', [engineShell(options), engineLocal]);
