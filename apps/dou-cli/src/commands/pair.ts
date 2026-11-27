import { pairNode } from '@chatic/host-node';

import type { CommandContext } from '../cli';

export const pairCommand = async ({ io, signal }: CommandContext): Promise<number> => {
    const ended = await pairNode({ writeLine: io.out, signal });
    if (ended.phase === 'done') {
        io.out(JSON.stringify({ paired: true, target: ended.target }));
        return 0;
    }
    io.err(`pairing ${ended.phase}`);
    return 1;
};
