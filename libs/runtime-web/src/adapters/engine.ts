import type { EngineAdapter } from '@chatic/runtime-client';

import { createBridgedRuntime } from '../createBridgedRuntime';
import type { WebHostFacts } from '../hostFacts';
import { settleSessionOwner } from '../settleSessionOwner';
import type { SessionOwnerChoice, SessionOwnerOptions } from '../settleSessionOwner';

export interface EngineMirrorOptions extends Omit<SessionOwnerOptions, 'offer'> {
    settle?: (options: SessionOwnerOptions) => Promise<SessionOwnerChoice>;
}

export const engineMirror = ({ settle = settleSessionOwner, ...options }: EngineMirrorOptions = {}): EngineAdapter<
    WebHostFacts,
    SessionOwnerChoice
> => ({
    id: 'engine.mirror',
    port: 'engine',
    create: async ({ facts, core }) => {
        const owner = await settle({ ...options, offer: facts.runtimeOffer });
        switch (owner.sessionOwner) {
            case 'native':
                return { engine: createBridgedRuntime({ hello: owner.hello, port: owner.port }), owner };
            case 'web':
                return { engine: await core({ sessionOwner: 'web' }), owner };
            default:
                return { engine: null, owner };
        }
    },
});
