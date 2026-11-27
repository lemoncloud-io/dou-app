import { pairNode } from '@chatic/host-node';

import type { CommandContext } from '../cli';

export const pairCommand = async ({ io, signal }: CommandContext): Promise<number> => {
    const ended = await pairNode({ writeLine: io.out, signal }).catch(error => {
        if (signal.aborted) return null;
        throw error;
    });
    if (!ended) {
        io.err('pairing aborted');
        return 130;
    }
    if (ended.phase === 'done') {
        io.out(JSON.stringify({ paired: true, target: ended.target }));
        return 0;
    }
    io.err(
        ended.phase === 'failed' && ended.status ? `pairing failed (status ${ended.status})` : `pairing ${ended.phase}`
    );
    return 1;
};
