import { readSession } from '@chatic/runtime/api';

import type { CommandContext } from '../cli';

export const cloudsCommand = async ({ io }: CommandContext): Promise<number> => {
    const { pairing, context } = readSession();
    const active = context.activeServer.kind === 'cloud' ? context.activeServer.cloudId : null;
    io.out(
        JSON.stringify({
            active,
            clouds: pairing.cloudIds.map(cloudId => ({ cloudId, name: pairing.cloudNames[cloudId] ?? null })),
        })
    );
    return 0;
};
