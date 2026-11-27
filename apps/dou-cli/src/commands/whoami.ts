import { readSession } from '@chatic/runtime/api';

import type { CommandContext } from '../cli';

export const whoamiCommand = async ({ io }: CommandContext): Promise<number> => {
    const { context, auth } = readSession();
    const { activeServer, identity } = context;
    io.out(
        JSON.stringify({
            signedIn: auth.isAuthenticated,
            userId: identity.userId,
            delegatorId: identity.delegatorId,
            activeServer:
                activeServer.kind === 'cloud'
                    ? { kind: 'cloud', cloudId: activeServer.cloudId, siteId: activeServer.siteId }
                    : { kind: 'relay', siteId: activeServer.siteId },
        })
    );
    return 0;
};
