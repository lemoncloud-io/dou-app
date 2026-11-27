import { createAgentTools, runtimeBackend } from '@chatic/agent-tools';
import { readSession } from '@chatic/runtime/api';
import { runtime } from '@chatic/runtime';

import { harnessTools } from './harnessTools';
import { createMcpHandler } from './server';
import type { RpcMethod } from './server';
import { readSettingsFile } from './settingsFile';
import { listenMcp } from './socket';
import { shellLink } from './shellLink';

export const MCP_NAME = 'dou';

export const statusMethods = (): Record<string, RpcMethod> => ({
    'dou/status': async () => {
        const { context, auth } = readSession();
        const { activeServer, identity } = context;
        return {
            signedIn: auth.isAuthenticated,
            userId: identity.userId,
            activeServer:
                activeServer.kind === 'cloud' ? { kind: 'cloud', cloudId: activeServer.cloudId } : { kind: 'relay' },
        };
    },
    'dou/clouds': async () => {
        const { pairing, context } = readSession();
        return {
            active: context.activeServer.kind === 'cloud' ? context.activeServer.cloudId : null,
            clouds: pairing.cloudIds.map(cloudId => ({ cloudId, name: pairing.cloudNames[cloudId] ?? null })),
        };
    },
});

export const startMcp = async (profile: string, version: string): Promise<() => Promise<void>> => {
    const getSettings = readSettingsFile(profile);
    const agent = createAgentTools({ backend: runtimeBackend(runtime), getSettings });
    const handler = createMcpHandler({
        tools: [...agent.tools, ...harnessTools(shellLink(profile), getSettings)],
        name: MCP_NAME,
        version,
        methods: statusMethods(),
    });
    const listener = await listenMcp(profile, handler);
    return async () => {
        await listener.close();
        agent.dispose();
    };
};
