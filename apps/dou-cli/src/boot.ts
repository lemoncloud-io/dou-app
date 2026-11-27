import { mkdirSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';

import { createWebEnvAdapter } from '@chatic/config';
import { readSessionDeviceId } from '@chatic/runtime/api';
import {
    authNode,
    cacheMemory,
    defineRuntime,
    foregroundNode,
    headlessModules,
    hostNode,
    nodeHostFacts,
    startRuntime,
    storageFile,
    transportNode,
} from '@chatic/runtime-node';

import { nodeDataDirectory } from './profile';

export const USER_AGENT = 'dou-cli/0.0.1';

export interface Booted {
    stop(): Promise<void>;
}

export interface BootOptions {
    profile: string;
    writeLine: (line: string) => void;
    env?: Record<string, string | undefined>;
    sockets?: boolean;
}

export type Boot = (options: BootOptions) => Promise<Booted>;

export const readEnvFile = (path: string): Record<string, string | undefined> => parseEnv(readFileSync(path, 'utf8'));

export const bootNode: Boot = async ({ profile, writeLine, env = process.env, sockets = false }) => {
    const directory = nodeDataDirectory(profile);
    mkdirSync(directory, { recursive: true });
    const values: Record<string, string | undefined> = { VITE_ENV: 'dev', ...env };
    const started = await startRuntime(
        defineRuntime({
            name: 'dou-cli',
            facts: nodeHostFacts({ userAgent: USER_AGENT }),
            modules: headlessModules(),
            ports: {
                storage: { default: storageFile(directory) },
                transport: { default: transportNode() },
                auth: { default: authNode() },
                cache: { default: cacheMemory },
                foreground: { default: foregroundNode },
            },
            host: hostNode({ writeLine }),
            config: { env: createWebEnvAdapter(name => values[name]) },
        })
    );
    const stops: (() => void)[] = [];
    const engine = started.engine;
    if (sockets && engine) {
        const deviceId = () => readSessionDeviceId();
        const session = engine.sessionController({ deviceId });
        const connection = engine.connectionController({ deviceId });
        void session.initialize();
        stops.push(connection.startBackground());
        let socketsStarted = false;
        const startSockets = (): void => {
            if (socketsStarted || !session.isReady()) return;
            socketsStarted = true;
            stops.push(connection.startSockets());
        };
        stops.push(session.subscribeReady(startSockets));
        startSockets();
    }
    return {
        stop: async () => {
            stops.reverse().forEach(stop => stop());
            stops.length = 0;
        },
    };
};
