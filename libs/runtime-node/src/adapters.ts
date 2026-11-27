import type { Adapter, HostAdapter, HostPortDeclarations, HostPortName, PortName } from '@chatic/runtime/declare';
import { memoryDbPorts } from '@chatic/db-memory';
import { nodeHostPorts } from '@chatic/host-node';
import type { NodeHostOptions } from '@chatic/host-node';
import type { HostPorts, RuntimePorts } from '@chatic/ports';
import { fileStoragePorts } from '@chatic/storage-file';
import { memoryStoragePorts } from '@chatic/storage-memory';

import { nodeAuthPorts } from './auth';
import type { NodeAuthOptions } from './auth';
import { nodeForegroundPorts } from './foreground';
import type { NodeHostFacts } from './hostFacts';
import { nodeTransportPorts } from './transport';
import type { NodeWebSocketConstructor } from './transport';

export type NodeAdapter<P extends PortName> = Adapter<P, RuntimePorts[P], NodeHostFacts>;

export const transportNode = (options: { WebSocket?: NodeWebSocketConstructor } = {}): NodeAdapter<'transport'> => ({
    id: 'transport.node',
    port: 'transport',
    create: ({ facts }) => nodeTransportPorts({ userAgent: facts.userAgent, WebSocket: options.WebSocket }),
});

export const foregroundNode: NodeAdapter<'foreground'> = {
    id: 'foreground.node',
    port: 'foreground',
    create: () => nodeForegroundPorts(),
};

export const authNode = (options: NodeAuthOptions = {}): NodeAdapter<'auth'> => ({
    id: 'auth.node',
    port: 'auth',
    create: () => nodeAuthPorts(options),
});

export const storageFile = (directory: string): NodeAdapter<'storage'> => ({
    id: 'storage.file',
    port: 'storage',
    create: () => fileStoragePorts(directory),
});

export const storageMemory: NodeAdapter<'storage'> = {
    id: 'storage.memory',
    port: 'storage',
    create: () => memoryStoragePorts(),
};

export const cacheMemory: NodeAdapter<'cache'> = {
    id: 'cache.memory',
    port: 'cache',
    create: () => memoryDbPorts(),
};

export const hostNode = (options: NodeHostOptions = {}): HostPortDeclarations<NodeHostFacts> => {
    let ports: HostPorts | undefined;
    const member = <P extends HostPortName>(port: P): { default: HostAdapter<P, HostPorts[P], NodeHostFacts> } => ({
        default: {
            id: `${port}.node`,
            port,
            create: () => (ports ??= nodeHostPorts(options))[port],
        },
    });
    return {
        checkout: member('checkout'),
        media: member('media'),
        files: member('files'),
        links: member('links'),
        appShell: member('appShell'),
        signIn: member('signIn'),
        diagnostics: member('diagnostics'),
        push: member('push'),
    };
};
